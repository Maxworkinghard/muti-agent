/**
 * 解析人格数据库里的 Markdown 人格文件，提取人物卡片和 mock 引擎要用的摘要字段。
 * 摘要只用于展示；完整人格以原文件为准，由 personaDb.ts 放进 Persona.systemPrompt。
 * 本文件不依赖 Vite，可以直接用 Node 运行测试。
 */

interface Item { text: string; label?: string }
interface Section { title: string; paragraphs: string[]; items: Item[]; subtitles: string[] }

export interface PersonaFileSummary {
  name: string;
  identity: string;
  knowledge: string[];
  thinking: string;
  values: string;
  boundaries: string[];
  behavior: string;
  style: string;
}

// 按二级标题关键字给小节分类
const ROLE = /定位/;
const WHERE = /位置/;
const EXAMPLE = /示例/;
const LIMITS = /边界|禁止|质量标准|约束|纪律|规则/;
const OUTPUT = /输出模板/;
const METHOD = /流程|方法|步骤/;
const PRINCIPLE = /总原则/;
const RESPOND = /回应原则/;
const TRAITS = /人格特征|工作原则|核心原则/;
const STYLE = /表达风格/;
const DUTY = /职责/;

const plain = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
/** 去掉句尾标点和开头的“你的任务是”之类，让摘要读起来像一条原则 */
const tidy = (s: string) => plain(s)
  .replace(/^你(?:的|会)?/, '').replace(/^(?:任务|责任|目标|价值|核心问题)(?:是|在于)[：:]?/, '')
  .replace(/[。；，、：:;,.\s]+$/, '');
const sentences = (s: string) => plain(s).split(/[。！？]/).map((x) => x.trim()).filter(Boolean);
/** 边界、质量标准常把几条要求用分号写在一句里，拆成单条 */
const clauses = (s: string) => plain(s).split(/[。！？；]/).map((x) => x.trim()).filter(Boolean);
const labelsOf = (s: Section) => s.items.flatMap((i) => (i.label ? [i.label] : []));

function parse(md: string) {
  let title = '';
  let cur: Section | null = null;
  let fence = false;
  const sections: Section[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) { fence = !fence; continue; }
    if (fence || !line || line.startsWith('|') || /^-{3,}$/.test(line)) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+)/))) { title = plain(m[1]); continue; }
    if ((m = line.match(/^##\s+(.+)/))) {
      cur = {
        title: plain(m[1]).replace(/^[一二三四五六七八九十]+、\s*/, '').replace(/^\d+[.、]\s*/, ''),
        paragraphs: [], items: [], subtitles: [],
      };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    if ((m = line.match(/^###\s+(.+)/))) {
      cur.subtitles.push(plain(m[1]).replace(/^\d+[.、]\s*/, '').replace(/^第.+?步[：:]\s*/, ''));
      continue;
    }
    if ((m = line.match(/^(?:[-*+]|\d+[.、)])\s+(.+)/))) {
      // “**标签**：说明” 或 “标签：说明” 形式的条目记下标签
      const label = m[1].match(/^\*\*(.+?)\*\*\s*(?:[：:]|$)/)?.[1] ?? m[1].match(/^([^：:，。；？*]{1,12})[：:]/)?.[1];
      cur.items.push({ text: plain(m[1]), label: label?.trim() });
      continue;
    }
    cur.paragraphs.push(line.replace(/^>\s?/, ''));
  }
  return { title, sections };
}

export function parsePersonaFile(md: string): PersonaFileSummary {
  const { title, sections } = parse(md);
  const find = (re: RegExp) => sections.filter((s) => re.test(s.title));
  const firstItem = (re: RegExp, n = 0) => find(re).find((s) => s.items.length > n)?.items[n].text;
  const role = find(ROLE)[0];
  const roleSentences = sentences(role?.paragraphs[0] ?? '');
  const skip = [ROLE, WHERE, EXAMPLE, LIMITS, METHOD, PRINCIPLE, OUTPUT];
  const focus = sections.filter((s) => !skip.some((re) => re.test(s.title)));

  // 知识：焦点小节里的三级标题或带标签的条目，找不到再用输出模板的栏目
  let knowledge: string[] = [];
  for (const s of [...focus, ...find(OUTPUT)]) {
    if (s.subtitles.length >= 2) { knowledge = s.subtitles; break; }
    if (labelsOf(s).length >= 3) { knowledge = labelsOf(s); break; }
  }

  // 思想：带标签的流程 → 加粗的公式 → 回应原则 / 人格特征第一条 → 角色定位最后一句 → 流程 / 职责第一条
  const steps = find(METHOD).map(labelsOf).find((l) => l.length >= 3);
  const formula = sections.flatMap((s) => s.paragraphs).find((p) => /^\*\*.*→.*\*\*$/.test(p));
  const thinking = steps?.join(' → ')
    ?? formula
    ?? firstItem(RESPOND) ?? firstItem(TRAITS)
    ?? (roleSentences.length >= 2 ? roleSentences[roleSentences.length - 1] : undefined)
    ?? firstItem(METHOD) ?? firstItem(DUTY) ?? roleSentences[0] ?? '';

  // 价值：总原则 → 角色定位第二段 → 边界 / 质量标准的第一句
  const limits = find(LIMITS).flatMap((s) => [...s.items.map((i) => i.text), ...s.paragraphs.flatMap(clauses)]);
  const principle = find(PRINCIPLE)[0]?.paragraphs[0];
  const values = tidy(
    (principle && sentences(principle)[0])
    ?? (role?.paragraphs[1] && sentences(role.paragraphs[1])[0])
    ?? limits[0] ?? roleSentences[0] ?? '',
  );

  return {
    name: title.replace(/^\d+\s+/, '').replace(/\s*人格(?:\s*Agent)?\s*$/, '').trim(),
    identity: tidy(roleSentences[0] ?? '').replace(/^是/, ''),
    knowledge: knowledge.slice(0, 6),
    thinking: tidy(thinking),
    values,
    boundaries: limits.map(tidy).filter((b) => b && b !== values).slice(0, 6),
    behavior: tidy(firstItem(STYLE, 1) ?? firstItem(TRAITS, 1) ?? firstItem(METHOD) ?? ''),
    style: tidy(firstItem(STYLE) ?? ''),
  };
}

/** 读 README 里的「文件索引」表：文件名 → 主要职责、适用阶段 / 场景 */
export function parseFileIndex(readme: string): Record<string, { duty: string; stage: string }> {
  const out: Record<string, { duty: string; stage: string }> = {};
  for (const line of readme.split(/\r?\n/)) {
    const cells = line.trim().split('|').slice(1, -1).map(plain);
    if (cells.length >= 2 && cells[0].endsWith('.md')) out[cells[0]] = { duty: cells[1], stage: cells[2] ?? '' };
  }
  return out;
}
