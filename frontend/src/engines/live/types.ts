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
  /** 话痨 0~1：开口的门槛低 */
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
  /** 被谁打断了（名字） */
  cutBy?: string;
  /** 这句是插嘴 */
  interrupt?: boolean;
}

/** 模型给的一次内心反应（已清洗） */
export interface Reaction {
  inner: string;
  /** 这一下各种情绪的变化，-3~3 */
  mood: Record<string, number>;
  /** 对谁的好感变化，键是 agentId 或 'user' */
  toward: Record<string, number>;
  stance: string;
  hooks: string[];
  plan: string;
  /** 多想开口，0~10 */
  urge: number;
  interrupt: boolean;
  /** 听到对方哪几个字就忍不住插嘴（原文里的几个字） */
  cutAfter: string;
  replyTo?: string;
  /** 要说出口的话，一条到三条 */
  say: string[];
  /** 不抢话的小反应 */
  react: string;
  /** 把话题岔到了哪 */
  topic: string;
  /** 私下回用户的话 */
  privateReply: string;
}

/** 拼一次反应提示词的材料；聊天记录在前、状态在后，前面不变的部分能被模型服务缓存 */
export interface ReactionInput {
  self: Participant;
  cfg: SessionConfig;
  temper: Temperament;
  /** 公开聊天记录（已排好） */
  transcript: string;
  /** 只有他和用户知道的私下对话，没有就空 */
  privates: string;
  /** 他现在的状态：情绪、好恶、态度、打算…… */
  state: string;
  /** 这一刻发生了什么、要他做什么 */
  now: string;
}

/** 一个模式的玩法：在乎哪些情绪、人物性情从哪来、提示词怎么写、怎么总结 */
export interface LiveKit {
  moods: MoodDef[];
  /** 开场时调一次，比如抽梗卡 */
  setup?(cfg: SessionConfig): void;
  temperament(p: Participant): Temperament;
  reactionMessages(x: ReactionInput): LlmMessage[];
  summaryMessages(cfg: SessionConfig, log: string): LlmMessage[];
  parseSummary(text: string): DiscussionResult;
}

export interface LiveOptions {
  temperature: number;
  summaryTemperature: number;
  /** 一场最多几次发言（一次连发几条算一次），到了就散场 */
  maxMessages: number;
  /** 节奏倍数：1 正常，越大越慢；0 不等待 */
  pace: number;
}

export const LIVE_DEFAULTS: LiveOptions = { temperature: 1, summaryTemperature: 0.3, maxMessages: 50, pace: 1 };

export function readLiveOptions(raw: Record<string, unknown> | undefined): LiveOptions {
  const o = { ...LIVE_DEFAULTS, ...(raw ?? {}) } as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    temperature: num(o.temperature, LIVE_DEFAULTS.temperature, 0, 2),
    summaryTemperature: num(o.summaryTemperature, LIVE_DEFAULTS.summaryTemperature, 0, 2),
    maxMessages: Math.round(num(o.maxMessages, LIVE_DEFAULTS.maxMessages, 4, 500)),
    pace: num(o.pace, LIVE_DEFAULTS.pace, 0, 10),
  };
}
