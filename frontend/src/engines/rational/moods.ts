import type { Participant } from '../../types';
import type { MoodDef, Temperament } from '../live/types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const nums = (v: unknown, lo: number, hi: number): Record<string, number> =>
  Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {})
    .filter(([, n]) => typeof n === 'number' && Number.isFinite(n))
    .map(([k, n]) => [k, clamp(n as number, lo, hi)]));

/**
 * 辩手在乎的四种情绪，和娱乐/情感分析共用 live/mind.ts 的记账方式：
 * 每说一句往平时的状态回落一点，被质询时涨、答不上来时憋、占上风时信心足。
 * 四种情绪各对应一套完全不同的表情，界面上的脸和标签都跟着它们走。
 */
export const DEBATE_MOODS: MoodDef[] = [
  {
    key: '火气', emoji: '😤', color: 'var(--c-red)', face: ['brows'],
    levels: [[3, '有点上头'], [6, '来劲了'], [8, '火力全开']], decay: 0.16, amplify: 'temper', grudge: true, hot: true,
  },
  {
    key: '压力', emoji: '😓', color: 'var(--c-orange)', face: ['sweat'],
    levels: [[3, '有点紧'], [6, '被问住了'], [8, '快顶不住']], decay: 0.14,
  },
  {
    key: '信心', emoji: '🙂', color: 'var(--c-blue)', face: ['happy'],
    levels: [[5, '有底气'], [7, '稳了'], [9, '胜券在握']], decay: 0.1,
  },
  {
    key: '憋屈', emoji: '😣', color: 'var(--c-purple)', face: ['blush'],
    levels: [[3, '有点憋'], [6, '说不出话'], [8, '被将死了']], decay: 0.12, amplify: 'sensitivity', grudge: true,
  },
];

/**
 * 性情：读人物文件里的 x-temperament（协议格式在 persona.protocol，简化格式在 extensions）。
 * 辩论组的 5 个人物来自 backend/人物/理性/，走协议格式，没有 x-temperament 时按 communicationStyle 估一个：
 * 情绪外放的脾气急、玻璃心；篇幅长爱开玩笑的话多。都没写就按普通人算。
 */
export function readDebateTemperament(p: Participant): Temperament {
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
    // 平时的状态都压在最低档以下，开场默认是「平静」，不会一上来就挂着表情
    baseline: { 火气: 1, 压力: 2, 信心: 4, 憋屈: 1, ...nums(x.baseline, 0, 10) },
    relations: nums(x.relations, -10, 10),
  };
}
