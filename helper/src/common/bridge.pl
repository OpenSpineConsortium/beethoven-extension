#!/usr/bin/perl
# The Beethoven bridge: the Perl host, for macOS and Linux.
#
# Chrome starts this program when Beethoven asks for it (native messaging) and speaks to it over
# stdin and stdout: every message is a 4-byte little-endian length followed by that many bytes of
# UTF-8 JSON. The bridge opens a TCP connection only to a host:port on its allowlist (the grid's
# ssh port, plus the few entries an installer may write to allow.txt beside this file) and carries
# bytes both ways as base64. Those bytes are an ssh session that Beethoven encrypts and checks
# itself, so the bridge cannot read them; it never logs them, holds no credential, runs no shell
# and starts no other program. It exits when Chrome closes its stdin.
#
# Core modules only, so the perl that ships with macOS (/usr/bin/perl) and with common Linux
# distributions runs it as is. There is no JSON module on purpose: Debian's minimal perl lacks
# JSON::PP, and every message of the protocol is a flat object, which the strict reader below
# handles.
#
# Protocol 1 (helper/README.md has the whole contract):
#   in : hello {v} | open {id, host, port} | data {id, b64} | close {id}
#   out: hello {v, helper, os, kind, runtime, allow} | opened {id} | data {id, b64}
#        | closed {id, reason} | error {id, reason}
# A connection that never opened ends with "error"; one that opened ends with "closed".

use strict;
use warnings;
use IO::Socket::INET ();
use IO::Select ();
use Socket qw(SOL_SOCKET SO_ERROR IPPROTO_TCP TCP_NODELAY);
use Errno qw(EAGAIN EWOULDBLOCK EINTR ECONNREFUSED ETIMEDOUT ENETUNREACH EHOSTUNREACH);
use MIME::Base64 qw(encode_base64 decode_base64);
use FindBin ();

our $VERSION = '1.0.0';
my $PROTOCOL = 1;
my $OS = $^O eq 'darwin' ? 'mac' : 'linux';
my @BUILTIN_ALLOW = ('grid.wayne.edu:22');

my $MAX_FRAME = 1024 * 1024;        # largest message accepted from Chrome
my $CHUNK = 49152;                  # bytes read per socket read: 64 KiB once in base64
my $MAX_CONN = 8;                   # one ssh session needs one; a few spare for retries
my $MAX_EXTRA_ALLOW = 8;            # entries read from allow.txt
my $CONNECT_TIMEOUT = 30;           # seconds; some Windows and campus resolvers take 10 s or more
my $CLOSE_FLUSH = 10;               # seconds a closed connection may take to send what is queued
my $LINGER = 2;                     # seconds to drain the peer after our side has shut down
my $HIGH_WATER = 8 * 1024 * 1024;   # stop reading Chrome while this much waits for the network
my $LOW_WATER = 2 * 1024 * 1024;    # and start again below this

$SIG{PIPE} = 'IGNORE';
binmode STDIN;
binmode STDOUT;

my @allow = load_allow();
my %allowed = map { $_ => 1 } @allow;

my %conns;        # id => connection the extension can still address
my @closing;      # connections the extension closed, still flushing or draining
my $inbuf = '';
my $queued = 0;   # bytes accepted from Chrome and not yet written to a socket
my $paused = 0;

sub load_allow {
    my @list = @BUILTIN_ALLOW;
    my $file = "$FindBin::RealBin/allow.txt";
    return @list unless -f $file;
    my $fh;
    open($fh, '<', $file) or return @list;
    my $extra = 0;
    while (my $line = <$fh>) {
        $line =~ s/#.*//s;
        $line =~ s/^\s+|\s+$//g;
        $line = lc $line;
        next unless $line =~ /^[a-z0-9.-]{1,253}:([0-9]{1,5})$/;
        next unless $1 >= 1 && $1 <= 65535;
        next if grep { $_ eq $line } @list;
        last if $extra >= $MAX_EXTRA_ALLOW;
        push @list, $line;
        $extra++;
    }
    close $fh;
    return @list;
}

# ---- output -------------------------------------------------------------------------------

