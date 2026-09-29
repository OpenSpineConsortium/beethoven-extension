// Ashley Bridge: the manifest, exactly as the research report's permission table specifies it.
// One codebase; WXT emits the Chrome/Edge MV3 service worker, the Firefox MV2 persistent
// background with a sidebar, and the Safari build for Apple's packager.
//
// What is deliberately absent, and must stay absent: any host_permissions at install time, the
// cookies, tabs, webRequest, nativeMessaging, debugger and identity permissions, and any origin
// on claude.ai, anthropic.com or claude.com. The one origin the extension talks to is the
// student's own Open OnDemand portal, granted from a button click and registered at runtime.
import { defineConfig } from 'wxt';

const SINGLE_PURPOSE =
  "Start, monitor and stop a Claude Code worker on your university's Open OnDemand cluster and hand you its Remote Control link.";

export default defineConfig({
  hooks: {
    // Safari has no side panel; WXT adds Chrome's keys for every MV3 target, so take them off that build
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'safari') {
        delete (manifest as { side_panel?: unknown }).side_panel;
        manifest.permissions = (manifest.permissions ?? []).filter((p) => p !== 'sidePanel');
      }
    },
  },
  srcDir: 'src',
  publicDir: 'public',
  outDir: '.output',
  // explicit imports throughout: a reviewer reading the bundle should see where every symbol comes from
  imports: false,
  manifestVersion: 3,
  manifest: ({ browser, manifestVersion, mode }) => {
    const chromium = browser === 'chrome' || browser === 'edge';
    // Optional host access is the whole permission story: the student names their portal, the
    // extension asks for that one origin at click time. MV2 (the Firefox build) spells it
    // optional_permissions; MV3 spells it optional_host_permissions. In a development build the
    // mock portal on plain http://localhost is grantable too; a release build never lists it.
    const hosts = ['https://*/*', ...(mode === 'development' ? ['http://localhost/*', 'http://127.0.0.1/*'] : [])];
    return {
      name: 'Ashley Bridge',
      short_name: 'Ashley Bridge',
      description: SINGLE_PURPOSE,
      author: 'OpenSpineConsortium',
      homepage_url: 'https://openspineconsortium.com/ashley/bridge',
      permissions: ['storage', 'alarms', 'scripting', 'activeTab', ...(chromium ? ['sidePanel'] : [])],
      ...(manifestVersion === 3 ? { optional_host_permissions: hosts } : { optional_permissions: hosts }),
      ...(chromium ? { minimum_chrome_version: '148' } : {}),
      browser_specific_settings: {
        gecko: {
          id: 'ashley-bridge@openspineconsortium.com',
          strict_min_version: '140.0',
          // Required by AMO for every new extension since 2025-11-03. The licence check binds a key
          // to the student's portal username, which is personally identifying; crash and interaction
          // data would be opt-out and are declared optional.
          data_collection_permissions: {
            required: ['personallyIdentifyingInfo'],
            optional: ['technicalAndInteraction'],
          },
        },
      },
    };
  },
});
