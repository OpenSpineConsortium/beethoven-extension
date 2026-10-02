// The helper's download, made out to this extension (core/bridgeZip.ts): the page reads the zip the
// package carries (bridge/<file>, the extension's own address), writes chrome.runtime.id into its
// allowed_origins.json, and saves that copy. So the zip a student saves names exactly the Beethoven they
// saved it from (the Chrome Web Store's, Edge Add-ons', or a development build's), and no release step
// has to know the store's identifier in advance. Nothing is fetched from anywhere else; nothing is sent.
// When the copy cannot be made, the packaged file is saved unchanged and its installer refuses with its
// own sentence (fail closed).
import { browser } from 'wxt/browser';
import { originOf, withAllowedOrigins } from '../core/bridgeZip';
import type { HelperDownload } from '../core/model';
import { el } from './dom';

const made = new Map<string, Promise<string | undefined>>();

/** this extension's copy of the helper's zip, as an object URL (made once per page); undefined when it cannot be made */
export function personalHelperUrl(d: HelperDownload): Promise<string | undefined> {
  let p = made.get(d.url);
  if (!p) {
    p = (async () => {
      const origin = originOf((browser.runtime as { id?: string } | undefined)?.id);
      if (!origin || !/\.zip$/i.test(d.file)) return undefined;
      const r = await fetch(d.url);
      if (!r.ok) return undefined;
      const z = withAllowedOrigins(new Uint8Array(await r.arrayBuffer()), origin);
      return URL.createObjectURL(new Blob([z.slice().buffer as ArrayBuffer], { type: 'application/zip' }));
    })().catch(() => undefined);
    made.set(d.url, p);
  }
  return p;
}

/**
 * A helper download link's click: the page's own copy is saved under the packaged file's name (the
 * packaged file itself when the copy cannot be made), then `after` runs. The copy is usually made before
 * the click (personalHelperUrl when the link is drawn), so the save follows the click at once.
 */
export function saveHelper(e: Event, d: HelperDownload, after: () => void): void {
  e.preventDefault();
  void personalHelperUrl(d).then((u) => {
    const a = el('a', { href: u ?? d.url, download: d.file });
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    after();
  });
}
