// 人格资料包协议 v1.0 的 TypeScript 类型，前端和引擎共用。校验以 protocol.mjs 为准。
export type Mode = 'entertainment' | 'rational';
export type BuiltinTrait = 'cautious' | 'direct' | 'skeptical' | 'empathetic' | 'critical' | 'optimistic' | 'pragmatic' | 'humorous';
export type TraitId = BuiltinTrait | `custom-${string}`;

export interface PersonaFile { $schema?: string; schemaVersion: '1.0'; persona: Persona; }

export interface Persona {
  id: string;                 // ^[a-z][a-z0-9]*(-[a-z0-9]+)*$
  name: string;               // 不超过 16 字
  displayName?: string;       // 缺省时等于 name
  description: string;        // 不超过 200 字
  version: string;            // x.y.z
  author?: string;
  tags?: string[];
  modes: Mode[];
  identity: {
    role: string;
    profession?: string;
    fields: string[];
    responsibilities: string[];   // 1 到 5 项
    originType: 'original' | 'inspired' | 'historical' | 'composite';
  };
  knowledge: { domains: string[]; strong: string[]; weak: string[]; sourcePreference?: string[] };
  worldview: {
    tradition?: string;
    coreValues: string[];         // 1 到 7 项
    valuePriority: string[];
    assumptions?: string[];       // rational 模式必填
    judgmentFocus?: string[];     // rational 模式必填
    blindSpots?: string[];        // rational 模式必填
  };
  personality: {
    traitOptions: { id: TraitId; label: string; behaviors: string[] }[]; // 2 到 8 个
    defaultTraits: TraitId[];     // 2 到 4 个，必须出自 traitOptions
  };
  communicationStyle: {
    tone: string;
    verbosity: 'short' | 'medium' | 'long';
    register: 'casual' | 'neutral' | 'formal';
    sentenceStyle?: string;
    humor?: 'none' | 'light' | 'frequent';
    emotionalExpression?: 'restrained' | 'moderate' | 'expressive';
    catchphrases?: string[];      // 最多 5 项
    avoidPhrases?: string[];
  };
  boundaries: {
    uncertainty: 'admit_and_ask' | 'admit_only';
    outOfScope: 'decline' | 'brief_then_defer';
    factVsOpinion?: 'always_label' | 'label_when_relevant'; // rational 模式必须 always_label
    forbiddenTopics?: string[];
    mustNot: string[];            // 至少 1 项
  };
  visual: {
    avatar?: string | null;       // null、缺省、"" 都视为无头像；加载后统一为 null
    color: string;                // #RRGGBB
    icon?: string;
    defaultLabel: string;         // 不超过 12 字
  };
}

export interface SessionFile { $schema?: string; schemaVersion: '1.0'; session: Session; }
export interface Session {
  id: string;
  mode: Mode;
  scene: 'roundtable' | 'debate' | 'office';
  question: string;
  userParticipation: 'observer' | 'participant';
  participants: { personaId: string; seat: number; traitSelection?: TraitId[] }[]; // 1 到 8 人
}
