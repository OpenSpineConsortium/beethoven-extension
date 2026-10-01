// Shared by every page in this folder: puts the site's diagram (diagram.js) into [data-flow] and the real
// captures into .shot[data-src], then resolves window.__ready once the fonts and images are in, so the
// build script never photographs a page that is still loading.
//
// A .shot shows one card cut out of a capture, as it was captured:
//   data-src     the capture (a PNG in ../raw-9/, taken by the capture harness from the release build)
//   data-box     x,y,w,h of the card in the capture's pixels, its border included
//   data-scale   screen pixels per capture pixel (the captures are 2x, so 0.5 is the page's own size)
//   data-radius  the card's corner radii in CSS pixels, as the extension's stylesheet gives them
(function () {
  'use strict';

  function mountFlow() {
    document.querySelectorAll('[data-flow]').forEach(function (host) {
      host.innerHTML = window.FLOW_FIGURE;
    });
  }

  function mountShots() {
    var loads = [];
    document.querySelectorAll('.shot[data-src]').forEach(function (el) {
      var b = el.dataset.box.split(',').map(Number);
      var s = Number(el.dataset.scale);
      var dpr = Number(el.dataset.dpr || 2);
      el.style.width = (b[2] * s) + 'px';
      el.style.height = (b[3] * s) + 'px';
      el.style.borderRadius = (el.dataset.radius || '14').trim().split(/\s+/)
        .map(function (r) { return (Number(r) * dpr * s) + 'px'; }).join(' ');
      var img = new Image();
      img.alt = '';
      img.decoding = 'sync';
      img.style.left = (-b[0] * s) + 'px';
      img.style.top = (-b[1] * s) + 'px';
      loads.push(new Promise(function (resolve, reject) {
        img.onload = function () { img.style.width = (img.naturalWidth * s) + 'px'; resolve(img.src); };
        img.onerror = function () { reject(new Error('capture did not load: ' + el.dataset.src)); };
      }));
      img.src = el.dataset.src;
      el.appendChild(img);
    });
    return loads;
  }

  // every face these pages use, asked for by name so that none is left unloaded
  var FACES = [
    '500 64px "Newsreader"', 'italic 500 64px "Newsreader"', '400 22px "Newsreader"', 'italic 400 22px "Newsreader"',
    '400 14px "IBM Plex Sans"', '500 14px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"'
  ];

  mountFlow();
  var loads = mountShots();
  document.querySelectorAll('img:not(.shot img)').forEach(function (img) {
    if (!img.complete) loads.push(new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error('image did not load: ' + img.src)); }; }));
  });
  window.__ready = Promise.all(FACES.map(function (f) { return document.fonts.load(f); }).concat(loads))
    .then(function () { return document.fonts.ready; })
    .then(function () {
      var faces = [];
      document.fonts.forEach(function (f) { faces.push(f.family + ' ' + f.style + ' ' + f.weight + ': ' + f.status); });
      return { faces: faces, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
    });
})();
