import type { ModeId, SessionConfig } from '../types.ts';

type Variation = NonNullable<SessionConfig['conversationVariation']>;

const STORAGE_KEY = 'roundtable-conversation-variations-v2';
const MAX_SAVED_CHOICES = 100;
const memory = new Map<string, Variation>();

const OPENINGS: Record<ModeId, string[]> = {
  entertainment: [
    '从一个具体又有点意外的选择聊起，先别急着评判别人。',
    '从这件事最容易闹出的误会聊起，让大家顺势接话。',
    '先抓一个看似不起眼、其实很好玩的细节。',
    '先抛一个真想试试的做法，再让别人挑毛病。',
    '从一个有点丢脸但真实的顾虑聊起。',
    '先想一个实际后果，让大家各自补充或拆台。',
    '从一个和直觉相反的选择聊起，但别为了反常而反常。',
    '先接住用户的话，再把话题带到一个有画面感的场景。',
  ],
  emotion: [
    '先回应当事人眼下最难受的部分。',
    '先从对方可能没说出口的顾虑切入，别替他下结论。',
    '先帮当事人把眼前的事实和猜测分开。',
    '先找一个能让当事人稍微喘口气的切入点。',
  ],
  rational: [
    '优先检验论点成立所需的关键前提。',
    '优先讨论方案的实际代价和谁来承担。',
    '优先找一个能区分双方观点的具体情境。',
    '优先讨论短期收益和长期影响是否冲突。',
  ],
  product: [
    '先从用户实际会怎么使用这个成果切入。',
    '先找出最重要的约束和可交付的最小部分。',
    '先厘清最容易误解的需求，再安排工作。',
    '先从失败时最需要补救的环节切入。',
  ],
};

export function openingDirection(mode: ModeId, variation: Variation | undefined): string {
  const index = variation?.openingIndex;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return '';
  const choices = OPENINGS[mode];
  return choices[index % choices.length];
}

function randomInt(limit: number): number {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % limit;
  }
  return Math.floor(Math.random() * limit);
}

function differentIndex(count: number, previous: unknown): number {
  if (count < 2) return 0;
  if (!Number.isSafeInteger(previous) || (previous as number) < 0 || (previous as number) >= count) return randomInt(count);
  const pick = randomInt(count - 1);
  return pick >= (previous as number) ? pick + 1 : pick;
}

function speakerCount(cfg: SessionConfig): number {
  if (cfg.mode === 'rational') return 2; // 正反方谁先开口
  if (cfg.mode === 'product') {
    const lead = cfg.participants.find((p) => p.isLead) ?? cfg.participants[0];
    return Math.max(1, cfg.participants.filter((p) => p !== lead).length);
  }
  return Math.max(1, cfg.participants.length);
}

/** 每场随机抽开局；相同选项连续两场不会抽到同一切入点或可变的首位发言者。 */
export function nextConversationVariation(cfg: SessionConfig): Variation {
  const key = JSON.stringify([
    cfg.mode, cfg.sceneId, cfg.theme.title.trim(),
    cfg.participants.map((p) => [p.agentId, p.personalityId, p.side ?? '', !!p.isLead]),
  ]);
  let saved: Record<string, Variation> = {};
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  } catch { /* 禁用本地存储时，在当前页面内继续随机 */ }

  const previous = memory.get(key) ?? saved[key];
  const variation = {
    openingIndex: differentIndex(OPENINGS[cfg.mode].length, previous?.openingIndex),
    speakerIndex: differentIndex(speakerCount(cfg), previous?.speakerIndex),
  };
  memory.set(key, variation);
  try {
    delete saved[key];
    saved[key] = variation;
    const keys = Object.keys(saved);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_CHOICES))) delete saved[old];
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch { /* 存储不可用不应阻止开聊 */ }
  return variation;
}