sub send_msg {
    my ($json) = @_;
    my $frame = pack('V', length $json) . $json;
    my $off = 0;
    while ($off < length $frame) {
        my $n = syswrite(STDOUT, $frame, length($frame) - $off, $off);
        if (!defined $n) {
            next if $! == EINTR;
            finish(0);   # Chrome is gone
        }
        $off += $n;
    }
}

sub send_error  { send_msg('{"t":"error","id":"' . $_[0] . '","reason":"' . $_[1] . '"}') }
sub send_closed { send_msg('{"t":"closed","id":"' . $_[0] . '","reason":"' . $_[1] . '"}') }

sub send_hello {
    my $list = join(',', map { '"' . $_ . '"' } @allow);
    send_msg('{"t":"hello","v":' . $PROTOCOL . ',"helper":"' . $VERSION . '","os":"' . $OS
        . '","kind":"script","runtime":"perl","allow":[' . $list . ']}');
}

# ---- the strict reader for flat JSON objects ----------------------------------------------
# Returns { key => [type, value] } with type s (string), n (number), b (boolean) or z (null),
# or nothing when the text is not exactly one flat object. Nested values are refused: no
# message of the protocol has one.

my %ESC = ('"' => '"', '\\' => '\\', '/' => '/', b => "\b", f => "\f", n => "\n", r => "\r", t => "\t");

