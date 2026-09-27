export type ModeId = 'entertainment' | 'rational' | 'emotion' | 'discussion' | 'product';
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
  /** mock 引擎用的口头禅，可选 */
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
  /** 头像图片地址；有图片时显示图片，不画像素小人 */
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
  /** 坐在这里的人朝哪边，和底图里椅子的朝向一致；不写就看向场景中心 */
  face?: Facing;
}

export interface SceneDef {
  id: SceneId;
  name: string;
  image: string;
  description: string;
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
  /** 图鉴里导入按钮的文字 */
  importLabel: string;
  /** 推荐主题库，第一步每次随机挑几个显示 */
  presets: string[];
  /** 人物和性格来自 backend/ 的人格数据库（/api/discussion/options），不用前端的人物列表，也不能导入 */
  backendPersonas?: boolean;
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
  theme: { title: string };
  maxRounds: number;
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
  /** notice：引擎提示（如模型调用失败），在工作区里显示 */
  kind: 'speech' | 'user' | 'reply' | 'system' | 'task' | 'notice';
  /** 用户消息指向的成员；成员回复用户时为 'user' */
  targetId?: string;
  at: number;
  /** 理性讨论引擎给出的发言标注：立场、回应了谁、质疑了谁 */
  meta?: { stance?: string; respondsTo?: string | null; challenge?: string | null; challengeTarget?: string | null; answered?: string | null };
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
  /** 主持人总结原文（理性讨论引擎直接给一段话） */
  summary?: string;
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
  /** 没填主题时，引擎按用户对全体说的第一句话生成的主题 */
  | { type: 'theme'; title: string }
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
