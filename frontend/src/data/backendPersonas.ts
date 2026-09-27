import type { Persona } from '../types';

/** /api/options 返回的人物（backend/人物/理性/*.json）和性格库（backend/性格库/性格.json） */
export interface ApiPersona {
  id: string; name: string; role: string; profession: string; description: string;
  domains: string[]; tradition: string; coreValues: string[]; coreConviction: string; color: string;
  judgmentFocus: string[];
  raw: Record<string, unknown>;
}
export interface ApiPersonality { id: string; name: string; description: string; behaviors?: string[]; habits?: string[] }
export interface Options {
  personas: ApiPersona[]; personalities: ApiPersonality[];
  dryRun: boolean; model: string | null; configError: string | null;
}

/** 后端人物数据库里的人物，id 加前缀和前端示例人物区分 */
export const DB_PREFIX = 'db-';

const HAIR = ['#2b2136', '#6b4a3a', '#6b6272', '#3d3550', '#8a5a3c'];
const HAIR_STYLE = ['short', 'long', 'bun', 'cap'] as const;

/** 把后端人物转成本前端的 Persona：每个人物都能从整个性格库里挑 1 个，性格 id 就用性格名 */
export function toPersona(p: ApiPersona, i: number, lib: ApiPersonality[]): Persona {
  return {
    id: DB_PREFIX + p.id, name: p.name, modes: ['rational'],
    identity: p.role + (p.profession ? ' · ' + p.profession : ''),
    knowledge: p.domains, thinking: p.tradition, values: p.coreValues.join('、'),
    personalities: lib.map((s) => ({ id: s.name, label: s.name, behavior: s.description, style: s.habits?.[0] ?? '' })),
    defaultPersonalityId: lib[0]?.name ?? '',
    boundaries: [],
    visual: { skin: i % 2 ? '#f3d2b3' : '#f1c9a5', hair: HAIR[i % HAIR.length], shirt: p.color, accent: '#fbf5e4', hairStyle: HAIR_STYLE[i % HAIR_STYLE.length] },
    protocol: p.raw,
  };
}

let cache: Promise<Options> | null = null;
/** 人物和性格只向后端要一次；失败后下次再试 */
export function loadOptions(): Promise<Options> {
  cache ??= fetch('/api/options').then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).catch((e) => { cache = null; throw e; });
  return cache;
}
