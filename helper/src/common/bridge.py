#!/usr/bin/env python3
# The Beethoven bridge: the Python host, used on Linux only when perl is missing.
#
# The same program as bridge.pl, line for line in behaviour: Chrome starts it (native messaging)
# and speaks to it over stdin and stdout with 4-byte little-endian lengths and UTF-8 JSON. It
# opens TCP only to a host:port on its allowlist (the grid's ssh port, plus the few entries an
# installer may write to allow.txt beside this file) and carries bytes both ways as base64. The
# bytes are an ssh session Beethoven encrypts and checks itself; the bridge never logs them, holds
# no credential, runs no shell and starts no other program. It exits when Chrome closes stdin.
# Standard library only; Python 3.6 or later.

import base64
import binascii
import errno
import os
import re
import selectors
import socket
import struct
import sys
import time
import json

VERSION = "1.0.0"
PROTOCOL = 1
BUILTIN_ALLOW = ["grid.wayne.edu:22"]

MAX_FRAME = 1024 * 1024
CHUNK = 49152
MAX_CONN = 8
MAX_EXTRA_ALLOW = 8
CONNECT_TIMEOUT = 30.0  # seconds; some resolvers take 10 s or more
CLOSE_FLUSH = 10.0
LINGER = 2.0
HIGH_WATER = 8 * 1024 * 1024
LOW_WATER = 2 * 1024 * 1024

ID_RE = re.compile(r"\A[A-Za-z0-9._:-]{1,64}\Z")
HOST_RE = re.compile(r"\A[a-z0-9.-]{1,253}\Z")
ALLOW_RE = re.compile(r"\A[a-z0-9.-]{1,253}:([0-9]{1,5})\Z")
B64_RE = re.compile(r"\A[A-Za-z0-9+/]*={0,2}\Z")

stdin = sys.stdin.buffer
stdout = sys.stdout.buffer


def load_allow():
    out = list(BUILTIN_ALLOW)
    path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "allow.txt")
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return out
    extra = 0
    for line in lines:
        line = line.split("#", 1)[0].strip().lower()
        m = ALLOW_RE.match(line)
        if not m or not (1 <= int(m.group(1)) <= 65535) or line in out:
            continue
        if extra >= MAX_EXTRA_ALLOW:
            break
        out.append(line)
        extra += 1
    return out


ALLOW = load_allow()
ALLOWED = set(ALLOW)


def send_msg(text):
    body = text.encode("ascii")
    try:
        stdout.write(struct.pack("<I", len(body)) + body)
        stdout.flush()
    except (BrokenPipeError, OSError):
        finish(0)


def send_error(cid, reason):
    send_msg('{"t":"error","id":"%s","reason":"%s"}' % (cid, reason))


def send_closed(cid, reason):
    send_msg('{"t":"closed","id":"%s","reason":"%s"}' % (cid, reason))


def send_hello():
    allow = ",".join('"%s"' % a for a in ALLOW)
    send_msg('{"t":"hello","v":%d,"helper":"%s","os":"linux","kind":"script","runtime":"python","allow":[%s]}'
             % (PROTOCOL, VERSION, allow))


class Conn:
    def __init__(self, cid, sock):
        self.id = cid
        self.sock = sock
        self.state = "connecting"
        self.q = []
        self.qoff = 0
        self.deadline = time.monotonic() + CONNECT_TIMEOUT


sel = selectors.DefaultSelector()
conns = {}
closing = []
inbuf = bytearray()
queued = 0
paused = False


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def id_field(m):
    v = m.get("id")
    return v if isinstance(v, str) and ID_RE.match(v) else None


def errno_reason(e):
    if e == errno.ECONNREFUSED:
        return "refused"
    if e == errno.ETIMEDOUT:
        return "timeout"
    if e in (errno.ENETUNREACH, errno.EHOSTUNREACH):
        return "unreachable"
    return "connect_failed"


