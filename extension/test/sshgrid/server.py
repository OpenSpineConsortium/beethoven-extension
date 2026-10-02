#!/usr/bin/env python3
"""A stand-in for the Wayne State grid's ssh door, for Beethoven 12.0.0's tests. Never a credential store
beyond the fixed test values below; it listens on 127.0.0.1 only.

What it imitates (from what the grid answered on 2026-10-01, docs/V12_CONTRACT.md):
  - algorithms: kex curve25519-sha256 / ecdh-sha2-nistp256, an RSA host key, aes128/192/256-ctr, hmac-sha1;
  - methods publickey, password, keyboard-interactive; keyboard-interactive asks "Password: " and then
    "Your google authenticator one-time verification code: ", one prompt per request;
  - an account without Google Authenticator (user "nocode") gets, after its password, the grid's refusal as
    OpenSSH sends a PAM error: an INFO_REQUEST whose instruction is the text and which has no prompt;
  - a wrong password or code: USERAUTH_FAILURE, and the client may try again (MaxAuthTries 6);
  - a password session runs the enrolment line (browser-key add) and installs the key for this account, and
    runs `connect` as the Claude sign-in sitting (AUTH-URL, then reads the code on stdin);
  - a key session is forced to the gate (restrict: no pty) and answers its verbs from a small in-memory run.

Switches (JSON on argv[1]): {"split": n} sends every server write in chunks of n bytes (the receive loop's
stall); {"silent_after_kex": true} never answers after NEWKEYS; {"hostkey": "ed25519"}; {"slow_exec": s};
{"bashrc": text} printed before every key session's output (an account's ~/.bashrc); {"gate_limit": "names"}
makes the gate's connect answer framework 11's cap.
Prints one line "READY {json}" with the port and the host key's SHA256 fingerprint, then serves.
"""
import asyncio, base64, hashlib, json, sys
import asyncssh

CFG = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
PASSWORD = "pw-correct"
CODE = "864209"
USERS = {"st1234", "nocode", "ab1234"}
REFUSAL = ("You either typed in the wrong code, or you do not have Google Authenticator 2FA setup. "
           "Please try again, or login to OnDemand and run the 2FA Setup app.")
PW_PROMPT = "Password: "
CODE_PROMPT = "Your google authenticator one-time verification code: "

KEYS = {}            # user -> list of (keytype, base64) added by browser-key add
STATE = {"claude": "no", "job": "", "state": "", "forgotten": 0, "commands": []}


class Server(asyncssh.SSHServer):
    def connection_made(self, conn):
        self._conn = conn
        self._stage = 0
        self._user = None

    def begin_auth(self, username):
        self._user = username
        return True

    def password_auth_supported(self):
        return True

    def validate_password(self, username, password):
        return False  # the grid's PAM needs the code: plain password auth never succeeds

    def kbdint_auth_supported(self):
        return True

    def get_kbdint_challenge(self, username, lang, submethods):
        self._stage = 0
        return ("", "", "", ((PW_PROMPT, False),))

    def validate_kbdint_response(self, username, responses):
        if self._stage == 0:
            if username not in USERS or not responses or responses[0] != PASSWORD:
                return False
            if username == "nocode":
                self._stage = 9
                return ("", REFUSAL + "\n", "", ())
            self._stage = 1
            return ("", "", "", ((CODE_PROMPT, False),))
        if self._stage == 9:
            return False
        ok = bool(responses) and responses[0] == CODE
        if ok:
            self._conn.set_extra_info(beethoven_auth="password")
        return ok

    def public_key_auth_supported(self):
        return True

    def validate_public_key(self, username, key):
        for kt, b64 in KEYS.get(username, []):
            if key.export_public_key("openssh").split()[1].decode() == b64:
                self._conn.set_extra_info(beethoven_auth="key")
                return True
        return False