sub json_string {
    my ($ref) = @_;
    no warnings 'regexp';
    return unless $$ref =~ /\G"([^"\\]*(?:\\.[^"\\]*)*)"/gcs;
    my $raw = $1;
    return if $raw =~ /[\x00-\x1f]/;
    return $raw if index($raw, '\\') < 0;
    my $ok = 1;
    $raw =~ s{\\(?:(["\\/bfnrt])|u([0-9a-fA-F]{4})|(.))}{
        defined $1 ? $ESC{$1}
        : defined $2 ? (hex($2) < 0x80 ? chr(hex $2) : "\xEF\xBF\xBD")
        : do { $ok = 0; '' }
    }gse;
    return $ok ? $raw : undef;
}

sub parse_flat_json {
    my ($s) = @_;
    my %h;
    pos($s) = 0;
    return unless $s =~ /\G[ \t\r\n]*\{[ \t\r\n]*/gc;
    if ($s !~ /\G\}/gc) {
        while (1) {
            my $k = json_string(\$s);
            return unless defined $k;
            return unless $s =~ /\G[ \t\r\n]*:[ \t\r\n]*/gc;
            my $v;
            if ($s =~ /\G(?=")/gc) {
                my $str = json_string(\$s);
                return unless defined $str;
                $v = ['s', $str];
            } elsif ($s =~ /\G(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/gc) {
                $v = ['n', $1];
            } elsif ($s =~ /\G(true|false)/gc) {
                $v = ['b', $1 eq 'true' ? 1 : 0];
            } elsif ($s =~ /\Gnull/gc) {
                $v = ['z', undef];
            } else {
                return;
            }
            $h{$k} = $v;
            $s =~ /\G[ \t\r\n]*/gc;
            next if $s =~ /\G,[ \t\r\n]*/gc;
            last if $s =~ /\G\}/gc;
            return;
        }
    }
    return unless $s =~ /\G[ \t\r\n]*\z/gc;
    return \%h;
}

sub str_field {
    my ($m, $k) = @_;
    return (exists $m->{$k} && $m->{$k}[0] eq 's') ? $m->{$k}[1] : undef;
}

sub id_field {
    my $id = str_field($_[0], 'id');
    return (defined $id && $id =~ /^[A-Za-z0-9._:-]{1,64}\z/) ? $id : undef;
}

# ---- messages from Chrome -----------------------------------------------------------------

sub handle_frame {
    my ($frame) = @_;
    my $check = $frame;
    if (!utf8::decode($check)) { send_error('', 'bad_json'); return }
    my $m = parse_flat_json($frame);
    if (!$m) { send_error('', 'bad_json'); return }
    my $t = str_field($m, 't');
    if (!defined $t) { send_error(id_field($m) // '', 'bad_message'); return }
    if    ($t eq 'hello') { send_hello() }
    elsif ($t eq 'open')  { do_open($m) }
    elsif ($t eq 'data')  { do_data($m) }
    elsif ($t eq 'close') { do_close($m) }
    else                  { send_error(id_field($m) // '', 'unknown_type') }
}

sub errno_reason {
    my ($e) = @_;
    return 'refused'     if $e == ECONNREFUSED;
    return 'timeout'     if $e == ETIMEDOUT;
    return 'unreachable' if $e == ENETUNREACH || $e == EHOSTUNREACH;
    return 'connect_failed';
}

sub do_open {
    my ($m) = @_;
    my $id = id_field($m);
    if (!defined $id) { send_error('', 'bad_id'); return }
    if ($conns{$id}) { send_error($id, 'duplicate_id'); return }
    my $host = str_field($m, 'host');
    if (!defined $host || lc($host) !~ /^[a-z0-9.-]{1,253}\z/) { send_error($id, 'bad_host'); return }
    $host = lc $host;
    my $port = (exists $m->{port} && $m->{port}[0] eq 'n') ? $m->{port}[1] : undef;
    if (!defined $port || $port !~ /^[0-9]{1,5}\z/ || $port < 1 || $port > 65535) {
        send_error($id, 'bad_port');
        return;
    }
    $port += 0;
    # The allowlist is checked before any name lookup or connection.
    if (!$allowed{"$host:$port"}) { send_error($id, 'not_allowed'); return }
    if (keys(%conns) + @closing >= $MAX_CONN) { send_error($id, 'too_many'); return }
    local $@;
    my $sock = IO::Socket::INET->new(PeerAddr => $host, PeerPort => $port, Proto => 'tcp', Blocking => 0);
    if (!$sock) {
        send_error($id, ($@ =~ /hostname/i) ? 'dns' : errno_reason($! + 0));
        return;
    }
    $conns{$id} = { id => $id, sock => $sock, state => 'connecting', q => [], qoff => 0,
                    deadline => time + $CONNECT_TIMEOUT };
}

sub do_data {
    my ($m) = @_;
    my $id = id_field($m);
    if (!defined $id) { send_error('', 'bad_id'); return }
    my $c = $conns{$id};
    if (!$c) { send_error($id, 'unknown_id'); return }
    my $b64 = str_field($m, 'b64');
    if (!defined $b64 || length($b64) % 4 || $b64 !~ /^[A-Za-z0-9+\/]*={0,2}\z/) {
        send_error($id, 'bad_b64');
        return;
    }
    my $bytes = decode_base64($b64);
    return unless length $bytes;
    push @{$c->{q}}, $bytes;
    $queued += length $bytes;
    $paused = 1 if $queued > $HIGH_WATER;
    flush_conn($c) if $c->{state} eq 'open';
}

sub do_close {
    my ($m) = @_;
    my $id = id_field($m);
    if (!defined $id) { send_error('', 'bad_id'); return }
    my $c = delete $conns{$id};
    if (!$c) { send_error($id, 'unknown_id'); return }
    send_closed($id, 'local');
    if ($c->{state} eq 'connecting') { discard($c); return }
    # What the extension sent before closing still goes out, then our side shuts down.
    $c->{state} = 'closing';
    $c->{deadline} = time + $CLOSE_FLUSH;
    push @closing, $c;
    flush_conn($c);
}

# ---- sockets ------------------------------------------------------------------------------

sub unqueue_all {
    my ($c) = @_;
    my $left = 0;
    $left += length($_) for @{$c->{q}};
    $left -= $c->{qoff};
    $queued -= $left if $left > 0;
    $c->{q} = [];
    $c->{qoff} = 0;
    resume_check();
}

sub discard {
    my ($c) = @_;
    unqueue_all($c);
    close($c->{sock});
    $c->{state} = 'gone';
    @closing = grep { $_ != $c } @closing;
}

sub drop_conn {
    my ($c, $reason) = @_;
    delete $conns{$c->{id}} if $conns{$c->{id}} && $conns{$c->{id}} == $c;
    discard($c);
    send_closed($c->{id}, $reason);
}

sub resume_check { $paused = 0 if $paused && $queued < $LOW_WATER }

sub flush_conn {
    my ($c) = @_;
    while (@{$c->{q}}) {
        my $chunk = $c->{q}[0];
        my $n = syswrite($c->{sock}, $chunk, length($chunk) - $c->{qoff}, $c->{qoff});
        if (!defined $n) {
            return if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
            if ($c->{state} eq 'open') { drop_conn($c, 'reset') } else { discard($c) }
            return;
        }
        $c->{qoff} += $n;
        $queued -= $n;
        if ($c->{qoff} >= length $chunk) { shift @{$c->{q}}; $c->{qoff} = 0 }
    }
    resume_check();
    if ($c->{state} eq 'closing') {
        shutdown($c->{sock}, 1);
        $c->{state} = 'linger';
        $c->{deadline} = time + $LINGER;
    }
}

sub on_writable {
    my ($c) = @_;
    if ($c->{state} eq 'connecting') {
        my $opt = getsockopt($c->{sock}, SOL_SOCKET, SO_ERROR);
        my $e = defined $opt ? unpack('i', $opt) : 0;
        $e = ($! + 0) || ECONNREFUSED if !$e && !getpeername($c->{sock});
        if ($e) {
            delete $conns{$c->{id}};
            discard($c);
            send_error($c->{id}, errno_reason($e));
            return;
        }
        setsockopt($c->{sock}, IPPROTO_TCP, TCP_NODELAY, 1);
        $c->{state} = 'open';
        send_msg('{"t":"opened","id":"' . $c->{id} . '"}');
    }
    flush_conn($c) if $c->{state} eq 'open' || $c->{state} eq 'closing';
}

sub on_readable {
    my ($c) = @_;
    my $buf;
    my $n = sysread($c->{sock}, $buf, $CHUNK);
    if (!defined $n) {
        return if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR;
        if ($c->{state} eq 'open') { drop_conn($c, 'reset') } else { discard($c) }
        return;
    }
    if ($c->{state} ne 'open') {   # closed by the extension: drain and drop
        discard($c) if $n == 0;
        return;
    }
    if ($n == 0) { drop_conn($c, 'eof'); return }
    send_msg('{"t":"data","id":"' . $c->{id} . '","b64":"' . encode_base64($buf, '') . '"}');
}

sub read_stdin {
    my $n = sysread(STDIN, $inbuf, 65536, length $inbuf);
    if (!defined $n) {
        return if $! == EINTR || $! == EAGAIN;
        finish(0);
    }
    finish(0) if $n == 0;   # Chrome closed the pipe: Beethoven is gone
    while (length($inbuf) >= 4) {
        my $len = unpack('V', $inbuf);
        if ($len > $MAX_FRAME) { send_error('', 'too_large'); finish(1) }
        last if length($inbuf) < 4 + $len;
        my $frame = substr($inbuf, 4, $len);
        substr($inbuf, 0, 4 + $len, '');
        if ($len == 0) { send_error('', 'bad_json'); next }
        handle_frame($frame);
    }
}

sub check_deadlines {
    my $now = time;
    for my $c (values %conns) {
        if ($c->{state} eq 'connecting' && $now >= $c->{deadline}) {
            delete $conns{$c->{id}};
            discard($c);
            send_error($c->{id}, 'timeout');
        }
    }
    for my $c (@{[@closing]}) { discard($c) if $now >= $c->{deadline} }
}

sub finish {
    my ($code) = @_;
    for my $c (values %conns, @closing) { close($c->{sock}) }
    exit $code;
}

# ---- the loop -----------------------------------------------------------------------------

while (1) {
    my $r = IO::Select->new;
    my $w = IO::Select->new;
    my %by_handle;   # keyed by the handle's own string form, which stays valid after close
    $r->add(\*STDIN) unless $paused;
    for my $c (values %conns, @closing) {
        $by_handle{"$c->{sock}"} = $c;
        if ($c->{state} eq 'connecting') { $w->add($c->{sock}); next }
        $r->add($c->{sock}) if $c->{state} eq 'open' || $c->{state} eq 'linger';
        $w->add($c->{sock}) if @{$c->{q}} && ($c->{state} eq 'open' || $c->{state} eq 'closing');
    }
    my ($rr, $ww) = IO::Select->select($r, $w, undef, 1);
    if ($ww) {
        for my $h (@$ww) {
            my $c = $by_handle{"$h"};
            on_writable($c) if $c && $c->{state} ne 'gone';
        }
    }
    if ($rr) {
        for my $h (@$rr) {
            if ("$h" eq "" . \*STDIN) { read_stdin(); next }
            my $c = $by_handle{"$h"};
            on_readable($c) if $c && $c->{state} ne 'gone';
        }
    }
    check_deadlines();
}