def update_interest(c):
    if c.state == "gone":
        return
    ev = 0
    if c.state == "connecting":
        ev = selectors.EVENT_WRITE
    else:
        if c.state in ("open", "linger"):
            ev |= selectors.EVENT_READ
        if c.q and c.state in ("open", "closing"):
            ev |= selectors.EVENT_WRITE
    try:
        if ev:
            try:
                sel.modify(c.sock, ev, c)
            except KeyError:
                sel.register(c.sock, ev, c)
        else:
            try:
                sel.unregister(c.sock)
            except KeyError:
                pass
    except (ValueError, OSError):
        pass


def update_stdin():
    try:
        if paused:
            sel.unregister(stdin)
        else:
            sel.register(stdin, selectors.EVENT_READ, None)
    except (KeyError, ValueError):
        pass


def resume_check():
    global paused
    if paused and queued < LOW_WATER:
        paused = False
        update_stdin()


def discard(c):
    global queued
    left = sum(len(b) for b in c.q) - c.qoff
    if left > 0:
        queued -= left
    c.q = []
    c.qoff = 0
    try:
        sel.unregister(c.sock)
    except (KeyError, ValueError):
        pass
    try:
        c.sock.close()
    except OSError:
        pass
    c.state = "gone"
    if c in closing:
        closing.remove(c)
    resume_check()


def drop_conn(c, reason):
    if conns.get(c.id) is c:
        del conns[c.id]
    discard(c)
    send_closed(c.id, reason)


def flush_conn(c):
    global queued
    while c.q:
        chunk = c.q[0]
        try:
            n = c.sock.send(memoryview(chunk)[c.qoff:])
        except (BlockingIOError, InterruptedError):
            break
        except OSError:
            if c.state == "open":
                drop_conn(c, "reset")
            else:
                discard(c)
            return
        c.qoff += n
        queued -= n
        if c.qoff >= len(chunk):
            c.q.pop(0)
            c.qoff = 0
    resume_check()
    if c.state == "closing" and not c.q:
        try:
            c.sock.shutdown(socket.SHUT_WR)
        except OSError:
            pass
        c.state = "linger"
        c.deadline = time.monotonic() + LINGER
    update_interest(c)


def do_open(m):
    cid = id_field(m)
    if cid is None:
        return send_error("", "bad_id")
    if cid in conns:
        return send_error(cid, "duplicate_id")
    host = m.get("host")
    if not isinstance(host, str) or not HOST_RE.match(host.lower()):
        return send_error(cid, "bad_host")
    host = host.lower()
    port = m.get("port")
    if not is_int(port) or not (1 <= port <= 65535):
        return send_error(cid, "bad_port")
    # The allowlist is checked before any name lookup or connection.
    if "%s:%d" % (host, port) not in ALLOWED:
        return send_error(cid, "not_allowed")
    if len(conns) + len(closing) >= MAX_CONN:
        return send_error(cid, "too_many")
    try:
        infos = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        return send_error(cid, "dns")
    family, stype, proto, _, addr = infos[0]
    sock = socket.socket(family, stype, proto)
    sock.setblocking(False)
    err = sock.connect_ex(addr)
    if err not in (0, errno.EINPROGRESS, errno.EWOULDBLOCK, errno.EAGAIN):
        sock.close()
        return send_error(cid, errno_reason(err))
    c = Conn(cid, sock)
    conns[cid] = c
    update_interest(c)


def do_data(m):
    global queued, paused
    cid = id_field(m)
    if cid is None:
        return send_error("", "bad_id")
    c = conns.get(cid)
    if c is None:
        return send_error(cid, "unknown_id")
    b64 = m.get("b64")
    if not isinstance(b64, str) or len(b64) % 4 or not B64_RE.match(b64):
        return send_error(cid, "bad_b64")
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return send_error(cid, "bad_b64")
    if not data:
        return
    c.q.append(data)
    queued += len(data)
    if queued > HIGH_WATER and not paused:
        paused = True
        update_stdin()
    if c.state == "open":
        flush_conn(c)


