// The names a release needs, read from <vendor>/release.json by release.sh and setup-mac.sh, and written
// there by setup-mac.sh --write-config: the store item and its publisher, the two Developer ID
// certificates' names, the notarytool keychain profile's name, and the Azure Artifact Signing endpoint,
// account and certificate profile. Names only. A password, key or token never belongs in the file, so a
// field this reader does not know is refused rather than carried along, and no refusal ever repeats a
// value back (a token pasted into the wrong field would otherwise land on the screen). Each refusal is
// one sentence on stderr, exit 2.
//
//   node helper/release/release-config.mjs FILE            the eight names, one per line, in the order of FIELDS
//   node helper/release/release-config.mjs --current FILE  what FILE holds of them, an empty line where one is absent or unusable
//   node helper/release/release-config.mjs --field NAME    checks $RC_VALUE as that name (--write-config, one answer at a time)
//   node helper/release/release-config.mjs --write FILE    checks $RC_<NAME> for all eight and writes FILE, mode 0600
//
// The values reach --field and --write through the environment, not argv, so that a mistyped answer is
// never visible in the process list either.
import fs from 'node:fs';

const FIELDS = [
  {
    key: 'store_id',
    env: 'RC_STORE_ID',
    ok: (v) => /^[a-p]{32}$/.test(v),
    want: "the extension's 32-letter identifier (letters a to p), as the Chrome Web Store developer dashboard shows it",
  },
  {
    key: 'publisher_id',
    env: 'RC_PUBLISHER_ID',
    ok: (v) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v),
    want: 'the publisher identifier the Chrome Web Store developer dashboard shows (letters, digits, ".", "_" and "-")',
  },
  {
    key: 'mac.app_identity',
    env: 'RC_APP_IDENTITY',
    ok: (v) => v.startsWith('Developer ID Application: ') && v.length > 'Developer ID Application: '.length,
    want: 'the name of the "Developer ID Application: <Name> (<TEAMID>)" certificate in the login keychain',
  },
  {
    key: 'mac.installer_identity',
    env: 'RC_INSTALLER_IDENTITY',
    ok: (v) => v.startsWith('Developer ID Installer: ') && v.length > 'Developer ID Installer: '.length,
    want: 'the name of the "Developer ID Installer: <Name> (<TEAMID>)" certificate in the login keychain',
  },
  {
    key: 'mac.notary_profile',
    env: 'RC_NOTARY_PROFILE',
    ok: (v) => /^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/.test(v),
    want: 'the name given to xcrun notarytool store-credentials (letters, digits, spaces, ".", "_" and "-")',
  },
  {
    key: 'windows.azure_endpoint',
    env: 'RC_AZURE_ENDPOINT',
    // the host pattern windows/build-msi-mac.sh applies once https:// and a trailing "/" are off, so a
    // name that passes here is never refused there, after the Mac package is already notarized
    ok: (v) => /^(https:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\/?$/.test(v),
    want: "the Artifact Signing account's endpoint in lower case, like https://<region>.codesigning.azure.net, with no path",
  },
  {
    key: 'windows.azure_account',
    env: 'RC_AZURE_ACCOUNT',
    ok: (v) => /^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/.test(v),
    want: 'the Artifact Signing account\'s name (letters, digits and "-")',
  },
  {
    key: 'windows.azure_profile',
    env: 'RC_AZURE_PROFILE',
    ok: (v) => /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(v),
    want: 'the certificate profile\'s name under that account (letters, digits and "-")',
  },
];
const SHAPE = { '': ['_comment', 'store_id', 'publisher_id', 'mac', 'windows'], mac: ['app_identity', 'installer_identity', 'notary_profile'], windows: ['azure_endpoint', 'azure_account', 'azure_profile'] };

function refuse(msg) {
  process.stderr.write(msg + '\n');
  process.exit(2);
}

