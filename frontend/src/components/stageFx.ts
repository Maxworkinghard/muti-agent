// 娱乐模式的舞台音效：背景音乐 + 用 WebAudio 现场合成的入场 / 思考音效
// 背景音乐：TinyWorlds《Happy Adventure (Loop)》，CC0，来源 https://opengameart.org/content/happy-adventure-loop
// 静音跟顶部的音效开关（sound.tsx）走同一个状态
import { isMuted } from '../sound';

const BGM_SRC = '/audio/bgm-happy-adventure.mp3';
const BGM_VOLUME = 0.35;
const BGM_DUCKED = 0.12;

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = 0.05) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function thump(c: AudioContext, at: number) {
  const len = Math.floor(c.sampleRate * 0.09);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = 'lowpass';
  f.frequency.value = 700;
  g.gain.value = 0.18;
  s.buffer = buf;
  s.connect(f).connect(g).connect(c.destination);
  s.start(at);
}

/** 第 i 位嘉宾入场：一段上行琶音，落地时一声闷响；每个人音高不同 */
export function playEntrance(i: number) {
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  const base = 392 * 2 ** (((i * 3) % 8) / 12);
  [1, 1.26, 1.5, 2].forEach((k, n) => tone(c, base * k, t + n * 0.07, 0.12));
  thump(c, t + 0.5);
}

/** 全员入场完毕 */
export function playReady() {
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, n) => tone(c, f, t + n * 0.09, n === 3 ? 0.4 : 0.1, 'square', 0.045));
}

/** 开始思考：两声很轻的“嘀嗒” */
export function playThinking() {
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  tone(c, 880, t, 0.06, 'triangle', 0.03);
  tone(c, 1174.66, t + 0.09, 0.08, 'triangle', 0.03);
}

export interface Bgm { start(): void; duck(): void; setMuted(m: boolean): void; stop(): void }

export function createBgm(): Bgm {
  const el = new Audio(BGM_SRC);
  el.loop = true;
  el.volume = 0;
  let target = BGM_VOLUME;
  let muted = isMuted();
  let timer = 0;
  const fadeTo = (v: number) => {
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      const d = v - el.volume;
      if (Math.abs(d) < 0.02) { el.volume = v; window.clearInterval(timer); return; }
      el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(d) * 0.02));
    }, 40);
  };
  return {
    start() {
      // 浏览器可能拦截自动播放；拦截时静默失败，不影响讨论
      el.play().catch(() => undefined);
      fadeTo(muted ? 0 : target);
    },
    duck() { target = BGM_DUCKED; fadeTo(muted ? 0 : target); },
    setMuted(m) {
      muted = m;
      if (!m && el.paused) el.play().catch(() => undefined);
      fadeTo(m ? 0 : target);
    },
    stop() { window.clearInterval(timer); el.pause(); el.src = ''; },
  };
}
