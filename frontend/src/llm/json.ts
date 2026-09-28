/** 从模型回答中提取第一个完整 JSON 对象，容忍代码围栏和末尾多余逗号。 */
export function extractJson(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, '');
  for (let start = s.indexOf('{'); start >= 0; start = s.indexOf('{', start + 1)) {
    const end = matchBrace(s, start);
    if (end < 0) continue;
    const raw = s.slice(start, end + 1);
    for (const candidate of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const value = JSON.parse(candidate);
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
      } catch { /* 试下一种 */ }
    }
  }
  return null;
}

function matchBrace(s: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}
