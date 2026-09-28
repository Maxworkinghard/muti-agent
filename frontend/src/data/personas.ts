import type { ModeId, Persona } from '../types';
import { isModeId } from './modes';
import { RATIONAL_PERSONAS, RATIONAL_SOURCES } from './rationalPersonas';
// 协议格式的校验规则只维护一份，前端直接复用 persona-protocol 里的实现
import { loadPersona } from '../../../persona-protocol/src/protocol.mjs';

export const AGENT_COLORS = ['#6f9e6b', '#5f82b0', '#d4b04c', '#d98a4e', '#8a6fb0', '#c0625a', '#4f9a94', '#c47a9a'];

/** 一个文件的检查结果：persona 为空表示没加载成功 */
export interface PersonaCheck {
  source: string;
  persona?: Persona;
  errors: string[];
  warnings: string[];
}

/**
 * 人物库：frontend/personas/ 下的所有 JSON，加上 backend/人物/理性/ 里辩论组的人物（格式不同，rationalPersonas.ts 转好了）。
 * personas/ 下按模式分文件夹（entertainment、emotion、product；辩论要加人物就建 rational），
 * 文件夹名就是默认模式；文件里写了 modes 时以文件为准。
 * 同时支持协议 v1.0（{ schemaVersion, persona }）和前端简化格式。
 * 两处一起按 id 查重：先读 personas/，id 已经有了的跳过并报给图鉴，免得选人物页出现两张同 id 的卡。
 */
const files = import.meta.glob('../../personas/**/*.json', { eager: true, import: 'default' });

function loadLibrary(): { personas: Persona[]; issues: PersonaCheck[] } {
  const out: Persona[] = [];
  const issues: PersonaCheck[] = [];
  /** 已收下的 id → 文件，撞了告诉用户和哪个文件撞的 */
  const seen = new Map<string, string>();
  const add = (p: Persona, source: string) => {
    const first = seen.get(p.id);
    if (first) {
      issues.push({ source, errors: ['人物 id "' + p.id + '" 和 ' + first + ' 重复，已跳过'], warnings: [] });
      return;
    }
    seen.set(p.id, source);
    out.push(p);
  };
  Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).forEach(([path, raw]) => {
    const folder = path.split('/').slice(-2, -1)[0] as ModeId;
    const c = checkPersona(raw, out.length, 'personas/' + path.split('/personas/')[1]);
    if (c.errors.length || c.warnings.length) {
      issues.push(c);
      console.warn('[personas] ' + c.source + '\n' + [...c.errors, ...c.warnings].join('\n'));
    }
    if (!c.persona) return;
    if (!c.persona.modes?.length && MODE_IDS.includes(folder)) c.persona.modes = [folder];
    add(c.persona, c.source);
  });
  RATIONAL_PERSONAS.forEach((p, i) => add(p, RATIONAL_SOURCES[i]));
  return { personas: out, issues };
}

const MODE_IDS: ModeId[] = ['entertainment', 'rational', 'product', 'emotion'];

const VERBOSITY: Record<string, string> = { short: '简短', medium: '适中', long: '详细' };
const HUMOR: Record<string, string> = { none: '不开玩笑', light: '偶尔幽默', frequent: '经常开玩笑' };
const EMOTION: Record<string, string> = { restrained: '情绪克制', moderate: '情绪适中', expressive: '情绪外放' };

/** 协议里的头像：https 地址直接用；assets/avatars/... 放在 public/ 下按站点根路径访问；null 或空字符串画像素小人 */
function avatarUrl(a: unknown): string | undefined {
  if (typeof a !== 'string' || !a) return undefined;
  return a.startsWith('https://') ? a : '/' + a;
}