/** the sentence that says why v is not a usable value for field f, or '' when it is one */
function why(f, v) {
  if (typeof v !== 'string' || v === '') return `${f.key} is missing; it is ${f.want}.`;
  if (/[<>]/.test(v)) return `${f.key} still holds the example's placeholder; it is ${f.want}.`;
  if (!/^[\x20-\x7e]+$/.test(v)) return `${f.key} holds a character that is not printable ASCII (a line break or a tab, for example); it is ${f.want}.`;
  if (v !== v.trim()) return `${f.key} begins or ends with a space; it is ${f.want}.`;
  // a token or key pasted into a name's place: refused before any pattern could let it through
  if (/^(eyJ|ya29\.|1\/\/0)|-----BEGIN/.test(v) || (!/\s/.test(v) && v.length >= 40 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v))) {
    return `${f.key} looks like a token or a key, not a name; the file holds names only, and ${f.key} is ${f.want}.`;
  }
  if (!f.ok(v)) return `${f.key} must be ${f.want}.`;
  return '';
}

const get = (doc, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' && !Array.isArray(o) ? o[k] : undefined), doc);
const isObject = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** the parsed file, or a refusal naming it; JSON.parse's own message is left out because it quotes the file's text */
function load(file, lenient) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    if (lenient) return undefined;
    refuse(`${file} is missing; bash helper/release/setup-mac.sh --write-config asks for each name and writes it.`);
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    if (lenient) return undefined;
    refuse(`${file} is not JSON; bash helper/release/setup-mac.sh --write-config writes it afresh.`);
  }
  if (!isObject(doc)) {
    if (lenient) return undefined;
    refuse(`${file} is not a JSON object with store_id, publisher_id, mac and windows.`);
  }
  return doc;
}

function strict(file) {
  const doc = load(file, false);
  for (const [where, keys] of Object.entries(SHAPE)) {
    const o = where ? doc[where] : doc;
    if (where && !isObject(o)) refuse(`${file}: ${where} must be an object with ${keys.join(', ')}.`);
    for (const k of Object.keys(o)) {
      if (!keys.includes(k)) refuse(`${file} has a field "${where ? where + '.' : ''}${k}" that a release does not use; the file holds names only, never a password, key or token, so it is refused rather than carried along.`);
    }
  }
  for (const f of FIELDS) {
    const w = why(f, get(doc, f.key));
    if (w) refuse(`${file}: ${w}`);
  }
  return FIELDS.map((f) => get(doc, f.key));
}

const [mode, arg] = process.argv.slice(2);
if (mode === '--current') {
  const doc = load(arg, true);
  // an unusable value prints as an empty line, so --write-config never offers it back as the default
  process.stdout.write(FIELDS.map((f) => { const v = doc && get(doc, f.key); return typeof v === 'string' && !why(f, v) ? v : ''; }).join('\n') + '\n');
} else if (mode === '--field') {
  const f = FIELDS.find((x) => x.key === arg);
  if (!f) refuse(`--field takes one of ${FIELDS.map((x) => x.key).join(', ')}.`);
  const w = why(f, process.env.RC_VALUE);
  if (w) refuse(w);
} else if (mode === '--write') {
  if (!arg) refuse('--write needs the file to write.');
  for (const f of FIELDS) {
    const w = why(f, process.env[f.env]);
    if (w) refuse(w);
  }
  const v = (k) => process.env[FIELDS.find((f) => f.key === k).env];
  const doc = {
    store_id: v('store_id'),
    publisher_id: v('publisher_id'),
    mac: { app_identity: v('mac.app_identity'), installer_identity: v('mac.installer_identity'), notary_profile: v('mac.notary_profile') },
    windows: { azure_endpoint: v('windows.azure_endpoint'), azure_account: v('windows.azure_account'), azure_profile: v('windows.azure_profile') },
  };
  // written beside the target and renamed over it, so an interrupted write never leaves half a file
  const tmp = `${arg}.new`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, arg);
} else if (mode && !mode.startsWith('-') && arg === undefined) {
  process.stdout.write(strict(mode).join('\n') + '\n');
} else {
  refuse('Usage: node helper/release/release-config.mjs FILE | --current FILE | --field NAME | --write FILE');
}
