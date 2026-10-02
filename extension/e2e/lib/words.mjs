// The words the harness checks the screens against: the extension's own WORDS (src/core/model.ts,
// verbatim from the specification), the agreement's summary and tick (terms.ts) and the data
// statement's lines and tick (disclosure.ts), imported as TypeScript. When a module is not there yet
// (another stream still building it), the specification's sentences below stand in, and the report
// says which were used.
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);

const SPEC = {
  SUMMARY: [
    "Free while you're approved. Licensed to you, not sold.",
    'To check your approval, it sends the lab your AccessID and an ID for this browser.',
    'The grid, Anthropic or the browser store can stop it working at any time. You accept that risk.',
    'Disputes: written notice first, then one person at a time in Michigan courts, with no jury.',
  ],
  AFFIRMATION: { id: 'agree', bold: "I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or older.", soft: 'That includes giving up a jury trial and class actions, and accepting the risks above.' },
  SHORT_STATEMENT: [
    'Claude sees the files your worker reads and what its commands print.',
    'Anthropic keeps the chat under your plan: 30 days, or 5 years if you allow training.',
    'No business associate agreement (HIPAA) covers a personal plan.',
    "It uses your Claude plan's limits.",
  ],
  STATEMENT_TICK: "I'll keep FERPA, IRB, health and export-controlled data out of my worker, and turn on Remote Control for it.",
};

export const sources = [];
async function load(mod, names) {
  try {
    const m = await import(mod);
    const out = {};
    for (const n of names) {
      if (m[n] === undefined) throw new Error(`${n} missing`);
      out[n] = m[n];
    }
    sources.push(`${mod}: ${names.join(', ')}`);
    return out;
  } catch (e) {
    sources.push(`${mod}: the specification's sentences (${e.message.split('\n')[0]})`);
    return Object.fromEntries(names.map((n) => [n, SPEC[n]]));
  }
}

const model = await import('../../src/core/model.ts').catch(() => undefined);
if (!model) throw new Error('src/core/model.ts (the contract) could not be read');
export const WORDS = model.WORDS;
export const LOG_WORDS = model.LOG_WORDS;
const terms = await load('../../src/core/terms.ts', ['SUMMARY', 'AFFIRMATION']);
const disclosure = await load('../../src/core/disclosure.ts', ['SHORT_STATEMENT', 'STATEMENT_TICK']);
export const SUMMARY = terms.SUMMARY;
export const AFFIRMATION = terms.AFFIRMATION;
export const SHORT_STATEMENT = disclosure.SHORT_STATEMENT;
export const STATEMENT_TICK = disclosure.STATEMENT_TICK;
export const C = await import('../../src/core/contract.ts');

/** a sentence as a regular expression that tolerates the line breaks and spacing a page puts in it */
export function loose(s) {
  return new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
}
