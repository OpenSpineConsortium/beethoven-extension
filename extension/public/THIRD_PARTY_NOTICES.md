Beethoven: third-party notices

The Beethoven browser extension has no runtime dependency of its own. Its package holds the following
third-party material, each under its own licence, which governs it in place of the Beethoven agreement.

1. WXT (https://wxt.dev), version 0.21.4, and its browser helper @wxt-dev/browser, version 0.3.0.
   The build tool; a small amount of its helper code is compiled into the extension's scripts.
   MIT License. Copyright (c) 2023 Aaron (the author named in the package is Aaron Klinker).

   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
   associated documentation files (the "Software"), to deal in the Software without restriction,
   including without limitation the rights to use, copy, modify, merge, publish, distribute,
   sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all copies or
   substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
   NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
   OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

2. Newsreader (fonts/Newsreader16pt-*.woff2; the medium italic is its Latin subset as Google Fonts
   serves it). Copyright 2020 The Newsreader Project Authors
   (http://github.com/productiontype/Newsreader). SIL Open Font License, Version 1.1; the full text
   is in the package at fonts/Newsreader-OFL.txt.

3. IBM Plex Sans and IBM Plex Mono (fonts/IBMPlex*.woff2, Latin-1 subsets). Copyright (c) 2017 IBM
   Corp. with Reserved Font Name "Plex". SIL Open Font License, Version 1.1; the full text is in the
   package at fonts/IBMPlex-OFL.txt.

4. QR Code generator library, TypeScript edition, by Project Nayuki
   (https://www.nayuki.io/page/qr-code-generator-library; source at
   https://github.com/nayuki/QR-Code-generator), in a shortened port (byte mode and error correction
   level M only) kept in the extension's source. It draws the QR code of your session's link on the
   panel's Phone card, on your device. It is compiled into the panel's script, from which the build
   removes every comment, so its notice is kept here. MIT License.

   Copyright (c) Project Nayuki. (MIT License)
   https://www.nayuki.io/page/qr-code-generator-library

   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
   associated documentation files (the "Software"), to deal in the Software without restriction,
   including without limitation the rights to use, copy, modify, merge, publish, distribute,
   sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:
   - The above copyright notice and this permission notice shall be included in all copies or
     substantial portions of the Software.
   - The Software is provided "as is", without warranty of any kind, express or implied, including
     but not limited to the warranties of merchantability, fitness for a particular purpose and
     noninfringement. In no event shall the authors or copyright holders be liable for any claim,
     damages or other liability, whether in an action of contract, tort or otherwise, arising from,
     out of or in connection with the Software or the use or other dealings in the Software.

The tour in the panel ("See what it can do") shows the figure from the home page of the lab's own
website, https://openspineconsortium.com/: its drawing and its style sheet, copied into the package
for the tour, with the label "H200 GPU" shortened to "GPU". It is Licensor's own work, not
third-party material, and is part of Beethoven under the Beethoven agreement; the website's source,
where the figure first appeared, is also published under the Apache License, Version 2.0.

Claude Code is not part of this package. It is Anthropic's software, installed and run on the cluster
under Anthropic's own terms; "Claude" and "Claude Code" are Anthropic's marks.
