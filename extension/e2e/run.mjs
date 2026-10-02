#!/usr/bin/env node
// The browser harness for Beethoven 11.0.0 (README.md beside this file). It builds nothing: it loads
// .output/chrome-mv3 (or --ext DIR) in a fresh profile, starts the mock portal, walks a scenario and
// writes everything it saw under the output folder (E2E_OUT; default the session scratchpad).
//
//   node e2e/run.mjs <scenario>... [--ext DIR] [--live-access] [--offline] [--minutes N] [--panel-open]
//   node e2e/run.mjs all            scenarios 1 to 12 in order (not 0, which is the harness's own check)
//   node e2e/run.mjs list
//
// Scenarios: 0 infra, 1 first-run, 2 returning, 3 unreachable, 4 tab-mode, 5 approval, 6 login-setup,
// 7 motion-width, 8 anthropic-portal, 9 long-signin, 10 home-extras, 11 queue-reasons, 12 welcome-extras. Each prints PASS and FAIL lines and the run ends
// with a summary; the exit code is 1 when anything failed.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_EXT, OUT_ROOT } from './lib/harness.mjs';

const SCENARIOS = {
  0: ['infra', './scenarios/00-infra.mjs'],
  1: ['first-run', './scenarios/01-first-run.mjs'],
  2: ['returning', './scenarios/02-returning.mjs'],
  3: ['unreachable', './scenarios/03-unreachable.mjs'],
  4: ['tab-mode', './scenarios/04-tab-mode.mjs'],
  5: ['approval', './scenarios/05-approval.mjs'],
  6: ['login-setup', './scenarios/06-login-setup.mjs'],
  7: ['motion-width', './scenarios/07-motion-width.mjs'],
  8: ['anthropic-portal', './scenarios/08-anthropic-portal.mjs'],
  9: ['long-signin', './scenarios/09-long-signin.mjs'],
  10: ['home-extras', './scenarios/10-home-extras.mjs'],
  11: ['queue-reasons', './scenarios/11-queue-reasons.mjs'],
  12: ['welcome-extras', './scenarios/12-welcome-extras.mjs'],
  // 12.0.0, the direct way, against the local grid stand-in (lib/direct.mjs): not part of "all"
  13: ['direct-first-run', './scenarios/13-direct-first-run.mjs'],
  14: ['direct-passkey', './scenarios/14-direct-passkey.mjs'],
  15: ['direct-no-helper', './scenarios/15-direct-no-helper.mjs'],
  16: ['direct-door', './scenarios/16-direct-door.mjs'],
};

const a = process.argv.slice(2);
const val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
const flagArgs = new Set(['--ext', '--minutes']);
const names = a.filter((x, i) => !x.startsWith('--') && !flagArgs.has(a[i - 1]));
if (!names.length || names.includes('list')) {
  console.log('scenarios:');
  for (const [n, [name]] of Object.entries(SCENARIOS)) console.log(`  ${n}  ${name}`);
  console.log(`output: ${OUT_ROOT}`);
  process.exit(names.length ? 0 : 2);
}
const pick = names.includes('all') ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] : names.map((n) => Object.keys(SCENARIOS).find((k) => k === n || SCENARIOS[k][0] === n || SCENARIOS[k][1].includes(n)));
if (pick.some((p) => !p)) {
  console.error(`unknown scenario in ${names.join(' ')}; node e2e/run.mjs list`);
  process.exit(2);
}
const ext = path.resolve(val('--ext') ?? DEFAULT_EXT);
if (!fs.existsSync(path.join(ext, 'manifest.json'))) {
  console.error(`no built package at ${ext} (the harness builds nothing: run the build first)`);
  process.exit(2);
}
const opts = { browser: { ext, liveAccess: a.includes('--live-access'), offline: a.includes('--offline') }, minutes: val('--minutes'), panelOpen: a.includes('--panel-open') };
const summary = [];
for (const k of pick) {
  const [name, file] = SCENARIOS[k];
  console.log(`\n==== scenario ${k}: ${name} ====`);
  try {
    const mod = await import(file);
    const r = await mod.default(opts);
    summary.push({ scenario: `${k} ${name}`, passed: r.passed, failed: r.failed });
  } catch (e) {
    console.log(`FAIL  scenario ${k} could not run: ${e.stack}`);
    summary.push({ scenario: `${k} ${name}`, passed: 0, failed: 1, error: e.message });
  }
}
console.log('\n==== summary ====');
for (const s of summary) console.log(`${s.failed ? 'FAIL' : 'PASS'}  ${s.scenario}: ${s.passed} passed, ${s.failed} failed${s.error ? ` (${s.error})` : ''}`);
fs.mkdirSync(OUT_ROOT, { recursive: true });
fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), ext, summary }, null, 1));
process.exit(summary.some((s) => s.failed) ? 1 : 0);
