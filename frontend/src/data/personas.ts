import type { Persona } from '../types';
import { isModeId } from './modes';
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
 * 人物库：自动读取 frontend/personas/ 下的所有 JSON，按路径排序（文件名前面的数字决定先后）。
 * 文件夹名是模式 id 时（entertainment、rational、emotion、product）就是默认模式；文件里写了 modes 时以文件为准。
 * 同时支持协议 v1.0（{ schemaVersion, persona }）和前端简化格式，说明见 personas/README.md。
 */
const files = import.meta.glob('../../personas/**/*.json', { eager: true, import: 'default' });

function loadLibrary(): { personas: Persona[]; issues: PersonaCheck[] } {
  const out: Persona[] = [];
  const issues: PersonaCheck[] = [];
  Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).forEach(([path, raw]) => {
    const folder = path.split('/').slice(-2, -1)[0];
    const c = checkPersona(raw, out.length, 'personas/' + path.split('/personas/')[1]);
    if (c.errors.length || c.warnings.length) {
      issues.push(c);
      console.warn('[personas] ' + c.source + '\n' + [...c.errors, ...c.warnings].join('\n'));
    }
    if (!c.persona) return;
    if (out.some((p) => p.id === c.persona!.id)) {
      issues.push({ source: c.source, errors: ['人物 id "' + c.persona.id + '" 和别的文件重复，已跳过'], warnings: [] });
      return;
    }
    if (!c.persona.modes?.length && isModeId(folder)) c.persona.modes = [folder];
    out.push(c.persona);
  });
  return { personas: out, issues };
}

const VERBOSITY: Record<string, string> = { short: '简短', medium: '适中', long: '详细' };
const HUMOR: Record<string, string> = { none: '不开玩笑', light: '偶尔幽默', frequent: '经常开玩笑' };
const EMOTION: Record<string, string> = { restrained: '情绪克制', moderate: '情绪适中', expressive: '情绪外放' };

/** 人格资料包协议 v1.0（已经通过校验的 persona）转成前端人物结构 */
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
    // 协议里没有像素形象，用 visual.color 作衣服颜色，画像素小人
    visual: { skin: '#f1c9a5', hair: '#2b2136', shirt: p.visual.color, accent: '#fbf5e4', hairStyle: 'short' },
    protocol: p,
  };
}

/** 把 "persona.communicationStyle.humor: 取值无效" 这类报告改成更好读的中文 */
const pretty = (line: string) => line.replace(/^\$\.?/, '顶层').replace(/^persona\./, '');

/**
 * 校验并补全一个人物 JSON（人物库的文件和图鉴里导入的文件都走这里）。
 * 协议 v1.0（{ schemaVersion, persona }）走 persona-protocol 的完整校验；
 * 其余按前端简化格式处理，字段和 src/types.ts 的 Persona 一样。
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
  };
  return { source, persona, errors: [], warnings: [] };
}

const library = loadLibrary();
/** 人物库里加载成功的人物 */
export const LIBRARY_PERSONAS: Persona[] = library.personas;
/** 人物库里有错误或提醒的文件，图鉴里可以查看 */
export const LIBRARY_ISSUES: PersonaCheck[] = library.issues;
