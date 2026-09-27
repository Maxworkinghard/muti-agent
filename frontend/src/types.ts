export type ModeId = 'entertainment' | 'rational' | 'emotion' | 'product';
/** 内置场景：roundtable / debate / office / classroom / meadow；用户添加的场景以 custom- 开头 */
export type SceneId = string;
export type Side = 'pro' | 'con' | 'host';
/** 人物在场景里的朝向（屏幕上的八个方向）：S 面朝观众，N 背对观众 */
export type Facing = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';

export interface Personality {
  id: string;
  label: string;
  /** 这种性格下的行为方式 */
  behavior: string;
  /** 表达风格 */
  style: string;
  /** 口头禅，可选；讨论后端会把它写进人物提示词 */
  opener?: string;
}

export interface PersonaVisual {
  skin: string;
  hair: string;
  shirt: string;
  accent: string;
  /** cap、hood 用衣服颜色画帽子，beanie 用 accent 颜色画毛线帽 */
  hairStyle?: 'short' | 'long' | 'bun' | 'cap' | 'spiky' | 'curly' | 'side' | 'middle' | 'hood' | 'beanie';
  /** 表情和配饰，可以叠加；围巾用 accent 颜色 */
  extras?: Array<'brows' | 'glasses' | 'sleepy' | 'happy' | 'grin' | 'blush' | 'sweat' | 'ears' | 'scarf'>;
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
  /** 同一套选项重新开聊时随机抽取、避开上一场的开局 */
  conversationVariation?: { openingIndex: number; speakerIndex: number };
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
  /** notice：引擎提示（如模型调用失败），在工作区里显示；react：不抢话的小反应（“哈哈哈”“？”） */
  kind: 'speech' | 'user' | 'reply' | 'system' | 'task' | 'notice' | 'react';
  /** 用户消息指向的成员；成员回复用户时为 'user' */
  targetId?: string;
  /** 私聊消息：点成员说的话及其回应，只有这一对看得到，别人拿不到 */
  private?: boolean;
  /** 发言者身份和环节，例如「正方一辩 · 质询」（辩论引擎用） */
  tag?: string;
  /** 接的是前面哪一条（不是紧挨着的上一条时才给），界面上显示成引用 */
  quote?: { name: string; text: string };
  /** 话说到一半被人打断了 */
  cut?: boolean;
  at: number;
}

/** 人物此刻的内心（娱乐、辩论引擎用）：情绪 0~10、心里话和打算 */
export interface MindView {
  /** 各种情绪的强度，按模式定的顺序 */
  mood: Array<{ key: string; value: number; color: string }>;
  /** 一句话的心情，比如「上头了」 */
  label: string;
  emoji: string;
  /** 画像素小人时换上的表情 */
  face: NonNullable<PersonaVisual['extras']>;
  /** 最近一次的心里话 */
  inner?: string;
  /** 对话题的态度 */
  stance?: string;
  /** 接下来想干嘛 */
  plan?: string;
  /** 现在的说话状态，比如“句子变短，开始翻旧账” */
  style?: string;
  /** 对在场的人（含用户）的好恶，只列明显的 */
  toward: Array<{ id: string; name: string; value: number }>;
  /** 你私下对他说过的最后一句 */
  whisper?: string;
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
  /** 主持人写的整段总结（辩论引擎用） */
  summary?: string;
  /** 正式辩论的判定 */
  verdict?: {
    winner?: string; proScore?: number; conScore?: number; reason?: string; judge?: string;
    motion?: { motion: string; pro: string; con: string };
  };
}

/** 引擎回传给前端的事件 */
export type EngineEvent =
  | { type: 'session'; state: 'running' | 'paused' | 'finished' | 'stopped' }
  | { type: 'round'; round: number; label: string }
  | { type: 'status'; agentId: string; state: AgentState; action: string }
  | { type: 'message'; message: ChatMessage }
  /** 流式发言：先发一条 message，再用同一个 id 不断更新全文；cut 表示这句被人打断了 */
  | { type: 'message_update'; id: string; text: string; cut?: boolean }
  /** 人物的内心状态变了（娱乐引擎用） */
  | { type: 'mind'; agentId: string; mind: MindView }
  | { type: 'task'; task: TaskEvent }
  | { type: 'result'; result: DiscussionResult }
  /** 没填主题时，引擎按用户对全体说的第一句话生成的主题 */
  | { type: 'theme'; title: string }
  /** 调用 AI 等出错；agentId 为空表示整场出错。retry 存在时界面显示“重试”按钮 */
  | { type: 'error'; id: string; agentId?: string; message: string; retry?: () => void };

/** 各小组实现的讨论引擎都遵守这个接口 */
export interface DiscussionEngine {
  start(config: SessionConfig, emit: (event: EngineEvent) => void): void;
    /** 用户插话；targetAgentId 为空表示对全体。暂停中和讨论结束后也可以发，被问到的人会回应 */
  sendUserMessage(input: { text: string; targetAgentId?: string }): void;
    /** 暂停：正在说的人说完这一句就停下，期间用户发的话照常回应 */
    pause(): void;
    /** 从暂停的地方接着讨论 */
    resume(): void;
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
