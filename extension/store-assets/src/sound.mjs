// The promo video's sound track, made from promo.html's window.__cues: each cue names what happens on
// screen (a scene comes in, a box is drawn, a key is typed, a button is pressed) and when, so every sound
// lands on its frame. Everything is synthesised here, from sine waves and seeded noise: no samples, no
// downloads, the same bytes on every build. Written as 48 kHz 16-bit stereo WAV for ffmpeg to encode.
//
//   bed     a quiet held chord under the whole video, in F major (the site's warm, unhurried register)
//   whoosh  a scene comes in: noise swept up through a filter
//   swish   an arrow draws itself: a softer, longer sweep
//   pop     a box of the diagram appears: a short sine drop (pitch: semitones above the root)
//   blip    the question appears in the claude.ai window
//   key     one key typed: a short filtered click, each one a little different
//   click   a button pressed: a crisp two-part tick
//   chime   something succeeds: soft bells (notes: semitones above the root)
//   finale  the end card: the chord, struck as bells and let ring

export const RATE = 48000;
const ROOT = 349.23;                                   // F4

function rng(seed) {                                   // mulberry32: the same noise on every build
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}
const semi = (n) => ROOT * Math.pow(2, n / 12);

// a mono buffer of `sec` seconds, filled by f(i, t)
function make(sec, f) {
  const n = Math.max(1, Math.round(sec * RATE)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f(i, i / RATE, sec);
  return out;
}
// one-pole low-pass with a cutoff that may move over time: cutoff(t) in Hz
function lowpass(buf, cutoff) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = cutoff(i / RATE), a = 1 - Math.exp(-2 * Math.PI * c / RATE);
    y += a * (buf[i] - y); buf[i] = y;
  }
  return buf;
}
function highpass(buf, cutoff) {
  let y = 0, prev = 0;
  const a = 1 / (1 + 2 * Math.PI * cutoff / RATE);
  for (let i = 0; i < buf.length; i++) { y = a * (y + buf[i] - prev); prev = buf[i]; buf[i] = y; }
  return buf;
}
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

function bell(freq, sec, amp) {
  // a soft bell: the fundamental, an octave and a slightly sharp twelfth, the upper ones dying faster
  return make(sec, (i, t) => amp * env(t, 0.004, 0.5 * sec / 1.6) * (
    Math.sin(2 * Math.PI * freq * t) +
    0.32 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 3) +
    0.12 * Math.sin(2 * Math.PI * freq * 3.01 * t) * Math.exp(-t * 6)));
}

