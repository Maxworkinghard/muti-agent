import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root, configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

try {
  const [{ RATIONAL_PERSONAS }, { debateSchedule }, { createRationalEngine }] = await Promise.all([
    server.ssrLoadModule('/src/data/rationalPersonas.ts'),
    server.ssrLoadModule('/src/engines/rational/schedule.ts'),
    server.ssrLoadModule('/src/engines/rational/engine.ts'),
  ]);
  assert.equal(RATIONAL_PERSONAS.length, 5);
  assert.ok(RATIONAL_PERSONAS.every((p) => p.personalities.length >= 2));

  const participants = RATIONAL_PERSONAS.slice(0, 3).map((persona, i) => ({
    agentId: persona.id, persona, personalityId: persona.defaultPersonalityId,
    side: ['pro', 'con', 'host'][i], seatIndex: i, color: persona.visual.shirt,
  }));
  const cfg = {
    sessionId: 'rational-check', mode: 'rational', sceneId: 'debate',
    theme: { title: '应该实行四天工作制吗？', brief: '按实际利弊辩论' },
    maxRounds: 3, maxChars: 80, participants, engineOptions: { pace: 0 },
    createdAt: new Date().toISOString(),
  };
  const a = { ...cfg, conversationVariation: { openingIndex: 0, speakerIndex: 0 } };
  const b = { ...cfg, conversationVariation: { openingIndex: 1, speakerIndex: 1 } };
  assert.equal(debateSchedule(a)[0].speaker.side, 'host');
  assert.equal(debateSchedule(a)[1].speaker.side, 'pro');
  assert.equal(debateSchedule(b)[1].speaker.side, 'con');
  assert.equal(debateSchedule(a).at(-1).speaker.side, 'pro');
  // 两档赛制：快辩交锋 1 轮、标准交锋 2 轮；发言次数 = 主持开场 1 次 + 每轮正反方每人 1 次（选人页按这个估算）
  const { DEBATE_FORMATS, DEBATE_DEFAULT_FORMAT } = await server.ssrLoadModule('/src/data/modes.ts');
  assert.deepEqual(DEBATE_FORMATS.map((f) => f.rounds), [3, 4]);
  assert.equal(DEBATE_DEFAULT_FORMAT, 'standard');
  for (const f of DEBATE_FORMATS) {
    const turns = debateSchedule({ ...a, maxRounds: f.rounds });
    assert.equal(new Set(turns.filter((t) => t.stage.startsWith('交锋')).map((t) => t.round)).size, f.rounds - 2, f.label + '的交锋轮数不对');
    assert.equal(turns.length, 1 + f.rounds * 2, f.label + '的发言次数和估算对不上');
  }

  async function play(config) {
    const seen = { judgePrompt: '', actorPrompts: [] };
    let invalidPositionOnce = true;
    const mock = async (messages) => {
      const system = messages[0].content;
      if (system.includes('正式辩论的导演')) return JSON.stringify({ gist: '回应现场具体论点', tone: '自然', stance: '坚持本方', plan: '继续追问', pressure: 1, confidence: 0 });
      if (system.includes('本场主持人兼裁判') || system.includes('你是中立裁判')) {
        seen.judgePrompt = messages[1].content;
        return JSON.stringify({ winner: '正方', proScore: 82, conScore: 78,
          reason: '正方回答了核心问题', unanswered: ['反方一个问题没有答完'],
          consensus: ['双方都关心成本'], disagreements: ['长期收益'], suggestions: [],
          summary: '本场双方围绕成本交锋。', motion: { motion: '实行四天工作制', pro: '应该实行', con: '不应该实行' } });
      }
      if (system.includes('正式辩论中扮演')) {
        seen.actorPrompts.push(system);
        const position = system.match(/"position":"(支持辩题|反对辩题|中立)"/)?.[1];
        assert.ok(position);
        if (invalidPositionOnce) {
          invalidPositionOnce = false;
          return JSON.stringify({ say: ['跑到对方阵营'], inner: '', position: '换边' });
        }
        return JSON.stringify({ say: ['发言'.repeat(100)], inner: '认真听对方', position });
      }
      return '我听见了，先把这个问题记下来。';
    };
    const events = [];
    const engine = createRationalEngine(mock);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('辩论没有结束')), 3000);
      let injected = false;
      engine.start(config, (event) => {
        events.push(event);
        // 暂停要等当前这句打完才生效，不能靠“已经发出 paused”来只注入一次。
        if (event.type === 'message' && event.message.kind === 'speech' && !injected) {
          injected = true;
          engine.pause();
          engine.sendUserMessage({ text: '私下问一句', targetAgentId: participants[0].agentId });
          engine.sendUserMessage({ text: '请解释成本' });
          engine.resume();
        }
        if (event.type === 'error') { clearTimeout(timer); reject(new Error(event.message)); }
        if (event.type === 'session' && event.state === 'finished') { clearTimeout(timer); resolve(); }
      });
    });
    engine.stop();
    const speeches = events.filter((x) => x.type === 'message' && x.message.kind === 'speech').map((x) => x.message);
    assert.equal(speeches.length, debateSchedule(config).length);
    const completed = new Map(events.filter((x) => x.type === 'message_update').map((x) => [x.id, x.text]));
    assert.ok(speeches.every((x) => completed.get(x.id)?.length <= config.maxChars));
    assert.ok(events.some((x) => x.type === 'message' && x.message.kind === 'reply' && x.message.private));
    assert.ok(events.some((x) => x.type === 'message' && x.message.kind === 'reply' && !x.message.private));
    assert.ok(!seen.judgePrompt.includes('私下问一句'));
    assert.ok(seen.judgePrompt.includes('请解释成本'));
    assert.ok(seen.actorPrompts.some((x) => x.includes('性格是一种倾向')));
    const result = events.find((x) => x.type === 'result')?.result;
    assert.equal(result?.verdict?.winner, '正方');
    assert.equal(result?.verdict?.judge, config.participants.find((p) => p.side === 'host')?.persona.name ?? '中立裁判');
    return speeches.map((x) => x.speakerId);
  }

  const first = await play(a);
  const second = await play(b);
  assert.notEqual(first[1], second[1]);
  await play({ ...a, participants: participants.slice(0, 2), maxRounds: 2 });

  const pausedCfg = { ...a, participants: participants.slice(0, 2), maxRounds: 2 };
  const pausedEvents = [];
  const pausedEngine = createRationalEngine(async (messages) => {
    const system = messages[0].content;
    if (system.includes('正式辩论的导演')) return JSON.stringify({ gist: '接住论点' });
    if (system.includes('正式辩论中扮演')) {
      const position = system.match(/"position":"(支持辩题|反对辩题|中立)"/)?.[1];
      return JSON.stringify({ say: ['先说第一段。', '再说第二段。'], inner: '', position });
    }
    return JSON.stringify({ winner: '平局', proScore: 80, conScore: 80 });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('暂停回归检查超时')), 3000);
    let resumed = false;
    pausedEngine.start(pausedCfg, (event) => {
      pausedEvents.push(event);
      if (event.type === 'message' && event.message.kind === 'speech' && !resumed) {
        resumed = true;
        pausedEngine.pause();
        setTimeout(() => {
          const count = pausedEvents.filter((x) => x.type === 'message' && x.message.kind === 'speech').length;
          if (count !== 1) { clearTimeout(timeout); reject(new Error('暂停后跳过了当前发言')); return; }
          pausedEngine.resume();
        }, 10);
      }
      if (event.type === 'error') { clearTimeout(timeout); reject(new Error(event.message)); }
      if (event.type === 'session' && event.state === 'finished') { clearTimeout(timeout); resolve(); }
    });
  });
  assert.equal(pausedEvents.filter((x) => x.type === 'message' && x.message.kind === 'speech').length,
    debateSchedule(pausedCfg).length * 2);
  pausedEngine.stop();

  const stopped = [];
  const blocking = createRationalEngine((_messages, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  blocking.start(a, (event) => stopped.push(event));
  blocking.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(stopped.some((e) => e.type === 'session' && e.state === 'stopped'));
  assert.ok(!stopped.some((e) => e.type === 'result'));
  console.log('独立辩论引擎：静态人物、轮次、随机开局、私聊隔离、字数限制、裁决均通过。');
} finally {
  await server.close();
}
