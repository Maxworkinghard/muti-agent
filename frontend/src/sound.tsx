import { useSyncExternalStore } from 'react';

/** 8-bit 音效：用 Web Audio 现场合成，不需要音频文件 */

const MUTE_KEY = 'roundtable.muted';
// 浏览器禁用本地存储时读写会抛错，这时只是记不住静音设置
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

function audio() {
  if (muted) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 方波音符：freq 起始频率，to 结束频率（滑音），at 延迟秒数 */
function tone(ac: AudioContext, freq: number, dur: number, at = 0, to?: number, vol = 0.08, type: OscillatorType = 'square') {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** 入座：一声下落的“噗”，接一声叮；第几个人入座，叮声就高一点 */
export function playSeat(index = 0) {
  const ac = audio();
  if (!ac) return;
  tone(ac, 520, 0.12, 0, 140, 0.07, 'triangle');
  const base = [523, 587, 659, 698, 784, 880, 988, 1047][index % 8];
  tone(ac, base, 0.09, 0.11);
  tone(ac, base * 1.5, 0.16, 0.19);
}

/** 移出座位：两个下行音 */
export function playLeave() {
  const ac = audio();
  if (!ac) return;
  tone(ac, 440, 0.08, 0, undefined, 0.06);
  tone(ac, 294, 0.14, 0.08, undefined, 0.06);
}

/** 全员就座：上行琶音 */
export function playReady() {
  const ac = audio();
  if (!ac) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.14, i * 0.09, undefined, 0.06));
}

export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* 记不住也不影响本次 */ }
  listeners.forEach((l) => l());
}

export function useMuted() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => muted);
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const m = useMuted();
  return (
    <button className={'sound-btn ' + (m ? 'off ' : '') + className} onClick={() => setMuted(!m)} title={m ? '打开音效' : '关闭音效'}>
      ♪<span>{m ? ' 静音' : ' 音效'}</span>
    </button>
  );
}
