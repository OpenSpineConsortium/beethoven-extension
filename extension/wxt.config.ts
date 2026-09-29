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
  // the store kit (screenshots, tiles and their HTML sources) sits beside the project and belongs in no package, not even the AMO sources zip
  zip: { excludeSources: ['store-assets/**'] },
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
      // no default_popup: the toolbar button is the "go" button (action.onClicked opens the strip and,
      // from a portal tab, asks for that one origin in the same gesture); WXT spells it browser_action on MV2
      action: { default_title: 'Ashley Bridge' },
      ...(chromium ? { minimum_chrome_version: '148' } : {}),
      browser_specific_settings: {
        gecko: {
          id: 'ashley-bridge@openspineconsortium.com',
          strict_min_version: '140.0',
          // Required by AMO for every new extension since 2025-11-03. "none" is the truthful answer:
          // the extension sends nothing to the vendor. The licence key is checked inside the browser
          // against the public keys in src/licensing/keys.json (no activation request exists), there
          // is no error or crash reporting in the code, and the one request to the vendor's site is
          // the daily GET of the signed kill-list (src/licensing/killlist.ts), sent without cookies
          // and carrying no data. An earlier declaration named an activation ping and optional
          // reports that were never built; if either is ever added, this must change with it.
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    };
  },
});