def gate(user, cmd):
    """the forced command's answer: (stdout, exit)"""
    STATE["commands"].append("gate " + cmd)
    t = cmd.split(" ")
    if not cmd or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- " for ch in cmd):
        return "HPCW-GATE refused\n", 126
    if t[0] == "version" and len(t) == 1:
        return "HPCW-GATE ok 11 never %s claude=%s\n" % (user, STATE["claude"]), 0
    if t[0] == "status" and len(t) == 2:
        if not STATE["job"]:
            return "", 1
        st = {"v": 1, "run": t[1], "job": STATE["job"], "next_job": "", "state_dir": "/rs/rs_grp_oschome/%s/hpcworker" % user,
              "status": {"state": STATE["state"] or "queued", "job": STATE["job"], "submitted_at": "2026-10-02T12:00:00Z"},
              "connection": None, "scheduler": {"state": "PENDING", "reason": "Priority", "expected_start": "", "node": "", "checked_at": "2026-10-02T12:00:30Z"},
              "line": "Your worker is in line for a computer (0 min so far)."}
        return json.dumps(st) + "\n", 0
    if t[0] == "read" and len(t) == 3:
        # framework 11's gate reads four files; rc.log (the worker's raw terminal) is refused
        if t[2] not in ("status.json", "connection.json", "progress.log", "node") or t[2] in CFG.get("refuse_read", []):
            return "HPCW-GATE refused\n", 126
        if not STATE["job"]:
            return "", 1
        if t[2] == "status.json":
            return json.dumps({"state": STATE["state"] or "queued", "job": STATE["job"], "submitted_at": "2026-10-02T12:00:00Z", "heartbeat_at": "2026-10-02T12:00:00Z"}) + "\n", 0
        if t[2] == "progress.log":
            return "2026-10-02T12:00:00Z Asked the grid for a computer\n", 0
        return "", 1
    if t[0] == "connect" and len(t) == 6:
        if CFG.get("gate_limit"):
            # framework 11's caps: "HPCW-GATE limit names|hourly|watch|busy", exit 123
            return "HPCW-GATE limit %s\n" % CFG["gate_limit"], 123
        STATE["job"] = "40501234"
        STATE["state"] = "queued"
        return ("HPCW-STEP setup ready\nHPCW-STEP consent\nHPCW-STEP queued 40501234 new /rs/rs_grp_oschome/%s/hpcworker/%s\n"
                "HPCW-STEP done\n" % (user, t[1])), 0
    if t[0] in ("stop", "restrict") and len(t) == 2:
        if t[0] == "stop":
            STATE["state"] = "stopped"
            return "worker %s: stopped (by request; the chain ended)\n" % t[1], 0
        return "worker %s: marked restricted (/rs/x/workspaces/%s/.restricted); it will not start there until the marker is removed\n" % (t[1], t[1]), 0
    if t[0] == "forget" and len(t) == 1:
        had = bool(KEYS.get(user))
        KEYS[user] = []
        STATE["forgotten"] += 1
        return ("HPCW-KEY forgotten\n" if had else "HPCW-KEY none\n"), 0
    return "HPCW-GATE refused\n", 126


async def handle(process):
    conn = process.channel.get_connection()
    user = conn.get_extra_info("username")
    how = conn.get_extra_info("beethoven_auth")
    cmd = process.command or ""
    if CFG.get("slow_exec"):
        await asyncio.sleep(CFG["slow_exec"])
    if how == "key":
        # restrict,command="… gate": the pty is refused by sshd; the command is SSH_ORIGINAL_COMMAND
        out, rc = gate(user, cmd)
        # {"bashrc": "..."}: what an account's ~/.bashrc prints before the forced command (seen with Ubuntu's bash under sshd)
        if CFG.get("bashrc"):
            process.stdout.write(CFG["bashrc"])
        process.stdout.write(out)
        process.exit(rc)
        return
    STATE["commands"].append(cmd)
    words = cmd.split()
    if len(words) >= 5 and words[2:4] == ["browser-key", "add"]:
        kt, b64 = words[4], words[5]
        KEYS.setdefault(user, [])
        KEYS[user] = [(kt, b64)]
        # framework 11's own line (lib/browser_key.sh): HPCW-KEY added SHA256:<the key's fingerprint>
        fp = base64.b64encode(hashlib.sha256(base64.b64decode(b64)).digest()).decode().rstrip("=")
        process.stdout.write("HPCW-KEY added SHA256:%s\n" % fp)
        process.exit(0)
        return
    if len(words) >= 4 and words[2:4] == ["install", "--shared"]:
        process.stdout.write("hpcworker: set up to use the shared copy\n")
        process.exit(0)
        return
    if " connect " in cmd:
        STATE["job"] = "40509876"
        STATE["state"] = "queued"
        process.stdout.write("HPCW-STEP setup ready\r\nHPCW-STEP consent\r\nHPCW-STEP queued 40509876 new /rs/rs_grp_oschome/%s/hpcworker/worker\r\nHPCW-STEP signin\r\n" % user)
        process.stdout.write("HPCW-LOGIN: on asx15; checking whether you are signed in already\r\n")
        process.stdout.write("AUTH-URL: https://claude.ai/oauth/authorize?code=true&client_id=test\r\n")
        process.stdout.write("HPCW-LOGIN: paste the code from that page\r\n")
        try:
            line = await asyncio.wait_for(process.stdin.readline(), 30)
        except asyncio.TimeoutError:
            process.stdout.write("HPCW-LOGIN-FAILED: no code arrived within 30 s\r\nHPCW-STEP failed signin-timeout the code did not come\r\n")
            process.exit(7)
            return
        code = line.strip()
        process.stdout.write("HPCW-LOGIN: code received, checking\r\n")
        if code == "goodcode-abcdef":
            STATE["claude"] = "yes"
            process.stdout.write("SIGNED-IN %s@wayne.edu max\r\nHPCW-STEP signed-in %s@wayne.edu max\r\nHPCW-STEP done\r\n" % (user, user))
            process.exit(0)
        else:
            process.stdout.write("HPCW-LOGIN-FAILED: Claude Code did not accept the code; copy it again\r\nHPCW-STEP failed signin-code the code was not accepted\r\n")
            process.exit(7)
        return
    if cmd == "sleep-forever":
        await asyncio.sleep(3600)
        process.exit(0)
        return
    if cmd.startswith("echo "):
        process.stdout.write(cmd[5:] + "\n")
        process.exit(0)
        return
    if cmd.startswith("BIG:"):
        n = int(cmd[4:])
        chunk = "x" * 4095 + "\n"
        sent = 0
        while sent < n:
            process.stdout.write(chunk)
            sent += len(chunk)
            await process.stdout.drain()
        process.exit(0)
        return
    if cmd == "cat":
        data = await process.stdin.read()
        process.stdout.write(data)
        process.exit(0)
        return
    process.stdout.write("unknown command\n")
    process.exit(127)


