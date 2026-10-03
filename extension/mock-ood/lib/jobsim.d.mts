// Types for the mock cluster's job simulator (lib/jobsim.mjs), for its test and the type-check (13.0.0).
/** status.json for job j in `state`, built from what the simulator knows */
export function statusDoc(j: Record<string, unknown>, s: Record<string, unknown>, state: string, now: number, extra?: Record<string, unknown>): Record<string, unknown>;
/** one step of every simulated worker under the mock home; returns what changed, for the server's log */
export function advance(home: string, opts?: { now?: number }): Promise<string[]>;
