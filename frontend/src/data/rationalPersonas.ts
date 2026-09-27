import type { Persona } from '../types';
import personalityLibrary from '../../../backend/性格库/性格.json';

/** 沿用已有的人物资料文件，构建时直接打进网页；辩论不再请求 Python 服务。 */
const files = import.meta.glob('../../../backend/人物/理性/*.json', { eager: true, import: 'default' });
const personalities = personalityLibrary.personalities.map((s) => ({
  id: s.id,
  label: s.name,
  behavior: s.description,
  style: s.habits?.[0] ?? '',
}));

const HAIR = ['#2b2136', '#6b4a3a', '#6b6272', '#3d3550', '#8a5a3c'];
const HAIR_STYLE = ['short', 'long', 'bun', 'cap'] as const;

export const RATIONAL_PERSONAS: Persona[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
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