def do_close(m):
    cid = id_field(m)
    if cid is None:
        return send_error("", "bad_id")
    c = conns.pop(cid, None)
    if c is None:
        return send_error(cid, "unknown_id")
    send_closed(cid, "local")
    if c.state == "connecting":
        return discard(c)
    # What the extension sent before closing still goes out, then our side shuts down.
    c.state = "closing"
    c.deadline = time.monotonic() + CLOSE_FLUSH
    closing.append(c)
    flush_conn(c)


def handle_frame(frame):
    try:
        m = json.loads(frame.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return send_error("", "bad_json")
    if not isinstance(m, dict) or any(isinstance(v, (dict, list)) for v in m.values()):
        return send_error("", "bad_json")
    t = m.get("t")
    if not isinstance(t, str):
        return send_error(id_field(m) or "", "bad_message")
    if t == "hello":
        send_hello()
    elif t == "open":
        do_open(m)
    elif t == "data":
        do_data(m)
    elif t == "close":
        do_close(m)
    else:
        send_error(id_field(m) or "", "unknown_type")


def on_writable(c):
    if c.state == "connecting":
        e = c.sock.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
        if not e:
            try:
                c.sock.getpeername()
            except OSError as ex:
                e = ex.errno or errno.ECONNREFUSED
        if e:
            del conns[c.id]
            discard(c)
            return send_error(c.id, errno_reason(e))
        c.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        c.state = "open"
        send_msg('{"t":"opened","id":"%s"}' % c.id)
    if c.state in ("open", "closing"):
        flush_conn(c)
    else:
        update_interest(c)


def on_readable(c):
    try:
        buf = c.sock.recv(CHUNK)
    except (BlockingIOError, InterruptedError):
        return
    except OSError:
        if c.state == "open":
            drop_conn(c, "reset")
        else:
            discard(c)
        return
    if c.state != "open":   # closed by the extension: drain and drop
        if not buf:
            discard(c)
        return
    if not buf:
        return drop_conn(c, "eof")
    send_msg('{"t":"data","id":"%s","b64":"%s"}' % (c.id, base64.b64encode(buf).decode("ascii")))


def read_stdin():
    try:
        chunk = os.read(stdin.fileno(), 65536)
    except InterruptedError:
        return
    except OSError:
        finish(0)
    if not chunk:
        finish(0)   # Chrome closed the pipe: Beethoven is gone
    inbuf.extend(chunk)
    while len(inbuf) >= 4:
        (n,) = struct.unpack_from("<I", inbuf, 0)
        if n > MAX_FRAME:
            send_error("", "too_large")
            finish(1)
        if len(inbuf) < 4 + n:
            break
        frame = bytes(inbuf[4:4 + n])
        del inbuf[:4 + n]
        if n == 0:
            send_error("", "bad_json")
            continue
        handle_frame(frame)


def check_deadlines():
    now = time.monotonic()
    for c in list(conns.values()):
        if c.state == "connecting" and now >= c.deadline:
            del conns[c.id]
            discard(c)
            send_error(c.id, "timeout")
    for c in list(closing):
        if now >= c.deadline:
            discard(c)


def finish(code):
    for c in list(conns.values()) + list(closing):
        try:
            c.sock.close()
        except OSError:
            pass
    os._exit(code)


def main():
    update_stdin()
    while True:
        for key, events in sel.select(timeout=1.0):
            if key.fileobj is stdin:
                read_stdin()
                continue
            c = key.data
            if c.state == "gone":
                continue
            if events & selectors.EVENT_WRITE:
                on_writable(c)
            if events & selectors.EVENT_READ and c.state != "gone":
                on_readable(c)
        check_deadlines()


if __name__ == "__main__":
    main()
