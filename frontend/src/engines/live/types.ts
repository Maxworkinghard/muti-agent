import type { LlmMessage } from '../../llm/client';
import type { DiscussionResult, Participant, PersonaVisual, SessionConfig } from '../../types';

/** 调一次模型拿回全文。浏览器里走 /api/llm/chat；命令行模拟时直连模型服务 */
export type ChatFn = (messages: LlmMessage[], opt: { temperature?: number; signal?: AbortSignal }) => Promise<string>;

/** 一种情绪：强度 0~10，每个档位的说法和表情 */
export interface MoodDef {
  key: string;
  emoji: string;
  color: string;
  face: NonNullable<PersonaVisual['extras']>;
  /** 从低到高的档位：[强度下限, 说法] */
  levels: Array<[number, string]>;
  /** 每过一次发言，往平时的状态回落多少（0~1） */
  decay: number;
  /** 被哪项性情放大：temper 放大火气，sensitivity 放大委屈 */
  amplify?: 'temper' | 'sensitivity';
  /** 记仇的人这种情绪消得慢 */
  grudge?: boolean;
  /** 这种情绪高的时候反应快、容易插嘴 */
  hot?: boolean;
  /** 每过一次发言自己涨一点（比如无聊：聊久了自然会腻） */
  drift?: number;
}

/** 性情：同一句话在他身上激起多大情绪、多想开口、多快开口 */
export interface Temperament {
  /** 脾气：火气放大倍数，1 是普通人 */
  temper: number;
  /** 玻璃心：委屈放大倍数 */
  sensitivity: number;
  /** 记仇 0~1：火气和好恶消得慢 */
  grudge: number;
  /** 要面子 0~1：很难当场认输 */
  face: number;
  /** 话痨 0~1：开口的门槛低，抽谁开口时冲动大 */
  talk: number;
  /** 嘴快：反应和说话速度的倍数 */
  speed: number;
  /** 平时的情绪 */
  baseline: Record<string, number>;
  /** 开场时对某些人的好恶，键是人物 id */
  relations: Record<string, number>;
}

/** 公开记录里的一条 */
export interface Line {
  /** 给模型看的编号，如 m12 */
  id: string;
  /** 界面上的消息 id */
  msgId: string;
  /** agentId 或 'user' */
  speaker: string;
  name: string;
  text: string;
  kind: 'say' | 'user' | 'react';
  replyTo?: string;
  /** 冲谁说的：agentId、'user' 或空 */
  to?: string;
  /** 被谁打断了（名字） */
  cutBy?: string;
  /** 这句是插嘴 */
  interrupt?: boolean;
}

/** 导演提名的一个候选：谁可能接、冲谁、话头 */
export interface Candidate {
  speaker: string;
  /** 冲谁说：agentId、'user' 或空 */
  to: string;
  /** 话头：这句大概往哪说（不是台词，演员可以不照着来） */
  gist: string;
  /** 建议的情绪，几个字 */
  emotion: string;
  replyTo?: string;
  /** 插嘴：打断正在说的人 */
  interrupt: boolean;
  /** 听到对方哪几个字就忍不住了 */
  cutAfter: string;
}

/**
 * 导演这一步的安排（已清洗，名字都换成了 agentId）。导演只提名候选，谁开口由引擎按各人的冲动抽；
 * 顶层的 speaker / to / gist…是抽中的那一个。每个人的态度和打算不归导演管，由演员自己报
 */
export interface Cue extends Candidate {
  /** 导演提名的候选，第一个是导演首选；空表示这一步没人说（冷场） */
  candidates: Candidate[];
  /** 抽中的是第几个候选；-1 表示按硬规则另派的（比如用户点了名） */
  picked: number;
  /** 抽签时各候选此刻的冲动（命令行调参看） */
  weights: number[];
  /** 旁人这一步的情绪变化，-2~2（说话的人自己的由他自己报） */
  mood: Record<string, Record<string, number>>;
  /** 说话状态变成什么（过几次发言自动回到平时的样子，导演再写一次就续上） */
  style: Record<string, string>;
  /** 谁对谁的好感变化 */
  toward: Record<string, Record<string, number>>;
  /** 旁人顺口的小反应：导演定谁、哪种反应，说什么由引擎从这个人自己的小反应里挑 */
  react: Array<{ id: string; kind: string; text: string }>;
  /** 全场走到哪（升温、爆发、冷却……） */
  arc: string;
  /** 导演接下来几步的打算 */
  arcNote: string;
  topic: string;
  end: boolean;
}

/** 角色这一句（或者私下回你的话）：说什么、心里怎么想，都是他自己定的 */
export interface Speech {
  say: string[];
  inner: string;
  privateReply: string;
  /** 他对这件事的真实看法（没变为空） */
  stance: string;
  plan: string;
  /** 说完这句他自己的情绪变化 */
  mood: Record<string, number>;
  /** 是不是顺着导演的建议说的；不是的话 why 写一句为什么 */
  follow: boolean;
  why: string;
}