/** 人格资料包协议 v1.0（{ schemaVersion, persona }）转成前端人物结构 */
function fromProtocol(p: Record<string, any>): Persona {
  const traits: any[] = p.personality?.traitOptions ?? [];
  const cs = p.communicationStyle ?? {};
  const style = [
    cs.tone, cs.sentenceStyle,
    cs.verbosity && '篇幅' + (VERBOSITY[cs.verbosity] ?? cs.verbosity),
    cs.humor && HUMOR[cs.humor], cs.emotionalExpression && EMOTION[cs.emotionalExpression],
  ].filter(Boolean).join('；');
  const catchphrase: string | undefined = cs.catchphrases?.[0];
  const b = p.boundaries ?? {};
  const id = p.identity ?? {};
  const kn = p.knowledge ?? {};
  const wv = p.worldview ?? {};
  return {
    id: String(p.id),
    name: String(p.name),
    modes: Array.isArray(p.modes) ? p.modes.filter(isModeId) : undefined,
    identity: [id.profession, id.role].filter(Boolean).join(' · ') || String(p.description ?? ''),
    knowledge: [...(kn.domains ?? []), ...(kn.strong ?? [])].map(String),
    thinking: (wv.judgmentFocus ?? wv.valuePriority ?? []).join('；'),
    values: (wv.coreValues ?? []).join('、'),
    personalities: traits.map((t) => ({
      id: String(t.id),
      label: String(t.label ?? t.id),
      behavior: (t.behaviors ?? []).join('；'),
      style,
      opener: catchphrase,
    })),
    defaultPersonalityId: String(p.personality?.defaultTraits?.[0] ?? traits[0].id),
    boundaries: [
      ...(b.mustNot ?? []).map((t: string) => (String(t).startsWith('不') ? String(t) : '不' + t)),
      ...(b.forbiddenTopics ?? []).map((t: string) => '不涉及' + t),
    ],
    // 协议里没有像素形象，用 visual.color 作衣服颜色；avatar 为空时前端画像素占位头像
    visual: { skin: '#f1c9a5', hair: '#2b2136', shirt: p.visual.color, accent: '#fbf5e4', hairStyle: 'short', image: avatarUrl(p.visual.avatar) },
    protocol: p,
  };
}

/** 把 "persona.communicationStyle.humor: 取值无效" 这类报告改成更好读的中文 */
const pretty = (line: string) => line.replace(/^\$\.?/, '顶层').replace(/^persona\./, '');

/**
 * 校验并补全一个人物 JSON。
 * 协议 v1.0（{ schemaVersion, persona }）走 persona-protocol 的完整校验；
 * 其余按前端简化格式处理（demo 人物用的就是这种）。
 */
export function checkPersona(raw: unknown, index: number, source: string): PersonaCheck {
  const fail = (msg: string): PersonaCheck => ({ source, errors: [msg], warnings: [] });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('不是 JSON 对象');
  const r = raw as Record<string, any>;
  if ('schemaVersion' in r || 'persona' in r) {
    const { report, persona } = loadPersona(r);
    const errors = report.errors.map(pretty);
    const warnings = report.warnings.map(pretty);
    if (!persona) return { source, errors, warnings };
    if (!persona.visual.avatar) warnings.push('没有头像（visual.avatar 为空），先用 ' + persona.visual.color + ' 色的像素小人代替');
    return { source, persona: fromProtocol(persona as Record<string, any>), errors, warnings };
  }
  if (!r.id || !r.name) return fail('缺少 id 或 name。如果是协议格式，顶层应为 { "schemaVersion": "1.0", "persona": { ... } }');
  if (!Array.isArray(r.personalities) || r.personalities.length === 0) return fail(r.name + ' 缺少 personalities');
  const color = AGENT_COLORS[index % AGENT_COLORS.length];
  const extensions = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('x-')));
  const persona: Persona = {
    id: String(r.id),
    name: String(r.name),
    modes: Array.isArray(r.modes) ? r.modes.filter(isModeId) : undefined,
    identity: String(r.identity ?? ''),
    knowledge: Array.isArray(r.knowledge) ? r.knowledge.map(String) : [],
    thinking: String(r.thinking ?? ''),
    values: String(r.values ?? ''),
    personalities: r.personalities.map((p: any, i: number) => ({
      id: String(p.id ?? 'p' + i),
      label: String(p.label ?? p.name ?? '性格' + (i + 1)),
      behavior: String(p.behavior ?? ''),
      style: String(p.style ?? ''),
      opener: p.opener ? String(p.opener) : undefined,
    })),
    defaultPersonalityId: String(r.defaultPersonalityId ?? r.personalities[0].id ?? 'p0'),
    boundaries: Array.isArray(r.boundaries) ? r.boundaries.map(String) : [],
    visual: { skin: '#f1c9a5', hair: '#2b2136', shirt: color, accent: '#fbf5e4', hairStyle: 'short', ...(r.visual ?? {}) },
    ...(Object.keys(extensions).length ? { extensions } : {}),
  };
  return { source, persona, errors: [], warnings: [] };
}

const library = loadLibrary();
/** 内置人物：personas/ 和 backend/人物/理性/ 合在一起，id 不重复 */
export const LIBRARY_PERSONAS: Persona[] = library.personas;
/** 人物库里有问题的文件，选人物页会列出来 */
export const LIBRARY_ISSUES: PersonaCheck[] = library.issues;
