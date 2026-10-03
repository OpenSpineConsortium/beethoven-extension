// The Beethoven bridge, binary edition: carries bytes between Chrome (native messaging on stdio)
// and the grid's ssh port, and nothing else. Protocol 1, byte-for-byte the contract of the script
// hosts (helper/README.md "Behaviour every host shares"; helper/test/suite.mjs checks each item).
// The standard library alone: no crates, so the supply chain is rustc itself — the binary analogue
// of running on the system's own perl.
//
// Shape: one thread reads Chrome's frames from stdin; one thread owns stdout (whole frames only);
// each connection gets a connector, a socket-reader and a socket-writer thread. Backpressure is a
// global count of bytes accepted from Chrome but not yet written to a socket: past 8 MiB the stdin
// thread stops reading until it is back under 2 MiB, as the scripts do. A closed connection still
// flushing counts against the connection cap until its writer leaves (the scripts' @closing), and
// the close path's whole tail is capped: CLOSE_FLUSH for the queue, LINGER for the goodbye.
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

const PROTO_V: u64 = 1;
const HELPER_VERSION: &str = include_str!("../../../VERSION");
const MAX_FRAME: usize = 1024 * 1024; //        a declared length past this cannot be resynchronised
const CHUNK: usize = 49_152; //                 raw bytes per data message to Chrome
const MAX_CONN: usize = 8; //                   one ssh session needs one
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30); // name lookup included
const CLOSE_FLUSH: Duration = Duration::from_secs(10); //    queued bytes after close, then we give up
const LINGER: Duration = Duration::from_secs(2); //          the server's goodbye after half-close
const HIGH_WATER: usize = 8 * 1024 * 1024;
const LOW_WATER: usize = 2 * 1024 * 1024;
const BUILTIN_ALLOW: &str = "grid.wayne.edu:22";

// ---- the one stdout ---------------------------------------------------------------------------

