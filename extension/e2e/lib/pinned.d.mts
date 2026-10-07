// Types for e2e/lib/pinned.mjs, for its test and the type-check.
export interface Origin {
  repository: string;
  commit: string;
  export: string;
  version: number;
  /** [path, sha256], in ORIGIN's order */
  files: Array<[string, string]>;
}
export const ROOT: string;
export const FETCH: string;
export function readOrigin(dir: string): Origin;
export function checkPinned(rel: string, id: string, root?: string): { dir: string; commit: string; files: Array<[string, string]> };
