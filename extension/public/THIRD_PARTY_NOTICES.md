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
   level M only) kept in the extension's source. It draws, on your device, the QR code of your
   session's link on the panel's Phone card and the QR codes of the phone route's pages (your
   university's instructions, and the app stores' pages for GlobalProtect and Google Authenticator).
   It is compiled into the panel's script, from which the build removes every comment, so its notice
   is kept here. MIT License.

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

5. The Rust standard library (https://www.rust-lang.org; source at
   https://github.com/rust-lang/rust), statically linked into the Bridge's compiled program for
   Windows and macOS (beethoven-bridge.exe in bridge/beethoven-bridge-windows.msi, and
   beethoven-bridge in bridge/beethoven-bridge-mac.pkg). The Bridge's own source uses no other
   third-party code. Copyright: The Rust Project Developers (https://thanks.rust-lang.org). Licensed
   under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0) or the MIT
   license, at your option; Beethoven uses it under the MIT license, whose text follows. Some parts
   of the standard library carry notices of their own, which the Rust project lists for each release
   in the file COPYRIGHT-library that comes with it (in a rustup installation,
   share/doc/rust/COPYRIGHT-library.html): crates it is built from, under the same two licences,
   such as hashbrown, gimli, addr2line and rustc-demangle (which of them a build carries depends on
   the system it is built for), and its tables of Unicode character data, under the Unicode License
   v3, whose text follows the MIT text. The maintainer's record of each signed installer names the
   Rust version it was built with.

   Copyright (c) The Rust Project Developers

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
   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

   UNICODE LICENSE V3

   COPYRIGHT AND PERMISSION NOTICE

   Copyright (c) 1991-2024 Unicode, Inc.

   NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING, INSTALLING, COPYING
   OR OTHERWISE USING DATA FILES, AND/OR SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND
   BY, ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD,
   INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

   Permission is hereby granted, free of charge, to any person obtaining a copy of data files and
   any associated documentation (the "Data Files") or software and any associated documentation (the
   "Software") to deal in the Data Files or Software without restriction, including without
   limitation the rights to use, copy, modify, merge, publish, distribute, and/or sell copies of the
   Data Files or Software, and to permit persons to whom the Data Files or Software are furnished to
   do so, provided that either (a) this copyright and permission notice appear with all copies of
   the Data Files or Software, or (b) this copyright and permission notice appear in associated
   Documentation.

   THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
   PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS.

   IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY
   CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM
   LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
   ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA FILES OR
   SOFTWARE.

   Except as contained in this notice, the name of a copyright holder shall not be used in
   advertising or otherwise to promote the sale, use or other dealings in these Data Files or
   Software without prior written authorization of the copyright holder.

The tour in the panel ("See what it can do") shows the figure from the home page of the lab's own
website, https://openspineconsortium.com/: its drawing and its style sheet, copied into the package
for the tour, with the label "H200 GPU" shortened to "GPU". It is Licensor's own work, not
third-party material, and is part of Beethoven under the Beethoven agreement; the website's source,
where the figure first appeared, is also published under the Apache License, Version 2.0.

The ssh client of the ssh path, the code that protects its key with a passkey, and the Bridge (its
compiled program for Windows and macOS, its installers, uninstallers and helper scripts) are
Licensor's own work, written for Beethoven without third-party code except the Rust standard library
of item 5, which the compiled program includes, and are part of Beethoven under the Beethoven
agreement. The ssh client uses only your browser's own cryptography (WebCrypto). What the Bridge
runs on depends on the system: on Windows and macOS it is that compiled program; on Linux it is a
script that runs on programs your computer already has, which are not part of this package and are
provided under their publishers' own terms: Perl, or Python 3 where Perl is absent. (The package
also keeps the script editions for Windows and macOS, which a copy of Beethoven other than the
Chrome Web Store's offers instead; they run on Windows PowerShell and on Perl.)

Claude Code is not part of this package. It is Anthropic's software, installed and run on the cluster
under Anthropic's own terms; "Claude" and "Claude Code" are Anthropic's marks.