#[derive(Clone)]
struct Out(Sender<Vec<u8>>);
impl Out {
    fn frame(&self, json: String) {
        let b = json.into_bytes();
        let mut f = Vec::with_capacity(4 + b.len());
        f.extend_from_slice(&(b.len() as u32).to_le_bytes());
        f.extend_from_slice(&b);
        let _ = self.0.send(f);
    }
    fn error(&self, id: &str, reason: &str) {
        self.frame(format!(r#"{{"t":"error","id":{},"reason":{}}}"#, json_str(id), json_str(reason)));
    }
    fn closed(&self, id: &str, reason: &str) {
        self.frame(format!(r#"{{"t":"closed","id":{},"reason":{}}}"#, json_str(id), json_str(reason)));
    }
}

// ---- backpressure: bytes accepted from Chrome, not yet on a socket ------------------------------

struct Water {
    queued: Mutex<usize>,
    cv: Condvar,
}
impl Water {
    fn add(&self, n: usize) {
        *self.queued.lock().unwrap() += n;
    }
    fn sub(&self, n: usize) {
        let mut q = self.queued.lock().unwrap();
        *q = q.saturating_sub(n);
        if *q < LOW_WATER {
            self.cv.notify_all();
        }
    }
    /** the stdin thread, before its next frame: past the high water it waits for the low */
    fn gate(&self) {
        let mut q = self.queued.lock().unwrap();
        if *q > HIGH_WATER {
            while *q >= LOW_WATER {
                q = self.cv.wait(q).unwrap();
            }
        }
    }
}

// ---- a connection -------------------------------------------------------------------------------

enum ToWriter {
    Bytes(Vec<u8>),
    /** close was answered: flush what is queued, shut the sending side, let the linger run */
    Finish,
}

struct Conn {
    /** bytes from Chrome before the socket is up */
    early: Vec<Vec<u8>>,
    writer: Option<Sender<ToWriter>>,
    sock: Option<TcpStream>,
    /** cleared by close/eof/reset: the reader emits no data and no second terminal message */
    live: Arc<AtomicBool>,
    /** close() while still connecting: the connector drops its socket and says nothing */
    cancel: Arc<AtomicBool>,
    /** set at close: the writer's hard deadline for the whole flush-and-linger tail */
    flush_by: Arc<Mutex<Option<Instant>>>,
    /** this closed-but-flushing connection still holds a cap slot until its writer leaves */
    counted: Arc<AtomicBool>,
}

type Table = Arc<Mutex<HashMap<String, Conn>>>;

struct Shared {
    out: Out,
    water: Arc<Water>,
    conns: Table,
    /** closed connections whose writer is still flushing: they hold their cap slot (README: ≤12 s) */
    closing: Arc<AtomicUsize>,
}
impl Shared {
    fn clone(&self) -> Shared {
        Shared { out: self.out.clone(), water: Arc::clone(&self.water), conns: Arc::clone(&self.conns), closing: Arc::clone(&self.closing) }
    }
}

fn main() {
    // Chrome passes its origin (and --parent-window on Windows); every host ignores argv
    let (out_tx, out_rx) = channel::<Vec<u8>>();
    let out = Out(out_tx);
    let out_thread = std::thread::spawn(move || stdout_loop(out_rx));
    let sh = Shared {
        out,
        water: Arc::new(Water { queued: Mutex::new(0), cv: Condvar::new() }),
        conns: Arc::new(Mutex::new(HashMap::new())),
        closing: Arc::new(AtomicUsize::new(0)),
    };
    let allow = allowlist();

    let code = stdin_loop(&sh, &allow);

    // stdin is closed (or the stream broke): close every socket and leave
    {
        let mut t = sh.conns.lock().unwrap();
        for (_, c) in t.drain() {
            c.live.store(false, Ordering::SeqCst);
            c.cancel.store(true, Ordering::SeqCst);
            if let Some(s) = c.sock {
                let _ = s.shutdown(Shutdown::Both);
            }
        }
    }
    drop(sh); // ends the stdout thread once the queue is written
    let _ = out_thread.join();
    std::process::exit(code);
}

fn stdout_loop(rx: Receiver<Vec<u8>>) {
    let so = std::io::stdout();
    let mut w = so.lock();
    while let Ok(f) = rx.recv() {
        if w.write_all(&f).is_err() {
            return; // Chrome went away; the stdin side will see it too
        }
        let _ = w.flush();
    }
}

fn stdin_loop(sh: &Shared, allow: &[String]) -> i32 {
    let si = std::io::stdin();
    let mut r = si.lock();
    let mut head = [0u8; 4];
    loop {
        sh.water.gate();
        match r.read_exact(&mut head) {
            Ok(()) => {}
            Err(_) => return 0, // Chrome closed its end: exit 0, sockets close behind us
        }
        let len = u32::from_le_bytes(head) as usize;
        if len > MAX_FRAME {
            sh.out.error("", "too_large");
            return 1; // the stream cannot be resynchronised
        }
        let mut body = vec![0u8; len];
        if r.read_exact(&mut body).is_err() {
            return 0;
        }
        let msg = match std::str::from_utf8(&body).ok().and_then(parse_flat) {
            Some(m) => m,
            None => {
                sh.out.error("", "bad_json");
                continue;
            }
        };
        let t = match msg.get("t").and_then(Value::as_str) {
            Some(t) => t.to_owned(),
            None => {
                // a message with no usable t still names its id, so the reply can be matched
                sh.out.error(msg.get("id").and_then(Value::as_str).unwrap_or(""), "bad_message");
                continue;
            }
        };
        match t.as_str() {
            "hello" => {
                let list = allow.iter().map(|a| json_str(a)).collect::<Vec<_>>().join(",");
                sh.out.frame(format!(
                    r#"{{"t":"hello","v":{},"helper":{},"os":{},"kind":"binary","runtime":"rust","allow":[{}]}}"#,
                    PROTO_V,
                    json_str(HELPER_VERSION.trim()),
                    json_str(OS),
                    list
                ));
            }
            "open" => do_open(&msg, sh, allow),
            "data" => do_data(&msg, sh),
            "close" => do_close(&msg, sh),
            _ => sh.out.error(msg.get("id").and_then(Value::as_str).unwrap_or(""), "unknown_type"),
        }
    }
}

#[cfg(target_os = "windows")]
const OS: &str = "windows";
#[cfg(target_os = "macos")]
const OS: &str = "mac";
#[cfg(all(unix, not(target_os = "macos")))]
const OS: &str = "linux";

// ---- commands -----------------------------------------------------------------------------------

fn good_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

/** the message's id when it has the contract's shape; a malformed one is not echoed back */
fn id_field(m: &Flat) -> Option<String> {
    match m.get("id").and_then(Value::as_str) {
        Some(i) if good_id(i) => Some(i.to_owned()),
        _ => None,
    }
}

fn do_open(m: &Flat, sh: &Shared, allow: &[String]) {
    let id = match id_field(m) {
        Some(i) => i,
        None => return sh.out.error("", "bad_id"),
    };
    let host = match m.get("host").and_then(Value::as_str) {
        Some(h) if !h.is_empty() && h.len() <= 255 && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-') => h.to_ascii_lowercase(),
        _ => return sh.out.error(&id, "bad_host"),
    };
    let port = match m.get("port").and_then(Value::as_port) {
        Some(p) => p,
        None => return sh.out.error(&id, "bad_port"),
    };
    // the allowlist speaks BEFORE any name lookup or connection
    let hp = format!("{host}:{port}");
    if !allow.iter().any(|a| a == &hp) {
        return sh.out.error(&id, "not_allowed");
    }
    let cancel;
    {
        let mut t = sh.conns.lock().unwrap();
        if t.contains_key(&id) {
            return sh.out.error(&id, "duplicate_id");
        }
        // a closed connection still flushing holds its slot (the scripts count @closing too)
        if t.len() + sh.closing.load(Ordering::SeqCst) >= MAX_CONN {
            return sh.out.error(&id, "too_many");
        }
        cancel = Arc::new(AtomicBool::new(false));
        t.insert(
            id.clone(),
            Conn {
                early: Vec::new(),
                writer: None,
                sock: None,
                live: Arc::new(AtomicBool::new(true)),
                cancel: Arc::clone(&cancel),
                flush_by: Arc::new(Mutex::new(None)),
                counted: Arc::new(AtomicBool::new(false)),
            },
        );
    }
    let sh2 = sh.clone();
    std::thread::spawn(move || connector(id, hp, sh2, cancel));
}

fn connector(id: String, hp: String, sh: Shared, cancel: Arc<AtomicBool>) {
    // std's connect_timeout wants an address, and its name lookup has no clock of its own: the
    // lookup and connect run on this thread, a watchdog holds the 30 s budget over both
    let (tx, rx) = channel::<Result<TcpStream, &'static str>>();
    let hp2 = hp.clone();
    let budget = Instant::now();
    std::thread::spawn(move || {
        let addrs = match hp2.to_socket_addrs() {
            Ok(a) => a.collect::<Vec<_>>(),
            Err(_) => {
                let _ = tx.send(Err("dns"));
                return;
            }
        };
        if addrs.is_empty() {
            let _ = tx.send(Err("dns"));
            return;
        }
        let mut last: &'static str = "connect_failed";
        for a in addrs {
            let left = CONNECT_TIMEOUT.saturating_sub(budget.elapsed());
            if left.is_zero() {
                let _ = tx.send(Err("timeout"));
                return;
            }
            match TcpStream::connect_timeout(&a, left) {
                Ok(s) => {
                    let _ = tx.send(Ok(s));
                    return;
                }
                Err(e) => {
                    last = match e.kind() {
                        ErrorKind::ConnectionRefused => "refused",
                        ErrorKind::TimedOut => "timeout",
                        ErrorKind::HostUnreachable | ErrorKind::NetworkUnreachable => "unreachable",
                        _ => "connect_failed",
                    }
                }
            }
        }
        let _ = tx.send(Err(last));
    });
    let got = rx.recv_timeout(CONNECT_TIMEOUT).unwrap_or(Err("timeout"));
    let sock = match got {
        Ok(s) => s,
        Err(reason) => {
            let early_len: usize;
            {
                let mut t = sh.conns.lock().unwrap();
                early_len = t.remove(&id).map(|c| c.early.iter().map(Vec::len).sum()).unwrap_or(0);
            }
            sh.water.sub(early_len);
            // close(local) beat the failure: its closed was said, and nothing may follow it
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            return sh.out.error(&id, reason);
        }
    };
    let (wtx, wrx) = channel::<ToWriter>();
    let live;
    let flush_by;
    let counted;
    {
        let mut t = sh.conns.lock().unwrap();
        let c = match t.get_mut(&id) {
            Some(c) => c,
            None => {
                // closed (or torn down) while we connected: the socket just goes, silently
                let _ = sock.shutdown(Shutdown::Both);
                return;
            }
        };
        live = Arc::clone(&c.live);
        flush_by = Arc::clone(&c.flush_by);
        counted = Arc::clone(&c.counted);
        c.sock = Some(sock.try_clone().expect("clone"));
        for b in c.early.drain(..) {
            let _ = wtx.send(ToWriter::Bytes(b));
        }
        c.writer = Some(wtx);
        // opened is said under the lock, so a racing close cannot say closed(local) first
        sh.out.frame(format!(r#"{{"t":"opened","id":{}}}"#, json_str(&id)));
    }
    let rsock = sock.try_clone().expect("clone");
    let (out_r, conns_r, id_r, live_r) = (sh.out.clone(), Arc::clone(&sh.conns), id.clone(), Arc::clone(&live));
    std::thread::spawn(move || sock_reader(rsock, id_r, out_r, conns_r, live_r));
    sock_writer(sock, wrx, id, sh, live, flush_by, counted);
}

fn sock_reader(mut s: TcpStream, id: String, out: Out, conns: Table, live: Arc<AtomicBool>) {
    let mut buf = [0u8; CHUNK];
    loop {
        match s.read(&mut buf) {
            Ok(0) => {
                // every byte the server sent went out above; one closed(eof) if we are first
                if live.swap(false, Ordering::SeqCst) {
                    conns.lock().unwrap().remove(&id);
                    out.closed(&id, "eof");
                }
                return;
            }
            Ok(n) => {
                if live.load(Ordering::SeqCst) {
                    out.frame(format!(r#"{{"t":"data","id":{},"b64":{}}}"#, json_str(&id), json_str(&b64_encode(&buf[..n]))));
                }
                // after a local close the drain just discards, until the writer's tail ends it
            }
            Err(_) => {
                if live.swap(false, Ordering::SeqCst) {
                    conns.lock().unwrap().remove(&id);
                    out.closed(&id, "reset");
                }
                return;
            }
        }
    }
}

/** every unwritten byte still in the channel goes back off the water count */
fn drain_rx(rx: &Receiver<ToWriter>, water: &Water) {
    while let Ok(m) = rx.try_recv() {
        if let ToWriter::Bytes(b) = m {
            water.sub(b.len());
        }
    }
}

/** a write that can be given up: once the close deadline is set, it is watched between chunks */
fn write_deadline(s: &TcpStream, mut buf: &[u8], flush_by: &Mutex<Option<Instant>>) -> std::io::Result<bool> {
    let mut armed = false;
    loop {
        if let Some(d) = *flush_by.lock().unwrap() {
            if Instant::now() >= d {
                return Ok(false); // the close tail ran out; the rest is abandoned
            }
            if !armed {
                // a short write timeout, so a server that stopped reading cannot pin this thread
                // past the deadline; before close, writes block as the backpressure design wants
                let _ = s.set_write_timeout(Some(Duration::from_millis(500)));
                armed = true;
            }
        }
        match (&*s).write(buf) {
            Ok(0) => return Err(ErrorKind::WriteZero.into()),
            Ok(n) if n >= buf.len() => return Ok(true),
            Ok(n) => buf = &buf[n..],
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) && armed => continue,
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
}

fn sock_writer(sock: TcpStream, rx: Receiver<ToWriter>, id: String, sh: Shared, live: Arc<AtomicBool>, flush_by: Arc<Mutex<Option<Instant>>>, counted: Arc<AtomicBool>) {
    let s = sock;
    let mut linger_at: Option<Instant> = None;
    loop {
        // the whole close tail — flush and linger alike — ends at the deadline close set
        if let Some(d) = *flush_by.lock().unwrap() {
            if Instant::now() >= d {
                break;
            }
        }
        if let Some(l) = linger_at {
            if Instant::now() >= l {
                break;
            }
        }
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(ToWriter::Bytes(b)) => {
                let n = b.len();
                let r = write_deadline(&s, &b, &flush_by);
                sh.water.sub(n);
                match r {
                    Ok(true) => {}
                    Ok(false) => break, // deadline: abandon the rest
                    Err(_) => {
                        if live.swap(false, Ordering::SeqCst) {
                            sh.conns.lock().unwrap().remove(&id);
                            sh.out.closed(&id, "reset");
                        }
                        break;
                    }
                }
            }
            Ok(ToWriter::Finish) => {
                // everything Chrome sent before its close is out: half-close, then the linger
                let _ = s.shutdown(Shutdown::Write);
                linger_at = Some(Instant::now() + LINGER);
            }
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = s.shutdown(Shutdown::Both);
    drain_rx(&rx, &sh.water);
    if counted.swap(false, Ordering::SeqCst) {
        sh.closing.fetch_sub(1, Ordering::SeqCst);
    }
}

fn do_data(m: &Flat, sh: &Shared) {
    let id = match id_field(m) {
        Some(i) => i,
        None => return sh.out.error("", "bad_id"),
    };
    let bytes = match m.get("b64").and_then(Value::as_str).and_then(b64_decode) {
        Some(b) => b,
        None => return sh.out.error(&id, "bad_b64"),
    };
    let mut t = sh.conns.lock().unwrap();
    let c = match t.get_mut(&id) {
        Some(c) => c,
        None => {
            drop(t);
            return sh.out.error(&id, "unknown_id");
        }
    };
    let n = bytes.len();
    sh.water.add(n);
    match &c.writer {
        Some(w) => {
            if w.send(ToWriter::Bytes(bytes)).is_err() {
                sh.water.sub(n); // writer already gone (its closed was said): the bytes never queue
            }
        }
        None => c.early.push(bytes), // held until the connection is up
    }
}

fn do_close(m: &Flat, sh: &Shared) {
    let id = match id_field(m) {
        Some(i) => i,
        None => return sh.out.error("", "bad_id"),
    };
    let mut t = sh.conns.lock().unwrap();
    let c = match t.remove(&id) {
        Some(c) => c,
        None => {
            drop(t);
            return sh.out.error(&id, "unknown_id");
        }
    };
    // closed(local) under the lock, after the remove: the id is free again, and a connector that
    // has not said opened yet can never say it after this
    sh.out.closed(&id, "local");
    c.live.store(false, Ordering::SeqCst);
    c.cancel.store(true, Ordering::SeqCst);
    *c.flush_by.lock().unwrap() = Some(Instant::now() + CLOSE_FLUSH + LINGER);
    drop(t);
    match c.writer {
        Some(w) => {
            // what Chrome sent still goes out, then our side shuts down and the linger runs; the
            // flushing connection keeps its cap slot until its writer leaves (README: at most 12 s)
            c.counted.store(true, Ordering::SeqCst);
            sh.closing.fetch_add(1, Ordering::SeqCst);
            if w.send(ToWriter::Finish).is_err() && c.counted.swap(false, Ordering::SeqCst) {
                sh.closing.fetch_sub(1, Ordering::SeqCst); // the writer left first; nothing to hold
            }
        }
        None => {
            // still connecting: the connector sees cancel and drops the socket silently
            sh.water.sub(c.early.iter().map(Vec::len).sum());
        }
    }
}

// ---- allow.txt beside the binary ----------------------------------------------------------------

fn allowlist() -> Vec<String> {
    let mut list = vec![BUILTIN_ALLOW.to_owned()];
    let beside = std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
        .and_then(|p| p.parent().map(|d| d.join("allow.txt")));
    if let Some(path) = beside {
        if let Ok(text) = std::fs::read_to_string(path) {
            for raw in text.lines() {
                // as the scripts read it: a # starts a comment anywhere, blanks are skipped, and
                // only well-shaped lower-cased host:port lines count — and only they use the cap
                let line = raw.split('#').next().unwrap_or("").trim().to_ascii_lowercase();
                if line.is_empty() {
                    continue;
                }
                if let Some(entry) = allow_entry(&line) {
                    if !list.contains(&entry) {
                        list.push(entry);
                        if list.len() >= 1 + 8 {
                            break;
                        }
                    }
                }
            }
        }
    }
    list
}

fn allow_entry(line: &str) -> Option<String> {
    let (host, port) = line.rsplit_once(':')?;
    if host.is_empty() || host.len() > 253 || !host.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-') {
        return None;
    }
    let p: u32 = port.parse().ok()?;
    if !(1..=65535).contains(&p) {
        return None;
    }
    Some(format!("{host}:{p}"))
}

// ---- flat JSON: one object of scalars, nothing nested --------------------------------------------

#[derive(Debug)]
#[allow(dead_code)] // Bool and Null are parsed as the contract's scalars; no command reads them
enum Value {
    Str(String),
    /** written as plain digits: the only number shape a port may take, as the scripts demand */
    Int(i64),
    Num(f64),
    Bool(bool),
    Null,
}
impl Value {
    fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }
    /** ports as the scripts take them: a JSON integer in range, never 22.0, "22" or true */
    fn as_port(&self) -> Option<u16> {
        match self {
            Value::Int(n) if (1..=65535).contains(n) => Some(*n as u16),
            _ => None,
        }
    }
}
type Flat = HashMap<String, Value>;

fn parse_flat(s: &str) -> Option<Flat> {
    let mut p = Parser { b: s.as_bytes(), i: 0 };
    p.ws();
    p.eat(b'{')?;
    let mut map = Flat::new();
    p.ws();
    if p.peek() == Some(b'}') {
        p.i += 1;
    } else {
        loop {
            p.ws();
            let key = p.string()?;
            p.ws();
            p.eat(b':')?;
            p.ws();
            let v = match p.peek()? {
                b'"' => Value::Str(p.string()?),
                b't' => {
                    p.lit(b"true")?;
                    Value::Bool(true)
                }
                b'f' => {
                    p.lit(b"false")?;
                    Value::Bool(false)
                }
                b'n' => {
                    p.lit(b"null")?;
                    Value::Null
                }
                b'{' | b'[' => return None, // flat objects only, as every host demands
                _ => p.number()?,
            };
            map.insert(key, v);
            p.ws();
            match p.next()? {
                b',' => continue,
                b'}' => break,
                _ => return None,
            }
        }
    }
    p.ws();
    if p.i != p.b.len() {
        return None;
    }
    if map.is_empty() {
        return None; // an empty message is bad_json on every host
    }
    Some(map)
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}
impl<'a> Parser<'a> {
    fn ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }
    fn next(&mut self) -> Option<u8> {
        let c = self.peek()?;
        self.i += 1;
        Some(c)
    }
    fn eat(&mut self, c: u8) -> Option<()> {
        (self.next()? == c).then_some(())
    }
    fn lit(&mut self, w: &[u8]) -> Option<()> {
        if self.b[self.i..].starts_with(w) {
            self.i += w.len();
            Some(())
        } else {
            None
        }
    }
    fn string(&mut self) -> Option<String> {
        self.eat(b'"')?;
        let mut s = String::new();
        loop {
            match self.next()? {
                b'"' => return Some(s),
                b'\\' => match self.next()? {
                    b'"' => s.push('"'),
                    b'\\' => s.push('\\'),
                    b'/' => s.push('/'),
                    b'b' => s.push('\u{8}'),
                    b'f' => s.push('\u{c}'),
                    b'n' => s.push('\n'),
                    b'r' => s.push('\r'),
                    b't' => s.push('\t'),
                    b'u' => {
                        let hi = self.hex4()?;
                        let cp = if (0xD800..0xDC00).contains(&hi) {
                            self.eat(b'\\')?;
                            self.eat(b'u')?;
                            let lo = self.hex4()?;
                            if !(0xDC00..0xE000).contains(&lo) {
                                return None;
                            }
                            0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
                        } else {
                            hi
                        };
                        s.push(char::from_u32(cp)?);
                    }
                    _ => return None,
                },
                c if c < 0x20 => return None,
                c if c < 0x80 => s.push(c as char),
                c => {
                    // UTF-8 continuation: lean on the validated source slice
                    let start = self.i - 1;
                    let len = match c {
                        0xC0..=0xDF => 2,
                        0xE0..=0xEF => 3,
                        0xF0..=0xF7 => 4,
                        _ => return None,
                    };
                    let end = start + len;
                    if end > self.b.len() {
                        return None;
                    }
                    s.push_str(std::str::from_utf8(&self.b[start..end]).ok()?);
                    self.i = end;
                }
            }
        }
    }
    fn hex4(&mut self) -> Option<u32> {
        let mut v = 0u32;
        for _ in 0..4 {
            v = v * 16 + (self.next()? as char).to_digit(16)?;
        }
        Some(v)
    }
    fn number(&mut self) -> Option<Value> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        while matches!(self.peek(), Some(b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-')) {
            self.i += 1;
        }
        let tok = std::str::from_utf8(&self.b[start..self.i]).ok()?;
        // plain digits stay exact; anything with a point or an exponent is a float, never a port
        if !tok.is_empty() && tok.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
            if let Ok(n) = tok.parse::<i64>() {
                return Some(Value::Int(n));
            }
        }
        tok.parse::<f64>().ok().map(Value::Num)
    }
}

fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// ---- strict padded base64 -------------------------------------------------------------------------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    if b.len() % 4 != 0 {
        return None;
    }
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some(u32::from(c - b'A')),
            b'a'..=b'z' => Some(u32::from(c - b'a') + 26),
            b'0'..=b'9' => Some(u32::from(c - b'0') + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(b.len() / 4 * 3);
    for (i, q) in b.chunks(4).enumerate() {
        let last = (i + 1) * 4 == b.len();
        let pads = q.iter().filter(|&&c| c == b'=').count();
        if pads > 2 || (!last && pads > 0) || (pads >= 1 && q[3] != b'=') || (pads == 2 && q[2] != b'=') {
            return None;
        }
        let n = (val(q[0])? << 18) | (val(q[1])? << 12) | (if pads >= 2 { 0 } else { val(q[2])? << 6 }) | (if pads >= 1 { 0 } else { val(q[3])? });
        out.push((n >> 16) as u8);
        if pads < 2 {
            out.push((n >> 8) as u8);
        }
        if pads < 1 {
            out.push(n as u8);
        }
        // strict: padded bits must be zero, so one encoding per byte string
        if (pads == 1 && (val(q[2])? & 0x3) != 0) || (pads == 2 && (val(q[1])? & 0xf) != 0) {
            return None;
        }
    }
    Some(out)
}
