import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * 理性讨论用的人格数据库，在仓库根目录的 backend/（来自 #5）：
 *   人物/            人物资料 JSON（知识、思想体系、怎么反对和同意）
 *   性格库/性格.json  性格，每个人物讨论前选 1 个
 *   提示词/          由 backend/生成提示词.py 从上面两处生成的提示词
 * 每次都现读文件，改了人物或重新生成提示词后不用重启。拼提示词的规则和 backend/组装提示词.py 一样。
 */

/** 人物 JSON 里的 persona 区，只列出这里用到的字段 */
interface PersonaFile {
  id: string;
  name: string;
  modes?: string[];
  description?: string;
  identity: { role: string; profession?: string };
  knowledge: { domains: string[]; strong?: string[] };
  worldview: { tradition: string; coreValues: string[]; judgmentFocus?: string[] };
  reasoning?: { coreConviction?: string };
  visual?: { color?: string };
}

interface PersonalityFile {
  id: string;
  name: string;
  description?: string;
  behaviors?: string[];
  habits?: string[];
}

const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));

/** 人物/ 下所有 JSON，按路径排序：[相对路径, persona] */
async function personaFiles(dir: string): Promise<Array<[string, PersonaFile]>> {
  const root = path.join(dir, '人物');
  const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f): Promise<[string, PersonaFile]> => [f, (await readJson(path.join(root, f))).persona]));
}

async function personalities(dir: string): Promise<PersonalityFile[]> {
  return (await readJson(path.join(dir, '性格库', '性格.json'))).personalities;
}

/** 按名字、id 或文件名找人物；rolePath 是它在 提示词/角色/ 下的提示词文件 */
export async function findPersona(dir: string, name: string) {
  for (const [file, persona] of await personaFiles(dir)) {
    if ([persona.name, persona.id, path.basename(file, '.json')].includes(name)) {
      return { persona, rolePath: file.replace(/\.json$/, '.md') };
    }
  }
  throw new Error('找不到人物：' + name);
}

/** 通用规则 → 角色 → 性格，拼成这个人物的系统提示词 */
export async function buildPrompt(dir: string, name: string, personality: string, maxChars: number): Promise<string> {
  const { persona, rolePath } = await findPersona(dir, name);
  const lib = await personalities(dir);
  if (!personality) throw new Error(`请为 ${persona.name} 选择性格，角色没有默认值。`);
  const hit = lib.find((s) => s.name === personality || s.id === personality);
  if (!hit) throw new Error(`性格不存在：${personality}。可选：${lib.map((s) => s.name).join('、')}`);
  const prompts = path.join(dir, '提示词');
  const parts = await Promise.all([
    readFile(path.join(prompts, '通用规则.md'), 'utf8').then((t) => t.replaceAll('{{字数上限}}', String(maxChars))),
    readFile(path.join(prompts, '角色', rolePath), 'utf8'),
    readFile(path.join(prompts, '性格', hit.name + '.md'), 'utf8'),
  ]);
  return parts.join('\n---\n\n');
}

/** 选人页和图鉴要的人物、性格列表；只列 modes 里有 rational 的人物 */
export async function readOptions(dir: string) {
  const personas = (await personaFiles(dir))
    .map(([, p]) => p)
    .filter((p) => p.modes?.includes('rational'))
    .map((p) => ({
      id: p.id, name: p.name, role: p.identity.role,
      profession: p.identity.profession ?? '', description: p.description ?? '',
      domains: p.knowledge.domains, strong: p.knowledge.strong ?? [],
      tradition: p.worldview.tradition, coreValues: p.worldview.coreValues,
      judgmentFocus: p.worldview.judgmentFocus ?? [],
      coreConviction: p.reasoning?.coreConviction ?? '',
      color: p.visual?.color ?? '#5f82b0',
      raw: p,
    }));
  const list = (await personalities(dir)).map(({ id, name, description, behaviors, habits }) => ({ id, name, description, behaviors, habits }));
  return { personas, personalities: list };
}
