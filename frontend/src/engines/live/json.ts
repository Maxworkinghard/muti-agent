/**
 * 从模型回答里抠出第一个完整的 JSON 对象：可能包在 ```json 里，前后可能带几句废话，
 * 也可能多了个结尾逗号。拿不到就返回 null。
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, '');
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    const end = matchBrace(s, start);
    if (end < 0) continue;
    const raw = s.slice(start, end + 1);
    for (const candidate of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const v = JSON.parse(candidate);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      } catch { /* 试下一种 */ }
    }
  }
  return null;
}

/** 找和 start 处的 { 配对的 }，跳过字符串里的括号 */
function matchBrace(s: string, start: number) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}
