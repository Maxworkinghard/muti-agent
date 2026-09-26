// 用法：node src/cli.mjs <人物或会话文件...>
// 先校验所有人物文件，再用通过的人物校验会话文件。
import { readFileSync } from 'node:fs';
import { loadPersona, loadSession } from './protocol.mjs';

const files = process.argv.slice(2);
if (!files.length) { console.error('用法：node src/cli.mjs <file.json...>'); process.exit(2); }

const docs = files.map((f) => {
  try { return { f, doc: JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) }; }
  catch (e) { return { f, parseError: e.message }; }
});

let failed = false;
const personas = new Map();
const print = (f, report, label) => {
  console.log((report.ok ? 'PASS ' : 'FAIL ') + label + '  ' + f);
  for (const e of report.errors) console.log('  错误  ' + e);
  for (const w of report.warnings) console.log('  提醒  ' + w);
  if (!report.ok) failed = true;
};

for (const d of docs) {
  if (d.parseError) { console.log('FAIL JSON  ' + d.f + '\n  错误  ' + d.parseError); failed = true; continue; }
  if (d.doc && 'session' in d.doc) continue;
  const { report, persona } = loadPersona(d.doc);
  print(d.f, report, 'persona');
  if (persona) {
    if (personas.has(persona.id)) { console.log('  错误  人物 id 重复：' + persona.id); failed = true; }
    personas.set(persona.id, persona);
  }
}
for (const d of docs) {
  if (d.parseError || !(d.doc && 'session' in d.doc)) continue;
  const { report, session } = loadSession(d.doc, personas);
  print(d.f, report, 'session');
  if (session) console.log(JSON.stringify(session, null, 2));
}
process.exit(failed ? 1 : 0);
