// Beethoven's ssh client (12.0.0): SSH-2 over a byte stream a bridge hands it, on WebCrypto alone.
// core/sshChannel.ts and core/signin.ts use it through these names.
export { SshConnection, SshTimeoutError, Queue, type AuthResult, type ByteStream, type ConnectionOptions, type ExecHandle, type ExecOptions, type ExecResult, type KiRequest } from './client';
export { SshIdentity, generateKeyPair, hasEd25519, keysMatch, ALGS, type KeyAlg } from './identity';
export { SshProtocolError, base64, unbase64, utf8, fromUtf8 } from './bytes';
export { fingerprintOf } from './crypto';
export { CLIENT_IDENT, KEEPALIVE_MS, AUTH_PAD } from './transport';
