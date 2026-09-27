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

/** 导演这一步的安排（已清洗，名字都换成了 agentId） */
export interface Cue {
  /** 下一句谁说；空表示这一步没人说（冷场） */
  speaker: string;
  /** 冲谁说：agentId、'user' 或空 */
  to: string;
  /** 这句的大意（不是台词） */
  gist: string;
  /** 他说这句时的情绪，几个字 */
  emotion: string;
  replyTo?: string;
  /** 插嘴：打断正在说的人 */
  interrupt: boolean;
  /** 听到对方哪几个字就忍不住了 */
  cutAfter: string;
  /** 这一步各人的情绪变化，-2~2 */
  mood: Record<string, Record<string, number>>;
  /** 说话状态变成什么（改了就一直带着） */
  style: Record<string, string>;
  stance: Record<string, string>;
  plan: Record<string, string>;
  /** 谁对谁的好感变化 */
  toward: Record<string, Record<string, number>>;
  /** 旁人顺口的小反应 */
  react: Array<{ id: string; text: string }>;
  /** 全场走到哪（升温、爆发、冷却……） */
  arc: string;
  /** 导演接下来几步的打算 */
  arcNote: string;
  topic: string;
  end: boolean;
}

/** 角色这一句（或者私下回你的话） */
export interface Speech {
  say: string[];
  inner: string;
  privateReply: string;
  plan: string;
  mood: Record<string, number>;
}

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
  /** 导演给他的这一步提示，或者用户的私聊 */
  cue: string;
  /** 这次是私下回用户 */
  whisper: boolean;
}

/** 一个模式的玩法：情绪、性情、导演和角色的提示词、总结 */
export interface LiveKit {
  moods: MoodDef[];
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
}

export const LIVE_DEFAULTS: LiveOptions = { temperature: 1, directorTemperature: 0.8, summaryTemperature: 0.3, maxMessages: 50, pace: 1 };

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
  };
}
