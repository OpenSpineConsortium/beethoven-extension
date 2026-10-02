// Beethoven: the manifest, exactly as the research report's permission table specifies it.
// One codebase; WXT emits the Chrome/Edge MV3 service worker, the Firefox MV2 persistent
// background with a sidebar, and the Safari build for Apple's packager.
//
// 11.0.0: storage, alarms, scripting and sidePanel, and nothing else. activeTab is gone: the toolbar
// click inspects no tab any more, it opens the window-wide panel (sidePanel.setPanelBehavior
// {openPanelOnActionClick: true}); the one origin is asked for from the welcome page's "Agree and
// continue" (or "Use this portal"), inside that click. scripting loads Beethoven's page script with
// executeScript into a tab Beethoven opened itself on the granted origin, in two cases only: a portal
// whose sign-in the browser does not carry on the extension's own requests ("tab mode"), and the
// one-time grid terminal step (AM2), where it reads the page title and types one line after the
// student signs in there. No page script is registered.
//
// 12.0.0 adds nativeMessaging (Chrome and Edge builds only), and nothing else: the direct way to the grid (ssh with no VPN) needs a
// byte stream to grid.wayne.edu:22, and a browser extension has no socket; the helper that comes inside
// Beethoven (public/bridge/, installed once by the student, no administrator) is the native messaging
// host com.openspineconsortium.beethoven.bridge, which opens TCP only to its own allowlist
// (grid.wayne.edu:22), carries bytes both ways, holds no credential and has no shell. The ssh session
// itself (the pinned host key, the sign-in) is end to end between this extension and the grid.
//
// What is deliberately absent, and must stay absent: any host_permissions at install time (Decision 2),
// the cookies, tabs, notifications, webRequest, offscreen, tabGroups, debugger and identity
// permissions, and any origin on claude.ai, anthropic.com or claude.com. The only other
// addresses it fetches are the maintainer's (the approval check, the services file and the
// withdrawn-versions list), with plain cross-origin fetches and no host permission.
import { defineConfig } from 'wxt';

// the manifest description: at most 132 characters in Chrome's manifest documentation; this is 128
// (docs/store/LISTING.md, "Short description"), and test/hygiene.test.ts holds it to the limit
const SINGLE_PURPOSE =
  "Starts, watches and stops a Claude Code worker on your university's Open OnDemand cluster and hands you its Remote Control link.";

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
      name: 'Beethoven',
      short_name: 'Beethoven',
      description: SINGLE_PURPOSE,
      author: 'OpenSpineConsortium',
      homepage_url: 'https://openspineconsortium.com/beethoven/',
      // nativeMessaging on the Chromium builds only: the helper's installers register it for Chrome and
      // Edge (and Chromium and Brave), never for Firefox or Safari, so those builds would carry the
      // permission's install warning for a host they can never reach (they take the GlobalProtect way)
      permissions: ['storage', 'alarms', 'scripting', ...(chromium ? ['nativeMessaging', 'sidePanel'] : [])],
      ...(manifestVersion === 3 ? { optional_host_permissions: hosts } : { optional_permissions: hosts }),
      // no default_popup: the toolbar button toggles the window-wide panel (the background sets
      // openPanelOnActionClick); its badge, tooltip and lit icon report while the panel is closed.
      // WXT spells it browser_action on MV2
      // the toolbar starts unlit (icon/off-*: the rack alone, which recedes on a light or a dark toolbar);
      // the background sets the lit one (icon/on-*) while the worker is online. The manifest's own icons
      // (the store, the extensions page) stay the tiled ones.
      action: { default_title: 'Beethoven', default_icon: { 16: 'icon/off-16.png', 32: 'icon/off-32.png', 48: 'icon/off-48.png', 128: 'icon/off-128.png' } },
      ...(chromium ? { minimum_chrome_version: '148' } : {}),
      browser_specific_settings: {
        gecko: {
          id: 'beethoven@openspineconsortium.com',
          strict_min_version: '140.0',
          // Required by AMO for every new extension since 2025-11-03. Since 4.0.0 the truthful answer
          // is personallyIdentifyingInfo: the approval check sends the vendor's access service the
          // institutional account name the portal's dashboard shows (with the portal hostname, the
          // product and the version) to learn whether that account is approved. Nothing else leaves
          // the device towards the vendor: there is no error or crash reporting in the code and no
          // usage data (so no technicalAndInteraction), and the two daily GETs of services.json and
          // the signed kill-list are sent without cookies and carry no data. Until 3.0.0 this said
          // "none", which was true of a build that checked a licence key inside the browser; if any
          // other data is ever sent, this must change with it, together with PRIVACY.md.
          data_collection_permissions: {
            required: ['personallyIdentifyingInfo'],
          },
        },
      },
    };
  },
});
