// Sound effects made with code (no audio files) and spoken lines for a reader who's still learning.
let ac = null, master = null, noiseBuf = null;
export const sound = { on: true };

export function initAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
}

function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
  if (!ac || !sound.on) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, freq, slideTo, delay = 0) {
  if (!ac || !sound.on) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}

// Rapid-fire guns would flood the audio graph; let each sound play at most every `gap` seconds.
const lastPlayed = {};
function limited(name, gap, fn) {
  return () => {
    const now = performance.now() / 1000;
    if (now - (lastPlayed[name] || 0) < gap) return;
    lastPlayed[name] = now; fn();
  };
}

export const sfx = {
  blaster: limited('blaster', 0.05, () => tone(980, 0.07, 'square', 0.04, 520)),
  rifle: limited('rifle', 0.06, () => { noise(0.05, 0.12, 3000, 800); tone(160, 0.04, 'square', 0.04); }),
  shotgun: () => { noise(0.25, 0.4, 2200, 200); tone(90, 0.15, 'sine', 0.25, 40); },
  sniper: () => { noise(0.5, 0.55, 2600, 120); tone(70, 0.35, 'sine', 0.4, 35); },
  bazooka: () => { noise(0.4, 0.25, 900, 300); tone(200, 0.3, 'sawtooth', 0.06, 80); },
  lightning: limited('lightning', 0.1, () => { noise(0.2, 0.25, 6000, 1500); tone(1400, 0.15, 'sawtooth', 0.05, 300); }),
  freeze: limited('freeze', 0.08, () => tone(1800, 0.08, 'sine', 0.04, 2600)),
  ally: limited('ally', 0.09, () => { noise(0.04, 0.06, 2600, 900); }),
  spit: () => tone(300, 0.2, 'sine', 0.08, 900),
  hit: limited('hit', 0.04, () => noise(0.08, 0.15, 2500)),
  pop: limited('pop', 0.05, () => { tone(520, 0.08, 'square', 0.08, 900); noise(0.15, 0.2, 1800, 300); }),
  jump: () => tone(380, 0.16, 'sine', 0.15, 760),
  hurt: limited('hurt', 0.2, () => tone(220, 0.25, 'sawtooth', 0.15, 90)),
  armor: limited('armor', 0.2, () => tone(700, 0.12, 'triangle', 0.12, 350)),
  save: () => [660, 830, 990, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.08, null, i * 0.07)),
  pickup: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'triangle', 0.12, null, i * 0.06)),
  unlock: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.09, null, i * 0.09)),
  cage: () => { noise(0.5, 0.3, 1600, 400); tone(140, 0.4, 'square', 0.08, 70); },
  boom: limited('boom', 0.08, () => noise(0.7, 0.5, 900, 60)),
  punch: () => { noise(0.18, 0.5, 1200, 150); tone(120, 0.2, 'sine', 0.35, 50); },
  roar: () => { noise(1.3, 0.5, 700, 160); tone(95, 1.3, 'sawtooth', 0.18, 48); },
  morph: () => { tone(200, 0.9, 'sawtooth', 0.12, 1400); tone(300, 0.9, 'square', 0.06, 2100); },
  ready: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.15, null, i * 0.1)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.09, null, i * 0.14)),
};

export function say(text) {
  if (!sound.on || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch (e) { /* no voice on this device */ }
}

export function toggleSound() {
  sound.on = !sound.on;
  if (!sound.on && 'speechSynthesis' in window) speechSynthesis.cancel();
  return sound.on;
}
