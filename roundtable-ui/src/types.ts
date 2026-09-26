export type ModeId = 'entertainment' | 'rational' | 'product';
/** 内置场景：roundtable / debate / office / classroom / meadow；用户添加的场景以 custom- 开头 */
export type SceneId = string;
export type Side = 'pro' | 'con' | 'host';

export interface Personality {
  id: string;
  label: string;
  /** 这种性格下的行为方式 */
  behavior: string;
  /** 表达风格 */
  style: string;
  /** mock 引擎用的口头禅，可选 */
  opener?: string;
}

export interface PersonaVisual {
  skin: string;
  hair: string;
  shirt: string;
  accent: string;
  hairStyle?: 'short' | 'long' | 'bun' | 'cap';
  /** 头像图片地址；为空时画像素小人 */
  image?: string;
}

/** 人物资料：知识和思想固定，性格可选 */
export interface Persona {
  id: string;
  name: string;
  /** 可以出现在哪些模式里；缺省表示所有模式都可用 */
  modes?: ModeId[];
  identity: string;
  knowledge: string[];
  thinking: string;
  values: string;
  personalities: Personality[];
  defaultPersonalityId: string;
  boundaries: string[];
  visual: PersonaVisual;
  /** 从人格资料包协议 v1.0 导入时保留的原始 persona，引擎可直接读取 */
  protocol?: Record<string, unknown>;
}

export interface Seat {
  x: number; // 占底图宽度的百分比
  y: number; // 占底图高度的百分比
  group?: Side;
}

export interface SceneDef {
  id: SceneId;
  name: string;
  image: string;
  description: string;
  recommendedMode: ModeId;
  maxSeats: number;
  seats: Seat[];
  /** 场景中心：圆桌中心 / 文件交换台 */
  center?: { x: number; y: number };
  /** 用户自己添加的场景 */
  custom?: boolean;
}

export interface ModeDef {
  id: ModeId;
  name: string;
  tag: string;
  desc: string;
  color: string;
  scene: SceneId;
  roundLabels: string[];
  presets: string[];
  /** 选人物页导入按钮的文字 */
  importLabel: string;
}

/** 前端交给引擎的会话配置 */
export interface Participant {
  agentId: string;
  seatIndex: number;
  color: string;
  side?: Side;
  isLead?: boolean;
  personalityId: string;
  persona: Persona;
}

export interface SessionConfig {
  sessionId: string;
  mode: ModeId;
  sceneId: SceneId;
  /** brief：用户在讨论开始前发的第一句话，即对项目的详细理解 */
  theme: { title: string; brief?: string };
  maxRounds: number;
  /** 每次发言的字数上限；不填表示不限制 */
  maxChars?: number;
  participants: Participant[];
  /** 引擎可调参数，默认值在各引擎文件夹的 config.ts 里 */
  engineOptions: Record<string, unknown>;
  createdAt: string;
}

export type AgentState = 'idle' | 'thinking' | 'speaking' | 'working' | 'done';

export interface ChatMessage {
  id: string;
  round: number;
  /** agentId，或 'user' / 'system' */
  speakerId: string;
  text: string;
  kind: 'speech' | 'user' | 'reply' | 'system' | 'task';
  /** 用户消息指向的成员；成员回复用户时为 'user' */
  targetId?: string;
  at: number;
}

export interface TaskEvent {
  id: string;
  title: string;
  from: string;
  to: string;
  status: 'assigned' | 'handoff' | 'done';
}

export interface DiscussionResult {
  consensus: string[];
  disagreements: string[];
  openQuestions: string[];
  suggestions: string[];
  deliverables?: string[];
}

/** 引擎回传给前端的事件 */
export type EngineEvent =
  | { type: 'session'; state: 'running' | 'finished' | 'stopped' }
  | { type: 'round'; round: number; label: string }
  | { type: 'status'; agentId: string; state: AgentState; action: string }
  | { type: 'message'; message: ChatMessage }
  /** 流式发言：先发一条 message，再用同一个 id 不断更新全文 */
  | { type: 'message_update'; id: string; text: string }
  | { type: 'task'; task: TaskEvent }
  | { type: 'result'; result: DiscussionResult }
  /** 调用 AI 等出错；agentId 为空表示整场出错。retry 存在时界面显示“重试”按钮 */
  | { type: 'error'; id: string; agentId?: string; message: string; retry?: () => void };

/** 各小组实现的讨论引擎都遵守这个接口 */
export interface DiscussionEngine {
  start(config: SessionConfig, emit: (event: EngineEvent) => void): void;
  /** 用户插话；targetAgentId 为空表示对全体 */
  sendUserMessage(input: { text: string; targetAgentId?: string }): void;
  /** 停止讨论：清掉计时器，并中断正在进行的 AI 请求（把 AbortSignal 传给 chat / chatStream） */
  stop(): void;
}

export type EngineFactory = () => DiscussionEngine;

/** 每个模式的引擎包：工厂函数 + 可调参数默认值 */
export interface EngineModule {
  mode: ModeId;
  name: string;
  /** 负责人或小组，方便排查 */
  owner: string;
  create: EngineFactory;
  defaults: Record<string, unknown>;
}
