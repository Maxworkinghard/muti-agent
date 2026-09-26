import type { ModeId, Persona } from '../types';

/** /api/options 返回的人物（来自 backend/人物/理性/*.json） */
export interface ApiPersona {
  id: string; name: string; role: string; profession: string; description: string;
  domains: string[]; tradition: string; coreValues: string[]; coreConviction: string; color: string;
  judgmentFocus: string[];
  raw: Record<string, unknown>;
}
export interface ApiPersonality { id: string; name: string; description: string }
export interface Options {
  personas: ApiPersona[];
  personalities: ApiPersonality[];
  dryRun: boolean;
  model: string | null;
  configError: string | null;
  limits: { members: [number, number]; rounds: [number, number]; maxChars: [number, number] };
}

const HAIR = ['#2b2136', '#6b4a3a', '#6b6272', '#3d3550', '#8a5a3c'];
const HAIR_STYLE = ['short', 'long', 'bun', 'short', 'cap'] as const;

/**
 * 把后端人物转成像素界面用的 Persona；原始资料放进 protocol，图鉴详情会读取。
 * 任何人物都能配任何性格，所以性格库整个作为可选性格；人物没有默认性格，要用户自己选。
 */
export function toPersona(p: ApiPersona, i: number, personalities: ApiPersonality[], mode: ModeId): Persona {
  return {
    id: p.id, name: p.name, modes: [mode],
    identity: p.role + ' · ' + p.profession,
    knowledge: p.domains, thinking: p.tradition, values: p.coreValues.join('、'),
    personalities: personalities.map((s) => ({ id: s.name, label: s.name, behavior: s.description, style: '' })),
    defaultPersonalityId: '',
    boundaries: [],
    visual: { skin: i % 2 ? '#f3d2b3' : '#f1c9a5', hair: HAIR[i % HAIR.length], shirt: p.color, accent: '#fbf5e4', hairStyle: HAIR_STYLE[i % 5] },
    protocol: p.raw,
  };
}

let cache: Promise<Options> | null = null;
/** 人物、性格只向后端要一次；失败了下次再要 */
export function loadOptions(): Promise<Options> {
  cache ??= fetch('/api/options').then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).catch((e) => { cache = null; throw e; });
  return cache;
}
