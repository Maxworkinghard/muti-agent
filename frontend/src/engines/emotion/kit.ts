import type { Participant } from '../../types';
import { modeById } from '../../data/modes';
import type { LiveKit, MoodDef, Temperament } from '../live/types';
import { buildActorMessages, buildDirectorMessages, buildSummaryMessages, parseSummary } from './prompt';

/**
 * 情感分析在乎的四种情绪，都是在座的人自己的情绪（不是当事人的）：
 * 心疼按心软放大；火气按脾气放大、记仇的人消得慢，火气高的人反应快、爱插嘴；
 * 担心在当事人流露很糟或危险的状态时涨；欣慰在当事人好受一点、愿意试试时涨。
 */
export const MOODS: MoodDef[] = [
  {
    key: '心疼', emoji: '🥺', color: 'var(--c-pink)', face: ['blush'],
    levels: [[3, '有点心疼'], [6, '心疼'], [8, '心疼坏了']], decay: 0.08, amplify: 'sensitivity',
  },
  {
    key: '火气', emoji: '😤', color: 'var(--c-red)', face: ['brows'],
    levels: [[3, '有点冒火'], [6, '火大'], [8, '快炸了']], decay: 0.14, amplify: 'temper', grudge: true, hot: true,
  },
  {
    key: '担心', emoji: '😟', color: 'var(--c-blue)', face: ['sweat'],
    levels: [[3, '有点担心'], [6, '担心'], [8, '揪心']], decay: 0.1,
  },
  {
    key: '欣慰', emoji: '😌', color: 'var(--c-green)', face: ['happy'],
    levels: [[4, '松了口气'], [6, '欣慰'], [8, '很欣慰']], decay: 0.1,
  },
];

/** 三步，和 data/modes.ts 的轮次名一致：界面按步骤分段，没走到最后一步不收尾 */
export const STAGES = modeById('emotion').roundLabels;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const nums = (v: unknown, lo: number, hi: number): Record<string, number> =>
  Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {})
    .filter(([, n]) => typeof n === 'number' && Number.isFinite(n))
    .map(([k, n]) => [k, clamp(n as number, lo, hi)]));

/**
 * 性情：读人物文件里的 x-temperament（简化格式在 persona.extensions，协议格式在 persona.protocol；说明见 frontend/personas/README.md）；
 * 没写的项按 communicationStyle 估一个，简化格式没有这一块就按普通人算。
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
    baseline: { 心疼: 2, 火气: 1, 担心: 2, 欣慰: 1, ...nums(x.baseline, 0, 10) },
    relations: nums(x.relations, -10, 10),
  };
}

/** 情感分析的玩法：情绪、性情、三步、导演和演员的提示词、总结 */
export function createEmotionKit(): LiveKit {
  return {
    moods: MOODS,
    stages: STAGES,
    temperament: readTemperament,
    directorMessages: (x) => buildDirectorMessages({ ...x, moods: MOODS, stages: STAGES, temper: readTemperament }),
    actorMessages: (x) => buildActorMessages({ ...x, moods: MOODS }),
    summaryMessages: buildSummaryMessages,
    parseSummary,
  };
}
