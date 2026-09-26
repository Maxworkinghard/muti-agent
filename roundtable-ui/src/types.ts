/** 后四个模式各对应人格数据库里的一套人格（见 data/personaDb.ts） */
export type ModeId = 'entertainment' | 'rational' | 'product' | 'emotion' | 'vibe' | 'analysis' | 'resume';
/** 首页两大入口：讨论与辩论 / 工作（创造项目）。两条路线共用同一套前端 */
export type Track = 'discuss' | 'work';
export type SceneId = 'roundtable' | 'debate' | 'office';
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
  /** 从人格数据库导入：人格文件全文，后面附套装的 README / workflow，引擎可直接当系统提示 */
  systemPrompt?: string;
  /** 人格文件在 persona-db 里的路径 */
  sourceFile?: string;
  /** 工作模式里入座即担任负责人（总控 / 主 Agent） */
  defaultLead?: boolean;
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
}

export interface ModeDef {
  id: ModeId;
  track: Track;
  name: string;
  tag: string;
  desc: string;
  color: string;
  scene: SceneId;
  roundLabels: string[];
  presets: string[];
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
  | { type: 'task'; task: TaskEvent }
  | { type: 'result'; result: DiscussionResult }
  /** 没填主题时，引擎按用户对全体说的第一句话生成的主题 */
  | { type: 'theme'; title: string };

/** 各小组实现的讨论引擎都遵守这个接口 */
export interface DiscussionEngine {
  start(config: SessionConfig, emit: (event: EngineEvent) => void): void;
  /** 用户插话；targetAgentId 为空表示对全体 */
  sendUserMessage(input: { text: string; targetAgentId?: string }): void;
  stop(): void;
}

export type EngineFactory = () => DiscussionEngine;
