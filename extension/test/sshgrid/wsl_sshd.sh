#!/bin/bash
# An unprivileged OpenSSH sshd in WSL, configured like the Wayne grid's door (2026-10-01): an RSA host key,
# curve25519 / ecdh-sha2-nistp256, aes*-ctr, hmac-sha1, publickey only here (no PAM in user space), keys
# in one authorized_keys file, StrictModes off (a user-space test). A gate stand-in (gate.sh) is the
# forced command of the restricted line the test writes. Usage: wsl_sshd.sh start PORT | stop | authkeys
# (authkeys: the line on stdin replaces the file). Prints HOST_FP=... and READY on start.
# The sshd binary is the one an earlier step extracted under ~/sshd-test/root (an Ubuntu openssh-server, user space).
set -u
R=$HOME/sshd-test/root
D=$HOME/sshd-test/core12
export LD_LIBRARY_PATH=$R/lib/x86_64-linux-gnu:$R/usr/lib/x86_64-linux-gnu
case "${1:-}" in
  start)
    PORT="${2:-2232}"
    [ -f "$D/sshd.pid" ] && kill "$(cat "$D/sshd.pid")" 2>/dev/null
    rm -rf "$D" && mkdir -p "$D/host" "$D/auth"
    ssh-keygen -q -t rsa -b 3072 -N '' -f "$D/host/ssh_host_rsa_key" >/dev/null
    : > "$D/auth/authorized_keys"
    chmod 600 "$D/auth/authorized_keys" "$D/host/ssh_host_rsa_key"
    cat > "$D/gate.sh" <<'EOF'
#!/bin/bash
# the gate stand-in: SSH_ORIGINAL_COMMAND, two verbs, and whether a terminal was given
c="${SSH_ORIGINAL_COMMAND-}"
t=no; [ -t 0 ] && t=yes
case "$c" in
  version) echo "HPCW-GATE ok 11 never $(id -un) claude=no"; exit 0;;
  tty) echo "tty=$t"; exit 0;;
  *) echo "HPCW-GATE refused"; exit 126;;
esac
EOF
    chmod 755 "$D/gate.sh"
    cat > "$D/sshd_config" <<EOF
Port $PORT
ListenAddress 127.0.0.1
HostKey $D/host/ssh_host_rsa_key
PidFile $D/sshd.pid
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256
HostKeyAlgorithms rsa-sha2-512,rsa-sha2-256
PubkeyAcceptedAlgorithms ssh-ed25519,ecdsa-sha2-nistp256
Ciphers aes128-ctr,aes192-ctr,aes256-ctr
MACs hmac-sha1
AuthorizedKeysFile $D/auth/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
PrintMotd no
StrictModes no
EOF
    "$R/usr/sbin/sshd" -t -f "$D/sshd_config" || { echo "CONFIG_BAD"; exit 1; }
    "$R/usr/sbin/sshd" -f "$D/sshd_config" -E "$D/sshd.log" || { echo "START_FAILED"; exit 1; }
    echo "HOST_FP=$(ssh-keygen -lf "$D/host/ssh_host_rsa_key.pub" | awk '{print $2}')"
    echo "USER=$(id -un)"
    echo "GATE=$D/gate.sh"
    echo "READY";;
  authkeys)
    cat > "$D/auth/authorized_keys"; chmod 600 "$D/auth/authorized_keys"; echo "WRITTEN";;
  stop)
    [ -f "$D/sshd.pid" ] && kill "$(cat "$D/sshd.pid")" 2>/dev/null; echo "STOPPED";;
  log)
    tail -n 40 "$D/sshd.log";;
  *) echo "usage: wsl_sshd.sh start PORT | authkeys | stop | log"; exit 2;;
esac
