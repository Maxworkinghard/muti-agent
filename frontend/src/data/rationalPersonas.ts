import type { Persona } from '../types';
import personalityLibrary from '../../../backend/性格库/性格.json';

/**
 * 沿用已有的人物资料文件，构建时直接打进网页；辩论不再请求 Python 服务。
 * 这里只负责转格式，并进人物库（personas.ts）时和 frontend/personas/ 一起按 id 查重。
 */
const files = import.meta.glob('../../../backend/人物/理性/*.json', { eager: true, import: 'default' });
const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
const personalities = personalityLibrary.personalities.map((s) => ({
  id: s.id,
  label: s.name,
  behavior: s.description,
  style: s.habits?.[0] ?? '',
}));

const HAIR = ['#2b2136', '#6b4a3a', '#6b6272', '#3d3550', '#8a5a3c'];
const HAIR_STYLE = ['short', 'long', 'bun', 'cap'] as const;

/** 文件位置，和 RATIONAL_PERSONAS 一一对应；人物库查重撞了 id 时报给图鉴 */
export const RATIONAL_SOURCES = entries.map(([path]) => path.replace(/^(\.\.\/)+/, ''));

export const RATIONAL_PERSONAS: Persona[] = entries
  .map(([, file], i) => {
    const p = (file as { persona: Record<string, any> }).persona;
    return {
      id: p.id,
      name: p.name,
      modes: ['rational'],
      identity: [p.identity.role, p.identity.profession].filter(Boolean).join(' · '),
      knowledge: p.knowledge.domains,
      thinking: p.worldview.tradition,
      values: p.worldview.coreValues.join('、'),
      personalities,
      defaultPersonalityId: personalities[0]?.id ?? '',
      boundaries: p.boundaries?.mustNot ?? [],
      visual: {
        skin: i % 2 ? '#f3d2b3' : '#f1c9a5', hair: HAIR[i % HAIR.length],
        shirt: p.visual?.color ?? '#5f82b0', accent: '#fbf5e4', hairStyle: HAIR_STYLE[i % HAIR_STYLE.length],
      },
      protocol: p,
    };
  });
