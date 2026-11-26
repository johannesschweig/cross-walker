// Music and sound effects.
import musicUrl from './assets/sounds/music-web.mp3';
import fireUrl from './assets/sounds/fire.mp3';
import { el } from './dom.js';
import { getFlag, setFlag } from './storage.js';

let muted = getFlag('cw-muted');

// The music is streamed with an <audio> element. Don't fetch() it: that fails in static previews.
const MUSIC_VOL = 0.35;
const music = new Audio(musicUrl);
music.loop = true;
music.volume = MUSIC_VOL;
music.preload = 'none';       // don't spend mobile data before the player has interacted
const fireSound = new Audio(fireUrl);
fireSound.volume = 0.7;

// 'waiting' = browser needs a tap first, 'playing', or 'failed'.
let musicStatus = 'waiting';
let bufferMusic = null;       // set when the Web Audio fallback below is running
let audioCtx = null;
let audioStarted = false;

const musicErrors = [];
const musicFail = (why) => {
  musicErrors.push(why);
  console.warn('Cross Walker music:', why);
  el.sound.title = `Music problem: ${location.protocol} ${musicErrors.join(' → ')}`;
};

// Some environments can't stream the mp3 through an <audio> element, e.g. servers without
// byte-range support (Safari is picky about that). Then we load the track as base64 text from
// assets/sounds/music-data.js (built by tools/make-music-data.sh) and play it through Web Audio.
// It is a separate chunk, so it only gets downloaded when this fallback is needed.
async function loadEmbeddedMusic() {
  const { default: base64 } = await import('./assets/sounds/music-data.js');
  const bin = atob(base64 || '');
  if (!bin) throw new Error('music-data.js is empty');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function startBufferMusic() {
  if (bufferMusic) return;
  if (!audioCtx) { musicFail('Web Audio is not available'); musicStatus = 'failed'; return; }
  bufferMusic = {};
  try {
    const data = await loadEmbeddedMusic();
    const src = audioCtx.createBufferSource();
    src.buffer = await audioCtx.decodeAudioData(data);
    src.loop = true;
    const gain = audioCtx.createGain();
    gain.gain.value = muted ? 0 : MUSIC_VOL;
    src.connect(gain).connect(audioCtx.destination);
    src.start();
    bufferMusic.gain = gain;
    musicStatus = 'playing';
  } catch (err) {
    bufferMusic = null;
    musicStatus = 'failed';
    musicFail('fallback: ' + ((err && err.message) || err));
  }
}

function blip(freqs, len, vol) {
  if (muted || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, t0 + (i * len) / freqs.length));
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0); osc.stop(t0 + len);
}

export const sfx = {
  gold: () => blip([880, 1320], 0.12, 0.05),
  push: () => blip([110, 90], 0.08, 0.06),
  splash: () => blip([300, 200, 140], 0.2, 0.05),
  win: () => blip([523, 659, 784, 1047], 0.4, 0.05),
  undo: () => blip([300, 220], 0.06, 0.04),
  burn: () => blip([700, 420, 640, 260, 480, 180], 0.45, 0.05),
  fire: () => { if (muted) return; fireSound.currentTime = 0; fireSound.play().catch(() => {}); },
};

// Browsers only allow sound after a tap / key press, so the music starts on the first input.
// (iOS only accepts touchend / click as a gesture, which is why we listen for those too.)
function startAudio() {
  audioStarted = true;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (bufferMusic || muted || !music.paused) return;
  music.play().catch((err) => {
    if (err.name === 'NotAllowedError') return;                // needs a gesture: try again later
    musicFail(err.name + ': ' + err.message);
    startBufferMusic();
  });
}

function updateSoundButton() {
  el.sound.classList.toggle('off', muted);
  el.sound.setAttribute('aria-pressed', String(!muted));
}

function setMuted(m) {
  muted = m;
  setFlag('cw-muted', m);
  if (bufferMusic && bufferMusic.gain) bufferMusic.gain.gain.value = muted ? 0 : MUSIC_VOL;
  else if (muted) music.pause();
  else startAudio();
  updateSoundButton();
}

export const toggleMute = () => setMuted(!muted);

export function initAudio() {
  music.addEventListener('playing', () => { musicStatus = 'playing'; });
  music.addEventListener('error', () => {
    musicFail('player error ' + (music.error ? music.error.code : '?'));
    if (audioCtx) startBufferMusic();     // otherwise this happens on the first tap
  });
  // Pause everything while the page is in the background (phones: screen off / app switch).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!music.paused) music.pause();
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else if (audioStarted && !muted) {
      startAudio();
    }
  });
  ['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) =>
    addEventListener(ev, () => { if (!audioStarted) startAudio(); }, { passive: true }));
  updateSoundButton();
}
