import type { MindView, Participant } from '../../types';
import type { MoodDef, Temperament } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 一个人的内心账本。情绪的涨落由模型判断（这句话多扎心），账由代码记：
 * 性情决定放大多少，每过一次发言往平时的状态回落一点，记仇的人回落得慢。
 * 不把这笔账交给模型，是因为聊几轮它就忘了自己在生气。
 */
export interface Mind {
  p: Participant;
  id: string;
  name: string;
  t: Temperament;
  mood: Record<string, number>;
  /** 对别人的好恶，键是 agentId 或 'user'，-10~10 */
  rel: Record<string, number>;
  /** 开场时的好恶，好恶往这里回落 */
  seed: Record<string, number>;
  inner: string;
  stance: string;
  hooks: string[];
  plan: string;
  /** 现在的说话状态（导演定），比如“句子变短，开始翻旧账”；过几次发言自动回到平时的样子 */
  style: string;
  /** 说话状态是第几次发言时定的 */
  styleAt: number;
  /** 他会的小反应，按种类分（人物文件的 x-reactions） */
  reactions: Record<string, string[]>;
  /** 最近用过的小反应，别老是同一句 */
  recentReacts: string[];
  /** 上一次开口是第几次发言；-1 表示还没开过口 */
  lastSpoke: number;
  /** 只有他和用户知道的私下对话 */
  privates: Array<{ who: 'user' | 'self'; text: string }>;
  /** 刚才被谁打断、没说完的是什么 */
  cutoff?: { by: string; rest: string };
}

export function createMind(
  p: Participant, t: Temperament, moods: MoodDef[], seed: Record<string, number>, reactions: Record<string, string[]> = {},
): Mind {
  const mood: Record<string, number> = {};
  for (const d of moods) mood[d.key] = clamp(t.baseline[d.key] ?? 0, 0, 10);
  return {
    p, id: p.agentId, name: p.persona.name, t, mood, rel: { ...seed }, seed,
    inner: '', stance: '', hooks: [], plan: '', style: '', styleAt: 0, reactions, recentReacts: [], lastSpoke: -1, privates: [],
  };
}

/** 记下一次情绪变化：火气按脾气放大，委屈按玻璃心放大 */
export function feel(m: Mind, delta: Record<string, number>, moods: MoodDef[]) {
  for (const d of moods) {
    let v = delta[d.key] ?? 0;
    if (!v) continue;
    if (d.amplify && v > 0) v *= m.t[d.amplify];
    m.mood[d.key] = clamp(m.mood[d.key] + v, 0, 10);
  }
}

/** 每过一次发言：情绪往平时回落（有的情绪自己会涨，比如聊久了会腻），好恶往开场时回落；记仇的人回落得慢 */
export function cool(m: Mind, moods: MoodDef[]) {
  for (const d of moods) {
    const rate = d.decay * (d.grudge ? 1 - 0.6 * m.t.grudge : 1);
    const base = clamp(m.t.baseline[d.key] ?? 0, 0, 10);
    m.mood[d.key] = clamp(m.mood[d.key] + (base - m.mood[d.key]) * rate + (d.drift ?? 0), 0, 10);
  }
  const rate = 0.05 * (1 - 0.7 * m.t.grudge);
  for (const k of Object.keys(m.rel)) m.rel[k] += ((m.seed[k] ?? 0) - m.rel[k]) * rate;
}

export function like(m: Mind, who: string, delta: number) {
  m.rel[who] = clamp((m.rel[who] ?? 0) + delta, -10, 10);
}

/** 情绪里最高的那个“热”情绪，0~1：高的人反应快、爱插嘴 */
export function heat(m: Mind, moods: MoodDef[]) {
  return Math.max(0, ...moods.filter((d) => d.hot).map((d) => m.mood[d.key] / 10));
}

export function level(d: MoodDef, v: number) {
  let word = '';
  for (const [min, w] of d.levels) if (v >= min) word = w;
  return word;
}

/** 现在最明显的情绪：超过最低档位最多的那个 */
export function dominant(m: Mind, moods: MoodDef[]) {
  let best: MoodDef | null = null;
  let margin = 0;
  for (const d of moods) {
    const over = m.mood[d.key] - d.levels[0][0];
    if (over >= 0 && (best === null || over > margin)) { best = d; margin = over; }
  }
  return best;
}

export function moodLabel(m: Mind, moods: MoodDef[]) {
  const d = dominant(m, moods);
  return d ? d.emoji + ' ' + level(d, m.mood[d.key]) : '🙂 平静';
}

/** 给模型看的情绪：火气 7/10（上头了）、委屈 2/10…… */
export function moodWords(m: Mind, moods: MoodDef[]) {
  return moods.map((d) => {
    const v = Math.round(m.mood[d.key]);
    const w = level(d, m.mood[d.key]);
    return d.key + ' ' + v + '/10' + (w ? '（' + w + '）' : '');
  }).join('，');
}

export function relationWord(v: number) {
  if (v <= -6) return '很不爽';
  if (v <= -3) return '有点不爽';
  if (v >= 6) return '很对胃口';
  if (v >= 3) return '挺顺眼';
  return '';
}

export function view(m: Mind, moods: MoodDef[], nameOf: (id: string) => string, whisper?: string): MindView {
  const d = dominant(m, moods);
  const toward = Object.entries(m.rel)
    .map(([id, v]) => ({ id, name: nameOf(id), value: Math.round(v) }))
    .filter((x) => Math.abs(x.value) >= 2)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5);
  return {
    mood: moods.map((x) => ({ key: x.key, value: Math.round(m.mood[x.key] * 10) / 10, color: x.color })),
    label: d ? level(d, m.mood[d.key]) : '平静',
    emoji: d ? d.emoji : '🙂',
    face: d ? d.face : [],
    inner: m.inner || undefined,
    stance: m.stance || undefined,
    plan: m.plan || undefined,
    style: m.style || undefined,
    toward,
    whisper,
  };
}