/** 给命令行调参看的：导演怎么提名、抽中了谁，演员有没有照导演说 */
export type DebugEvent =
  | { type: 'cue'; cue: Cue; speaker: string }
  | { type: 'speech'; speaker: string; follow: boolean; why: string; stance: string; plan: string };

/** 拼导演提示词的材料：记录在前、状态在后，前面不变的部分能被模型服务缓存 */
export interface DirectorInput {
  cfg: SessionConfig;
  transcript: string;
  /** 每个人现在的账：情绪、说话状态、态度、打算、好恶、多久没说话 */
  state: string;
  /** 全场走到哪、导演上次的打算 */
  arc: string;
  /** 这一步之前发生的事：用户说了什么、私聊了谁、冷场、快散场…… */
  now: string;
}

/** 拼角色提示词的材料 */
export interface ActorInput {
  self: Participant;
  cfg: SessionConfig;
  temper: Temperament;
  transcript: string;
  privates: string;
  /** 他自己的账 */
  state: string;
  /** 导演给他的这一步建议，或者用户的私聊 */
  cue: string;
  /** 这次是私下回用户 */
  whisper: boolean;
}

/** 一个模式的玩法：情绪、性情、导演和角色的提示词、总结 */
export interface LiveKit {
  moods: MoodDef[];
  /**
   * 分步走的模式（比如情感分析：回应情绪 → 分清事实与感受 → 下一步行动）。给了就按步骤分段：
   * 导演的 arc 写现在在哪一步，走到后面的步骤时界面开一段新的（只往前走）；
   * 没走到最后一步不散场：导演提前说 end 不算数，冷场时停下来等用户开口。发言条数用完照样散场
   */
  stages?: string[];
  /** 开场时调一次，比如抽梗卡 */
  setup?(cfg: SessionConfig): void;
  temperament(p: Participant): Temperament;
  directorMessages(x: DirectorInput): LlmMessage[];
  actorMessages(x: ActorInput): LlmMessage[];
  summaryMessages(cfg: SessionConfig, log: string): LlmMessage[];
  parseSummary(text: string): DiscussionResult;
}

export interface LiveOptions {
  /** 角色说话的温度 */
  temperature: number;
  /** 导演的温度，低一点更稳 */
  directorTemperature: number;
  summaryTemperature: number;
  /** 一场最多几次发言（一次连发几条算一次），到了就散场 */
  maxMessages: number;
  /** 节奏倍数：1 正常，越大越慢；0 不等待 */
  pace: number;
  /** 随性程度 0~1：谁开口有多少是按各人此刻的冲动抽的；0 总按导演首选，1 完全按冲动抽 */
  spontaneity: number;
}

export const LIVE_DEFAULTS: LiveOptions = { temperature: 1, directorTemperature: 0.8, summaryTemperature: 0.3, maxMessages: 50, pace: 1, spontaneity: 0.5 };

export function readLiveOptions(raw: Record<string, unknown> | undefined): LiveOptions {
  const o = { ...LIVE_DEFAULTS, ...(raw ?? {}) } as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    temperature: num(o.temperature, LIVE_DEFAULTS.temperature, 0, 2),
    directorTemperature: num(o.directorTemperature, LIVE_DEFAULTS.directorTemperature, 0, 2),
    summaryTemperature: num(o.summaryTemperature, LIVE_DEFAULTS.summaryTemperature, 0, 2),
    maxMessages: Math.round(num(o.maxMessages, LIVE_DEFAULTS.maxMessages, 4, 500)),
    pace: num(o.pace, LIVE_DEFAULTS.pace, 0, 10),
    spontaneity: num(o.spontaneity, LIVE_DEFAULTS.spontaneity, 0, 1),
  };
}

/** 小反应的种类：导演只定谁、哪一种，具体说什么从这个人自己的小反应里挑 */
export const REACT_KINDS = ['笑', '惊讶', '附和', '不服', '疑问', '心疼', '敷衍'];

/** 人物文件里的扩展字段：前端简化格式在 persona.extensions，协议格式在 persona.protocol */
export function personaExt(p: Participant, key: string): unknown {
  return p.persona.extensions?.[key] ?? (p.persona.protocol as Record<string, unknown> | undefined)?.[key];
}

/** 这个人会的小反应（x-reactions）：{ 笑: ["哈哈哈"], 附和: ["确实"] }；没写就是空，导演写的原话照用 */
export function readReactions(p: Participant): Record<string, string[]> {
  const raw = personaExt(p, 'x-reactions');
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const kind of REACT_KINDS) {
    const list = (raw as Record<string, unknown>)[kind];
    if (!Array.isArray(list)) continue;
    const clean = list.map((s) => String(s).trim().slice(0, 12)).filter(Boolean);
    if (clean.length) out[kind] = clean;
  }
  return out;
}
