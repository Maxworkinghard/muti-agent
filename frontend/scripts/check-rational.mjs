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
    const seen = { judgePrompt: '', actorPrompts: [], directorPrompts: [], targetActor: [], otherActor: [] };
    let invalidPositionOnce = true;
    // 发私聊时私聊对象已经拿到过几次提示词；之后的才算“私聊之后”
    let chatAt = -1;
    const mock = async (messages) => {
      const system = messages[0].content;
      if (system.includes('正式辩论的导演')) {
        // 记下这一步导演在安排谁
        seen.directorPrompts.push({ speaker: messages[1].content.match(/下一句固定由 (.+?)（/)?.[1], text: system + '\n' + messages[1].content });
        return JSON.stringify({ gist: '回应现场具体论点', tone: '自然', stance: '坚持本方', plan: '继续追问', pressure: 1, confidence: 0 });
      }
      if (system.includes('本场主持人兼裁判') || system.includes('你是中立裁判')) {
        seen.judgePrompt = messages[1].content;
        return JSON.stringify({ winner: '正方', proScore: 82, conScore: 78,
          reason: '正方回答了核心问题', unanswered: ['反方一个问题没有答完'],
          consensus: ['双方都关心成本'], disagreements: ['长期收益'], suggestions: [],
          summary: '本场双方围绕成本交锋。', motion: { motion: '实行四天工作制', pro: '应该实行', con: '不应该实行' } });
      }
      if (system.includes('正式辩论中扮演')) {
        seen.actorPrompts.push(system);
        // 私聊对象（participants[0]）和其他辩手每次公开发言拿到的提示词
        const name = system.match(/"name":\s*"([^"]+)"/)?.[1];
        (name === participants[0].persona.name ? seen.targetActor : seen.otherActor).push(system + '\n' + messages[1].content);
        const position = system.match(/"position":"(支持辩题|反对辩题|中立)"/)?.[1];
        assert.ok(position);
        if (invalidPositionOnce) {
          invalidPositionOnce = false;
          return JSON.stringify({ say: ['跑到对方阵营'], inner: '', position: '换边' });
        }
        // 每人的心里话带上自己的名字，用来检查导演安排别人时有没有读到
        return JSON.stringify({ say: ['发言'.repeat(100)], inner: '内心-' + name, position });
      }
      return '我听见了，先把这个问题记下来。';
    };
    const events = [];
    const engine = createRationalEngine(mock);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('辩论没有结束')), 3000);
      engine.start(config, (event) => {
        events.push(event);
        if (event.type === 'message' && event.message.kind === 'speech' && !events.some((x) => x.type === 'session' && x.state === 'paused')) {
          chatAt = seen.targetActor.length;
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
    // 不读心：导演安排谁，只看得到谁自己的心思；别人的心思看不到，只能从公开记录去猜
    const names = config.participants.map((p) => p.persona.name);
    assert.ok(seen.directorPrompts.some((d) => d.text.includes('内心-' + d.speaker)), '导演应该看得到下一位发言人自己的心思');
    for (const d of seen.directorPrompts) {
      for (const n of names) if (n !== d.speaker) assert.ok(!d.text.includes('内心-' + n), `安排${d.speaker}时导演读到了${n}的心思`);
    }
    // 私聊整场有效：导演只在安排当事辩手时看到私下约定，安排别人时看不到；
    // 当事辩手之后每次发言都带着，只有紧接着的那次要求“这一句就体现”；其他辩手看不到
    const target = participants[0].persona.name;
    const directorKnows = seen.directorPrompts.filter((d) => d.text.includes('私下问一句'));
    assert.ok(directorKnows.length > 0, '安排当事辩手时导演应该知道私聊，才能把它落实到整场');
    assert.ok(directorKnows.every((d) => d.speaker === target), '安排其他辩手时导演不应该看到私聊');
    assert.ok(seen.directorPrompts.filter((d) => d.speaker === target).at(-1).text.includes('私下问一句'), '私下约定应该整场有效');
    const targetAfter = seen.targetActor.slice(chatAt);
    assert.ok(targetAfter.length > 0 && targetAfter.every((x) => x.includes('私下问一句')), '私聊应该整场有效：对方之后每次发言都带着');
    assert.equal(targetAfter.filter((x) => x.includes('上次公开发言之后的新私聊')).length, 1, '新私聊只在紧接着的那次发言里要求立刻体现');
    assert.ok(!seen.otherActor.some((x) => x.includes('私下问一句')), '其他辩手不应该看到私聊');
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
  const stageCfg = { ...a, participants: participants.slice(0, 2), maxRounds: 2 };
  const stageChat = async (messages) => {
    const system = messages[0].content;
    if (system.includes('正式辩论的导演')) return JSON.stringify({ gist: '回应质询' });
    if (system.includes('正式辩论中扮演')) return JSON.stringify({ say: ['这是一个公开论点。'], inner: '', position: system.match(/"position":"(支持辩题|反对辩题|中立)"/)?.[1] });
    return JSON.stringify({ winner: '正方', proScore: 82, conScore: 76 });
  };
  const stageEvents = [], gateCalls = [];
  const immediate = createRationalEngine(stageChat);
  immediate.setStageGate({ round: async n => { gateCalls.push('round:' + n); }, speech: async id => { gateCalls.push('speech:' + id); } });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('即时舞台门禁卡住')), 2500);
    immediate.start(stageCfg, e => { stageEvents.push(e); if (e.type === 'error') { clearTimeout(timer); reject(new Error(e.message)); }
      if (e.type === 'session' && e.state === 'finished') { clearTimeout(timer); resolve(); } });
  });
  const publicSpeech = stageEvents.filter(e => e.type === 'message' && e.message.kind === 'speech');
  assert.equal(publicSpeech.length, debateSchedule(stageCfg).length);
  assert.ok(publicSpeech.every(e => e.message.targetId && !e.message.private), '质询对象丢失或被误标成私聊');
  assert.equal(gateCalls.length, publicSpeech.length + 2);
  immediate.stop();
  const delayed = createRationalEngine(stageChat);
  let firstStageWait = true, startedGate = 0, pausedFor = 0;
  delayed.setStageGate({ round: async () => {}, speech: () => {
    if (!firstStageWait) return Promise.resolve(); firstStageWait = false; startedGate = Date.now();
    setTimeout(() => { delayed.pause(); const start = Date.now(); setTimeout(() => { pausedFor = Date.now()-start; delayed.resume(); }, 250); }, 100);
    return new Promise(() => {});
  } });
  await new Promise((resolve, reject) => {
    const timer=setTimeout(() => reject(new Error('舞台门禁超时没有释放')), 6500);
    delayed.start(stageCfg, e => { if (e.type==='message' && e.message.kind==='speech') {
      const active=Date.now()-startedGate-pausedFor; try { assert.ok(active>=3900 && active<4500, '舞台等待应为 4 秒，暂停时间不计：'+active); } catch(err) { clearTimeout(timer); delayed.stop(); reject(err); return; }
      clearTimeout(timer); delayed.stop(); resolve();
    } });
  });
  console.log('Pass：公开质询 targetId、即时门禁顺序、永不完成门禁的 4 秒上限和暂停扣时。');
  console.log('独立辩论引擎：静态人物、轮次、随机开局、私聊隔离、字数限制、裁决均通过。');
} finally {
  await server.close();
}