async def main():
    kt = CFG.get("hostkey", "rsa")
    host_key = asyncssh.generate_private_key("ssh-rsa" if kt == "rsa" else "ssh-ed25519", key_size=2048) if kt == "rsa" else asyncssh.generate_private_key("ssh-ed25519")
    blob = host_key.export_public_key("openssh").split()[1]
    fp = "SHA256:" + base64.b64encode(hashlib.sha256(base64.b64decode(blob)).digest()).decode().rstrip("=")
    opts = dict(
        server_host_keys=[host_key],
        process_factory=handle,
        kex_algs=["curve25519-sha256", "ecdh-sha2-nistp256"],
        encryption_algs=["aes128-ctr", "aes192-ctr", "aes256-ctr"],
        mac_algs=["hmac-sha1"],
        compression_algs=None,
        login_timeout=CFG.get("login_timeout", 120),
        allow_pty=True,
    )
    server = await asyncssh.create_server(Server, "127.0.0.1", 0, **opts)
    port = server.sockets[0].getsockname()[1]
    front = port
    if CFG.get("split"):
        # a TCP relay in front of the server that writes what the server says n bytes at a time
        n = int(CFG["split"])

        async def relay(r, w):
            br, bw = await asyncio.open_connection("127.0.0.1", port)

            async def c2s():
                try:
                    while True:
                        d = await r.read(65536)
                        if not d:
                            break
                        bw.write(d)
                        await bw.drain()
                finally:
                    bw.close()

            async def s2c():
                try:
                    while True:
                        d = await br.read(65536)
                        if not d:
                            break
                        for i in range(0, len(d), n):
                            w.write(d[i:i + n])
                            await w.drain()
                            await asyncio.sleep(0.001)
                finally:
                    w.close()

            await asyncio.gather(c2s(), s2c(), return_exceptions=True)

        rs = await asyncio.start_server(relay, "127.0.0.1", 0)
        front = rs.sockets[0].getsockname()[1]
    if CFG.get("seed_key"):
        u, k, b = CFG["seed_key"]
        KEYS[u] = [(k, b)]
    if CFG.get("claude"):
        STATE["claude"] = CFG["claude"]
    if CFG.get("job"):
        STATE["job"] = CFG["job"]
        STATE["state"] = "online"
    print("READY " + json.dumps({"port": front, "fp": fp}), flush=True)
    # a line on stdin asks for the state (the tests read what the grid saw)
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        if line.strip() == "state":
            print("STATE " + json.dumps({"keys": KEYS, "state": STATE}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
