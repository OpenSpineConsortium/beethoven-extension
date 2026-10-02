// SSH message numbers (RFC 4251/4253/4252/4254) and a few named constants.

export const MSG = {
  DISCONNECT: 1,
  IGNORE: 2,
  UNIMPLEMENTED: 3,
  DEBUG: 4,
  SERVICE_REQUEST: 5,
  SERVICE_ACCEPT: 6,
  EXT_INFO: 7,
  KEXINIT: 20,
  NEWKEYS: 21,
  /** also curve25519's init (RFC 5656 / 8731) */
  KEX_ECDH_INIT: 30,
  KEX_ECDH_REPLY: 31,
  USERAUTH_REQUEST: 50,
  USERAUTH_FAILURE: 51,
  USERAUTH_SUCCESS: 52,
  USERAUTH_BANNER: 53,
  /** publickey: PK_OK; password: PASSWD_CHANGEREQ; keyboard-interactive: INFO_REQUEST (one number, three meanings) */
  USERAUTH_60: 60,
  USERAUTH_INFO_RESPONSE: 61,
  GLOBAL_REQUEST: 80,
  REQUEST_SUCCESS: 81,
  REQUEST_FAILURE: 82,
  CHANNEL_OPEN: 90,
  CHANNEL_OPEN_CONFIRMATION: 91,
  CHANNEL_OPEN_FAILURE: 92,
  CHANNEL_WINDOW_ADJUST: 93,
  CHANNEL_DATA: 94,
  CHANNEL_EXTENDED_DATA: 95,
  CHANNEL_EOF: 96,
  CHANNEL_CLOSE: 97,
  CHANNEL_REQUEST: 98,
  CHANNEL_SUCCESS: 99,
  CHANNEL_FAILURE: 100,
} as const;

export const DISCONNECT_REASON = {
  PROTOCOL_ERROR: 2,
  KEY_EXCHANGE_FAILED: 3,
  HOST_KEY_NOT_VERIFIABLE: 9,
  MAC_ERROR: 5,
  BY_APPLICATION: 11,
  NO_MORE_AUTH_METHODS_AVAILABLE: 14,
} as const;

export const EXTENDED_DATA_STDERR = 1;

/** the channel messages: every one of them carries the recipient channel id right after its type */
export function isChannelMessage(type: number): boolean {
  return type >= MSG.CHANNEL_OPEN_CONFIRMATION && type <= MSG.CHANNEL_FAILURE;
}

export function nameFor(n: number): string {
  return (Object.keys(MSG) as Array<keyof typeof MSG>).find((k) => MSG[k] === n) ?? `#${n}`;
}
