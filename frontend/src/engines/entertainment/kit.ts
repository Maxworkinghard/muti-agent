import type { Participant } from '../../types';
import type { LiveKit, MoodDef, Temperament } from '../live/types';
import { MEME_CARDS, type MemeCard } from './material';
import { readOptions } from './config';
import { buildActorMessages, buildDirectorMessages, buildSummaryMessages, parseSummary } from './prompt';

/**
 * 娱乐模式在乎的四种情绪。火气按脾气放大、委屈按玻璃心放大，记仇的人消得慢；
 * 火气和开心高的人反应快、爱插嘴；无聊每过一次发言自己涨一点，聊久了自然会腻、会散场。
 */
export const MOODS: MoodDef[] = [
  {
    key: '火气', emoji: '😤', color: 'var(--c-red)', face: ['brows'],
    levels: [[3, '有点不爽'], [6, '上头了'], [8, '快炸了']], decay: 0.14, amplify: 'temper', grudge: true, hot: true,
  },
  {
    key: '委屈', emoji: '😣', color: 'var(--c-blue)', face: ['sweat', 'blush'],
    levels: [[3, '有点憋屈'], [6, '没面子'], [8, '委屈坏了']], decay: 0.12, amplify: 'sensitivity', grudge: true,
  },
  {
    key: '开心', emoji: '😆', color: 'var(--c-yellow)', face: ['happy', 'grin'],
    levels: [[5, '挺乐'], [7, '兴头上'], [9, '笑疯了']], decay: 0.12, hot: true,
  },
  {
    key: '无聊', emoji: '🥱', color: 'var(--ink-2)', face: ['sleepy'],
    levels: [[4, '有点无聊'], [6, '没劲'], [8, '想溜了']], decay: 0.06, drift: 0.2,
  },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const nums = (v: unknown, lo: number, hi: number): Record<string, number> =>
  Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {})
    .filter(([, n]) => typeof n === 'number' && Number.isFinite(n))
    .map(([k, n]) => [k, clamp(n as number, lo, hi)]));

/**
 * 性情：优先读人物文件里的 x-temperament（简化格式在 persona.extensions，协议格式在 persona.protocol；
 * 说明见 frontend/personas/README.md）；没写的项按 communicationStyle 估一个
 * （情绪外放的脾气急一点，篇幅长、爱开玩笑的话多一点）。
 */
export function readTemperament(p: Participant): Temperament {
  const pr = (p.persona.protocol ?? {}) as Record<string, any>;
  const raw = p.persona.extensions?.['x-temperament'] ?? pr['x-temperament'];
  const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cs = (pr.communicationStyle ?? {}) as Record<string, unknown>;
  const expr = cs.emotionalExpression === 'expressive' ? 1.15 : cs.emotionalExpression === 'restrained' ? 0.65 : 0.9;
  const talk = (cs.verbosity === 'long' ? 0.65 : cs.verbosity === 'medium' ? 0.55 : 0.5) + (cs.humor === 'frequent' ? 0.1 : 0);
  return {
    temper: num(x.temper, expr, 0.2, 2),
    sensitivity: num(x.sensitivity, expr, 0.2, 2),
    grudge: num(x.grudge, 0.3, 0, 1),
    face: num(x.face, 0.5, 0, 1),
    talk: num(x.talk, talk, 0, 1),
    speed: num(x.speed, 1, 0.4, 2),
    baseline: { 火气: 1, 委屈: 0, 开心: 4, 无聊: 2, ...nums(x.baseline, 0, 10) },
    relations: nums(x.relations, -10, 10),
  };
}

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 娱乐模式的玩法：情绪、性情、导演和演员的提示词、总结；每场开一个（梗卡每场重新抽） */
export function createEntertainmentKit(): LiveKit {
  let memes: MemeCard[] = [];
  return {
    moods: MOODS,
    setup(cfg) {
      const o = readOptions(cfg.engineOptions);
      memes = o.memesEnabled ? sample(MEME_CARDS, o.memeCount) : [];
    },
    temperament: readTemperament,
    directorMessages: (x) => buildDirectorMessages({ ...x, moods: MOODS, temper: readTemperament }),
    actorMessages: (x) => buildActorMessages({ ...x, memes, moods: MOODS }),
    summaryMessages: buildSummaryMessages,
    parseSummary,
  };
}
