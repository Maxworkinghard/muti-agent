import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });

/** 用可控的导演回答跑一场辩论，收集 mind 事件 */
async function run({ pressure, confidence, tone = '自然', rounds = 3, people = 5 }) {
  const [{ RATIONAL_PERSONAS }, { createRationalEngine }] = await Promise.all([
    server.ssrLoadModule('/src/data/rationalPersonas.ts'),
    server.ssrLoadModule('/src/engines/rational/engine.ts'),
  ]);
  const participants = RATIONAL_PERSONAS.slice(0, people).map((persona, i) => ({
    agentId: persona.id, persona, personalityId: persona.defaultPersonalityId,
    side: i < 2 ? 'pro' : i < 4 ? 'con' : 'host', seatIndex: i, color: persona.visual.shirt,
  }));
  const cfg = {
    sessionId: 'check-debate-mind', mode: 'rational', sceneId: 'debate',
    theme: { title: '应该实行四天工作制吗？', brief: '按实际利弊辩论' },
    maxRounds: rounds, maxChars: 60, participants, engineOptions: { pace: 0 },
    conversationVariation: { openingIndex: 0, speakerIndex: 0 }, createdAt: new Date().toISOString(),
  };
  const mock = async (messages) => {
    const system = messages[0].content;
    if (system.includes('正式辩论的导演')) return JSON.stringify({ gist: '追问现场论点', tone, stance: '坚持本方', plan: '继续追问', pressure, confidence });
    if (system.includes('赛后讨论记录')) return JSON.stringify({ summary: '双方围绕工作制展开讨论。' });
    if (system.includes('正式辩论中扮演')) {
      const position = system.match(/"position":"(支持辩题|反对辩题|中立)"/)?.[1];
      return JSON.stringify({ say: ['这是一句发言。'], inner: '认真听', position });
    }
    return '好的。';
  };
  const minds = [];
  const engine = createRationalEngine(mock);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('辩论没有结束')), 15000);
    engine.start(cfg, (event) => {
      if (event.type === 'mind') minds.push(event);
      if (event.type === 'error') { clearTimeout(timer); reject(new Error(event.message)); }
      if (event.type === 'session' && event.state === 'finished') { clearTimeout(timer); resolve(); }
    });
  });
  engine.stop();
  return { minds, participants, cfg };
}

try {
  // 基准：导演持续加压 -> 压力上档、出现「被问住了」这类说法和 sweat 表情
  const hard = await run({ pressure: 2, confidence: -2 });
  assert.ok(hard.minds.length > 0, '没有 mind 事件');
  const keys = new Set(hard.minds.flatMap((m) => m.mind.mood.map((x) => x.key)));
  assert.deepEqual([...keys].sort(), [...['压力', '信心', '憋屈', '火气']].sort(), '四种情绪没有全部上报');

  const labels = new Set(hard.minds.map((m) => m.mind.label));
  assert.ok(labels.has('平静'), '开场/回落应当是平静');
  assert.ok([...labels].some((l) => ['被问住了', '快顶不住'].includes(l)), '持续加压后压力没有上档：' + [...labels].join('/'));

  const faces = new Set(hard.minds.flatMap((m) => m.mind.face));
  assert.ok(faces.has('sweat'), '压力没有换成表情');

  // 情绪确实会变（不是一直一个值）
  const distinct = new Set(hard.minds.map((m) => JSON.stringify(m.mind.mood.map((x) => x.value))));
  assert.ok(distinct.size >= 3, '情绪几乎没变化，只出现 ' + distinct.size + ' 种取值');

  // 被质询的人会记恨质询者：toward 里出现负值
  const withToward = hard.minds.filter((m) => m.mind.toward.length);
  assert.ok(withToward.length > 0, '被反复质询后没有产生 toward');
  assert.ok(withToward.every((m) => m.mind.toward.every((t) => t.value < 0)), 'toward 应当是负向的');
  assert.ok(withToward.every((m) => m.mind.toward.every((t) => t.name && t.id !== m.agentId)), 'toward 不该指向自己或空名字');

  // 加压和施压应当给出不同的表情结果：信心组上限不该挂着 sweat
  const easy = await run({ pressure: -1, confidence: 2, rounds: 2 });
  const easyLabels = new Set(easy.minds.map((m) => m.mind.label));
  assert.ok(easyLabels.has('平静') || easyLabels.has('有底气'), '低压场景不该出现高压标签：' + [...easyLabels].join('/'));
  const easyMaxPressure = Math.max(...easy.minds.flatMap((m) => m.mind.mood.filter((x) => x.key === '压力').map((x) => x.value)));
  const hardMaxPressure = Math.max(...hard.minds.flatMap((m) => m.mind.mood.filter((x) => x.key === '压力').map((x) => x.value)));
  assert.ok(hardMaxPressure > easyMaxPressure, '加压组压力峰值应当高于低压组');

  // 情绪不会越界
  for (const m of [...hard.minds, ...easy.minds]) {
    for (const x of m.mind.mood) assert.ok(x.value >= 0 && x.value <= 10, '情绪越界：' + x.key + '=' + x.value);
  }

  console.log('辩论表情：四种情绪上报、压力档位、表情映射、情绪回落、被质询记恨、上下限均通过。');
} finally {
  await server.close();
}
