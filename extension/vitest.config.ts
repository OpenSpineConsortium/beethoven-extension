// Unit and integration tests run in plain Node: the modules under src/core and src/licensing take
// their storage, fetch and WebSocket as arguments, so no browser shim is needed. The integration
// test starts the mock portal (mock-ood/server.mjs) on an ephemeral port.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
