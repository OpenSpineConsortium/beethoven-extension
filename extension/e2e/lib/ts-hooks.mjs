// Lets plain Node (22.18 and later strip TypeScript types by themselves) import the extension's own
// core modules, which name each other without an extension ("./terms"): a relative specifier with no
// extension resolves to the .ts file beside it. Used by the harness and the mock's self-test to read
// the contract's parsers and the words of model.ts instead of copying them.
//   import { register } from 'node:module';
//   register('./lib/ts-hooks.mjs', import.meta.url);
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
}
