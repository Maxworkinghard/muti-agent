import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false } });
const originalFetch = globalThis.fetch;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = (promise, ms = 2500) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('工作流程超时或等待者没有被唤醒')), ms);
  })]).finally(() => clearTimeout(timer));
};
const sessions = [];

try {
  const [{ RoundtableSession }, { LIBRARY_PERSONAS }, { SCENES }, { layoutOfficeBubbles }, { placeAway, readMs, spotOf, walkMs }] = await Promise.all([
    vite.ssrLoadModule('/server/session.ts'), vite.ssrLoadModule('/src/data/personas.ts'),
    vite.ssrLoadModule('/src/data/scenes.ts'),
    vite.ssrLoadModule('/src/components/officeBubbleLayout.ts'),
    vite.ssrLoadModule('/src/data/stageRules.ts'),
  ]);
  const cast = LIBRARY_PERSONAS.filter((p) => p.modes?.includes('product'));
  assert.equal(cast.length, 13, '工作人物库应有 13 人');
  const officeScene = SCENES['office'];
  assert.equal(officeScene.maxSeats, 13);
  assert.equal(officeScene.seats.length, 13);
  assert.equal(officeScene.stations.visits.length, 13);
  const participants = cast.map((persona, i) => ({ agentId: persona.id, seatIndex: i,
    color: persona.visual.color, personalityId: persona.defaultPersonalityId, persona, isLead: i === 0 }));
  const cfg = { mode: 'product', sceneId: 'office', theme: { title: '共享购物清单', brief: '设计家庭共享购物清单' },
    sessionId: 'work-test', maxRounds: 4, createdAt: new Date().toISOString(),
    engineOptions: { pace: 0, parallel: 4 }, participants };
  const llm = { baseUrl: 'http://unused.local', apiKey: 'test', model: 'test' };
  for (const [width, height] of [[876, 584], [770, 513], [1030, 686]]) {
    const anchors = Array.from({ length: 8 }, (_, i) => ({ x: width * (i % 2 ? .93 : .89), y: height * .58 }));
    const boxes = layoutOfficeBubbles(anchors, width, height);
    boxes.forEach((box, i) => {
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, '气泡伸出舞台');
      for (const other of boxes.slice(i + 1)) assert.ok(box.x + box.width <= other.x || other.x + other.width <= box.x
        || box.y + box.height <= other.y || other.y + other.height <= box.y, '相邻工位气泡重叠');
    });
  }
  console.log('Pass：相邻工位的 8 个气泡避让，三种桌面舞台尺寸无重叠、无越界。');
  const makeSession = (overrides = {}) => {
    const s = new RoundtableSession('test-' + sessions.length, { ...cfg, ...overrides }, llm);
    sessions.push(s);
    return s;
  };
  const member = participants[1].persona.name;
  const lead = participants[0].persona.name;
  const answer = (body) => {
    const system = body.messages[0].content;
    const prompt = body.messages.at(-1).content;
    if (system.includes('记录员')) return JSON.stringify({ consensus: ['对齐完成'], disagreements: [],
      openQuestions: [], suggestions: [], deliverables: ['购物清单方案'] });
    if (prompt.includes('先用一两句话跟大家说明拆分思路')) {
      return '每人认领一项。\n```json\n' + JSON.stringify({ assignments: participants.slice(1)
        .map((_, i) => ({ member: 'm' + (i + 1), task: '负责部分' + (i + 1) })) }) + '\n```';
    }
    if (prompt.includes('动手之前想一想')) return `找 ${member === system.match(/^# (.+)/)?.[1] ? lead : member}：确认共享接口`;
    if (prompt.includes('现在动手写')) return `第一版方案\n请 ${member} 评审`;
    if (prompt.includes('第一版交给你评审')) return '补上冲突处理和离线重试。';
    if (prompt.includes('当面给了评审意见')) return '采纳，第二版增加版本号和幂等重试。';
    if (prompt.includes('交付前对一遍')) return `叫 ${participants.slice(1, 4).map((p) => p.persona.name).join('、')}：共享冲突规则`;
    if (prompt.includes('向全组宣布最终交付')) return '交付购物清单方案，冲突以版本号判断。';
    return '采用版本号，失败可以重试。';
  };
  let hook = async () => {};
  let calls = 0;
  let concurrent = 0;
  let peak = 0;
  const busy = new Set();
  globalThis.fetch = async (_, options) => {
    calls++;
    const body = JSON.parse(options.body);
    const who = body.messages[0].content;
    if (JSON.stringify(body).includes('PRIVATE_MARKER')) assert.ok(who.startsWith('# ' + member + '\n'), '私聊泄露到别人的上下文');
    assert.ok(!busy.has(who), '同一个人物不能同时调用模型');
    busy.add(who);
    peak = Math.max(peak, ++concurrent);
    try {
      await hook(body, options.signal);
      if (options.signal.aborted) throw new DOMException('stopped', 'AbortError');
      return new Response(JSON.stringify({ choices: [{ message: { content: answer(body) } }] }));
    } finally { concurrent--; busy.delete(who); }
  };

  const full = makeSession();
  const visiting = new Map();
  full.subscribe((e) => {
    if (e.type !== 'move') return;
    if (e.to === 'desk') { visiting.delete(e.agentId); return; }
    if (['meeting', 'huddle'].includes(e.to)) return;
    const occupied = [...visiting].flat();
    assert.ok(!occupied.includes(e.agentId) && !occupied.includes(e.to), '一人同时卷入两场当面讨论');
    visiting.set(e.agentId, e.to);
  });
  hook = () => sleep(2);
  await bounded(full.run());
  assert.ok(peak > 1 && peak <= 4, '应并行开工，并遵守并发上限');
  assert.deepEqual(full.events.filter((e) => e.type === 'round').map((e) => e.round), [1, 2, 3, 4]);
  for (const status of ['assigned', 'review', 'done']) {
    assert.equal(full.events.filter((e) => e.type === 'task' && e.task.status === status).length, 12);
  }
  for (const tag of ['站会', '第一版', '第二版', '会议室', '对齐', '拍板', '交付']) {
    assert.ok(full.events.some((e) => e.type === 'message' && e.message.tag === tag), '缺少 ' + tag);
  }
  assert.ok(full.events.some((e) => e.type === 'message' && e.message.tag?.startsWith('找') && e.message.targetId));
  assert.equal(visiting.size, 0);
  assert.ok(full.events.some((e) => e.type === 'result'));
  assert.equal(full.events.at(-1).state, 'finished');
  console.log('Pass：13 人完整流程、交流对象、评审流转、会议交付、并发与当面谈排队。');

  // 台上调度：用很小的节奏倍数真跑一场，按每个事件发出的时间核对现实里的规矩
  const PACE = 0.05;
  const TOL = 30;
  const timed = makeSession({ engineOptions: { pace: PACE, parallel: 4 } });
  const timeline = [];
  timed.subscribe((e) => timeline.push({ t: performance.now(), e }));
  hook = () => sleep(2);
  await bounded(timed.run(), 60000);
  assert.equal(timed.events.at(-1).state, 'finished');
  const office = SCENES.office;
  const who = (id) => participants.find((p) => p.agentId === id);
  let place = {};
  const arrives = new Map();
  const spoken = [];
  const posts = [];
  let gathering = null;
  let checks = 0;
  for (const [i, { t, e }] of timeline.entries()) {
    if (e.type === 'move') {
      const next = placeAway(office, participants, place, e.agentId, e.to);
      const mine = spoken.filter((s) => s.who === e.agentId).at(-1);
      assert.ok(!mine || t >= mine.end - TOL, `${who(e.agentId).persona.name} 话还没说完就起身`);
      if (e.to === 'desk' && gathering && place[e.agentId]) {
        assert.ok(t >= gathering.end - TOL, `${who(e.agentId).persona.name} 没等最后一句看完就散了`);
      }
      arrives.set(e.agentId, t + walkMs(spotOf(office, who(e.agentId), place), spotOf(office, who(e.agentId), next)) * PACE);
      place = next;
      checks++;
    }
    if (e.type !== 'message' || e.message.speakerId === 'user') continue;
    const m = e.message;
    if (m.kind !== 'speech') continue;
    if (m.doc) {
      // 第一版是交出来的文件：照样出气泡（占同屏名额、停够阅读时间），另外和上一份错开交
      const after = timeline.slice(i + 1, i + 3).find(({ e: x }) => x.type === 'status' && x.agentId === m.speakerId);
      assert.equal(after?.e.state, 'speaking', '交第一版时要出气泡');
      assert.equal(m.tag, '第一版');
      posts.push(t);
    }
    assert.ok(t >= (arrives.get(m.speakerId) ?? 0) - TOL, `${who(m.speakerId).persona.name} 还没走到就开口`);
    if (m.targetId) {
      const asked = spoken.filter((s) => s.who === m.targetId && s.to === m.speakerId).at(-1);
      assert.ok(!asked || t >= asked.end - TOL, '回答抢在对方的话看完之前');
    }
    assert.ok(spoken.filter((s) => s.end > t + TOL).length <= 1, '屏幕上同时超过两个气泡');
    if (['站会', '交付'].includes(m.tag)) {
      for (const p of participants) assert.ok(t >= (arrives.get(p.agentId) ?? 0) - TOL, `站会没到齐就开讲（${p.persona.name} 还在路上）`);
    }
    const end = t + readMs(m.text) * PACE;
    if (['站会', '交付', '会议室', '对齐', '拍板'].includes(m.tag)) {
      const prev = spoken.filter((s) => s.floor).at(-1);
      if (prev && t < prev.end + 1000) assert.ok(t >= prev.end - TOL, '会上两个人同时说话');
      gathering = { end };
    }
    spoken.push({ t, end, who: m.speakerId, to: m.targetId, floor: ['站会', '交付', '会议室', '对齐', '拍板'].includes(m.tag) });
    checks++;
  }
  assert.equal(posts.length, 12, '每人交一份第一版');
  for (let k = 1; k < posts.length; k++) assert.ok(posts[k] - posts[k - 1] >= 900 * PACE - TOL, '第一版挤在同一刻交');
  assert.ok(spoken.some((s) => s.to) && checks > 100);
  console.log(`Pass：台上调度——走到才开口、回答等问题看完、同屏最多两个气泡、站会到齐才讲、散会等最后一句、第一版错开交且照样出气泡（核对 ${checks} 个事件）。`);

  const paused = makeSession();
  let blocked = 0;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  hook = async (body) => {
    if (!body.messages.at(-1).content.includes('动手之前想一想')) return;
    if (++blocked === 4) release();
    await sleep(40);
  };
  const running = paused.run();
  await bounded(ready);
  paused.pause();
  const mark = paused.events.length;
  const count = calls;
  try {
    await sleep(120);
    assert.equal(calls, count, '暂停后发起了新模型请求');
    assert.equal(paused.events.length, mark, '暂停后仍在发言、走动或推进流程');
    // 暂停期间仍允许私聊；回答不能泄露到其他人的模型上下文。
    paused.userMessage('PRIVATE_MARKER', participants[1].agentId);
    await sleep(80);
    assert.ok(paused.events.some((e) => e.type === 'message' && e.message.kind === 'reply' && e.message.private));
    const afterReply = paused.events.length;
    await sleep(80);
    assert.equal(paused.events.length, afterReply, '私聊后工作流程自行恢复');
    paused.resume();
    await bounded(running);
    assert.equal(paused.events.at(-1).state, 'finished');
  } finally { paused.stop(); await bounded(running); }
  console.log('Pass：多个在途回答暂停、暂停中私聊、恢复唤醒全部等待者。');

  hook = async () => {};
  const stopped = makeSession({ engineOptions: { pace: 1, parallel: 4 } });
  let moved;
  const firstMove = new Promise((resolve) => { moved = resolve; });
  stopped.subscribe((e) => { if (e.type === 'move') moved(); });
  const stopping = stopped.run();
  await bounded(firstMove);
  stopped.stop();
  const stopMark = stopped.events.length;
  await bounded(stopping, 250);
  assert.equal(stopped.events.length, stopMark, '停止后还有工作事件');
  console.log('Pass：走动中停止，等待立即取消，无后续事件。');

  const aborted = makeSession();
  let entered;
  const inFlight = new Promise((resolve) => { entered = resolve; });
  hook = (_, signal) => new Promise((resolve) => { entered(); signal.addEventListener('abort', resolve, { once: true }); });
  const aborting = aborted.run();
  await bounded(inFlight);
  aborted.pause();
  aborted.stop();
  const abortMark = aborted.events.length;
  await bounded(aborting, 250);
  assert.equal(aborted.events.length, abortMark);
  console.log('Pass：暂停时停止在途请求，AbortSignal 生效，无迟到事件。');

  hook = async () => {};
  const fakeFetch = globalThis.fetch;
  const incomplete = makeSession();
  globalThis.fetch = (url, options) => JSON.parse(options.body).messages.at(-1).content.includes('现在动手写')
    ? Promise.resolve(new Response(JSON.stringify({ error: { message: 'temporary failure' } }), { status: 400 }))
    : fakeFetch(url, options);
  await bounded(incomplete.run(), 8000);
  assert.ok(!incomplete.events.some((e) => e.type === 'task' && e.task.status === 'done'));
  assert.ok(!incomplete.events.some((e) => e.type === 'session' && e.state === 'finished'));
  assert.equal(incomplete.events.at(-1).state, 'stopped');
  console.log('Pass：第一版调用重试失败，停止整场工作，不伪报成员交付。');

  const failed = makeSession();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 });
  await bounded(failed.run());
  assert.equal(failed.events.at(-1).state, 'stopped');
  assert.ok(failed.events.some((e) => e.type === 'message' && e.message.kind === 'notice'));
  assert.ok(!failed.events.some((e) => e.type === 'task' || e.type === 'result'));
  console.log('Pass：模型鉴权失败停止，显示错误，不伪报交付。');
} finally {
  for (const session of sessions) session.stop();
  globalThis.fetch = originalFetch;
  await vite.close();
}