const VOICES = {
  bed(c) {
    const sec = c.dur, chord = [-12, -5, 0, 4, 9].map(semi);  // F3 C4 F4 A4 D5: Fadd6, open and calm
    const fadeIn = 2.5, fadeOut = 3.0;
    const buf = make(sec, (i, t) => {
      let v = 0;
      chord.forEach((f, k) => {
        const wob = 1 + 0.0015 * Math.sin(2 * Math.PI * (0.11 + 0.03 * k) * t);
        v += Math.sin(2 * Math.PI * f * wob * t + k) * (k === 0 ? 0.9 : 0.55);
      });
      const g = Math.min(1, t / fadeIn) * Math.min(1, (sec - t) / fadeOut);
      return 0.05 * v * g * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.08 * t));
    });
    return lowpass(buf, () => 1800);
  },
  whoosh(c, r) {
    const sec = c.dur || 0.8;
    const buf = make(sec, (i, t) => r() * Math.sin(Math.PI * Math.min(1, t / sec)) ** 2 * 0.2);
    return highpass(lowpass(buf, (t) => 300 + 4200 * Math.sin(Math.PI * Math.min(1, t / sec))), 120);
  },
  swish(c, r) {
    const sec = c.dur || 0.8;
    const buf = make(sec, (i, t) => r() * Math.sin(Math.PI * t / sec) * 0.12);
    return highpass(lowpass(buf, (t) => 900 + 2600 * (t / sec)), 400);
  },
  pop(c) {
    const f0 = semi(c.pitch || 0) * 2;
    let ph = 0;
    return make(0.16, (i, t) => {
      ph += 2 * Math.PI * f0 * (1 + 0.9 * Math.exp(-t * 60)) / RATE;
      return 0.32 * Math.sin(ph) * env(t, 0.002, 0.045);
    });
  },
  blip(c) {
    return make(0.12, (i, t) => 0.18 * Math.sin(2 * Math.PI * semi(19) * t) * env(t, 0.002, 0.03));
  },
  key(c, r) {
    // a key: a click of noise and a short body, pitch and level varied a little per key
    const f = 1800 + 900 * Math.abs(r()), lvl = 0.9 + 0.25 * r();
    const buf = make(0.06, (i, t) => lvl * (r() * env(t, 0.0005, 0.006) + 0.35 * Math.sin(2 * Math.PI * f * t) * env(t, 0.001, 0.012)));
    return highpass(lowpass(buf, () => 6500), 700);
  },
  click(c, r) {
    // a press and its release, 45 ms apart
    const buf = make(0.12, (i, t) => {
      const press = r() * env(t, 0.0004, 0.004) + 0.5 * Math.sin(2 * Math.PI * 2600 * t) * env(t, 0.0005, 0.008);
      const t2 = t - 0.045;
      const rel = t2 < 0 ? 0 : 0.5 * (r() * env(t2, 0.0004, 0.003) + 0.4 * Math.sin(2 * Math.PI * 3400 * t2) * env(t2, 0.0005, 0.006));
      return 1.1 * (press + rel);
    });
    return highpass(buf, 500);
  },
  chime(c) {
    const notes = c.notes || [0, 7], gap = 0.09, sec = 1.6 + gap * notes.length, out = new Float32Array(Math.round(sec * RATE));
    notes.forEach((n, k) => {
      const at = Math.round(k * gap * RATE), b = bell(semi(n + 12), 1.6, 0.14);
      for (let i = 0; i < b.length && at + i < out.length; i++) out[at + i] += b[i];
    });
    return out;
  },
  finale(c) {
    const notes = [-12, 0, 4, 7, 12], gap = 0.07, sec = 3.4, out = new Float32Array(Math.round(sec * RATE));
    notes.forEach((n, k) => {
      const at = Math.round(k * gap * RATE), b = bell(semi(n), sec - k * gap, k === 0 ? 0.16 : 0.12);
      for (let i = 0; i < b.length && at + i < out.length; i++) out[at + i] += b[i];
    });
    return out;
  },
};

// the whole track: every cue rendered and placed, panned (pan: -1 left .. 1 right), then levelled
export function renderTrack(cues, duration) {
  const n = Math.round(duration * RATE), L = new Float32Array(n), R = new Float32Array(n);
  cues.forEach((c, idx) => {
    const voice = VOICES[c.kind];
    if (!voice) throw new Error(`sound: no voice for cue kind "${c.kind}"`);
    const buf = voice(c, rng(1009 * (idx + 1)));
    const p = Math.max(-1, Math.min(1, c.pan || 0)), gl = Math.cos((p + 1) * Math.PI / 4), gr = Math.sin((p + 1) * Math.PI / 4);
    const at = Math.round(c.t * RATE);
    for (let i = 0; i < buf.length && at + i < n; i++) { L[at + i] += buf[i] * gl * Math.SQRT2; R[at + i] += buf[i] * gr * Math.SQRT2; }
  });
  // a gentle limiter, then the peak to -1 dBFS (ffmpeg then sets the loudness, -16 LUFS); the last 80 ms fade to silence so the loop point is clean
  let peak = 0;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2) / 1.2; R[i] = Math.tanh(R[i] * 1.2) / 1.2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = peak ? Math.pow(10, -1 / 20) / peak : 1, tail = Math.round(0.08 * RATE);
  for (let i = 0; i < n; i++) { const f = i > n - tail ? (n - i) / tail : 1; L[i] *= g * f; R[i] *= g * f; }
  return { L, R };
}

export function wav({ L, R }) {
  const n = L.length, data = Buffer.alloc(n * 4), head = Buffer.alloc(44);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8, 'latin1');
  head.write('fmt ', 12, 'latin1'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36, 'latin1'); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
