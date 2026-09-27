import { useSyncExternalStore } from 'react';

/** 8-bit 音效：用 Web Audio 现场合成，不需要音频文件 */

const MUTE_KEY = 'roundtable.muted';
let muted = localStorage.getItem(MUTE_KEY) === '1';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

function audio() {
  if (muted) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 在用户点击时调用，提前唤醒音频，避免第一声被浏览器吞掉 */
export function warmAudio() {
  audio();
}

/** 音频还没唤醒时，等唤醒后再播放，第一声不会丢 */
function whenReady(play: (ac: AudioContext) => void) {
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'running') play(ac);
  else ac.resume().then(() => play(ac)).catch(() => {});
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

/** 每个人的嗓音：按 id 算出固定的音高、音色和语速，同一个人每次听起来都一样 */
function voiceOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const types: OscillatorType[] = ['square', 'triangle', 'sawtooth', 'square'];
  return {
    base: 180 + (h % 17) * 22,           // 180 ~ 530 Hz，低沉到尖细
    type: types[(h >>> 5) % types.length],
    gap: 0.075 + ((h >>> 9) % 4) * 0.012, // 每个音节的间隔（语速）
    spread: 0.25 + ((h >>> 13) % 4) * 0.1, // 音节之间音高的起伏
    glide: (h >>> 17) % 2 === 0 ? 1.18 : 0.82, // 每个音节往上挑还是往下落
  };
}

/**
 * 说话音效：像素游戏村民那种“叽叽咕咕”，几个短促的音节连在一起。
 * syllables 控制长短，文字多就多说几个音节
 */
export function playVoice(id: string, syllables = 5) {
  const v = voiceOf(id);
  whenReady((ac) => {
    for (let i = 0; i < syllables; i++) {
      const f = v.base * (1 + (Math.random() * 2 - 1) * v.spread);
      tone(ac, f, v.gap * 0.8, i * v.gap, f * v.glide, v.type === 'sawtooth' ? 0.035 : 0.05, v.type);
    }
  });
}

export function setMuted(v: boolean) {
  muted = v;
  localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  listeners.forEach((l) => l());
}

export function useMuted() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => muted);
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const m = useMuted();
  return (
    <button className={'sound-btn ' + className} onClick={() => setMuted(!m)} title={m ? '打开音效' : '关闭音效'}>
      {m ? '♪ 静音' : '♪ 音效'}
    </button>
  );
}
