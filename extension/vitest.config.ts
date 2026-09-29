// Unit and integration tests run in plain Node: the modules under src/core and src/licensing take
// their storage, fetch and WebSocket as arguments, so no browser shim is needed. The integration
// test starts the mock portal (mock-ood/server.mjs) on an ephemeral port; each of its shell rounds
// spawns Git Bash plus node, so the default budget is generous and the seeded-tool tests set
// their own (120 s) on top.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
