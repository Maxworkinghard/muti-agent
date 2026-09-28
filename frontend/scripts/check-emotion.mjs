/**
 * 情感分析引擎（导演 + 演员）的检查，用假模型，不花钱：
 * 人物性情、提示词、三步分段、没走到最后一步不收尾、冷场时等你开口、私聊、最后一步照常收尾、台词里的引号。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root, configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 等到 cond() 给出结果，等不到就报错 */
async function until(cond, what, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = cond();
    if (hit) return hit;
    await sleep(5);
  }
  throw new Error('等不到：' + what);
}

try {
  const load = (f) => server.ssrLoadModule(f);
  const [{ createLiveEngine }, { createEmotionKit, readTemperament, STAGES, MOODS }, { EMOTION_DEFAULTS }, { LIBRARY_PERSONAS }, { modeById }, { readReactions }] = await Promise.all([
    load('/src/engines/live/engine.ts'), load('/src/engines/emotion/kit.ts'), load('/src/engines/emotion/config.ts'),
    load('/src/data/personas.ts'), load('/src/data/modes.ts'), load('/src/engines/live/types.ts'),
  ]);

  // 1. 人物和性情：七个人都带 x-temperament（简化格式，读进 persona.extensions）
  assert.deepEqual(STAGES, modeById('emotion').roundLabels);
  const pool = LIBRARY_PERSONAS.filter((p) => p.modes?.includes('emotion'));
  for (const n of ['芥末', '好好', '冷萃', '复读机', '树洞', '暖宝宝', '炮仗']) {
    const p = pool.find((x) => x.name === n);
    assert.ok(p, '缺少情感人物 ' + n);
    assert.ok(p.extensions?.['x-temperament'], n + ' 没有 x-temperament');
  }
  const pick = (...names) => names.map((n, i) => {
    const persona = pool.find((p) => p.name === n);
    return { agentId: persona.id, seatIndex: i, color: '#000', personalityId: persona.defaultPersonalityId, persona };
  });
  const participants = pick('冷萃', '树洞', '炮仗');
  const [lc, sd, pz] = participants;
  const pzTemper = readTemperament(pz);
  assert.equal(pzTemper.temper, 1.9);
  assert.equal(pzTemper.baseline.火气, 4);
  assert.equal(pzTemper.relations['leng-cui'], -2);

  const cfg = {
    sessionId: 'emotion-check', mode: 'emotion', sceneId: 'roundtable',
    theme: { title: '朋友答应周五回复，到现在还没消息', brief: '朋友答应周五回复，到现在还没消息，我有点烦' },
    maxRounds: 3, participants, createdAt: new Date().toISOString(),
    engineOptions: { ...EMOTION_DEFAULTS, pace: 0, maxMessages: 30 },
  };

  // 2. 提示词：导演看得到三步和每个人的性情，演员带着自己的底线和统一的安全规则
  const kit = createEmotionKit();
  const d = kit.directorMessages({ cfg, transcript: '[m1] 用户：' + cfg.theme.brief, state: '', arc: '', now: '' });
  for (const s of STAGES) assert.ok(d[0].content.includes(s), '导演提示词缺少步骤 ' + s);
  assert.ok(d[0].content.includes('急脾气'), '导演看不到炮仗的性情');
  const a = kit.actorMessages({ self: pz, cfg, temper: pzTemper, transcript: '', privates: '', state: '', cue: '导演给你这一句的提示', whisper: false });
  assert.ok(a[0].content.includes('粗话只当语气词'), '演员提示词缺少人物底线');
  assert.ok(a[0].content.includes('当地紧急服务'), '演员提示词缺少安全规则');

  /**
   * 假模型：导演按记录里角色已经说了几句来排（script），演员回 say（或者 actor(名字) 给的整份回答），私聊和总结各有固定回答。
   * calls.prompts 记下导演每次看到的【现在】，用来查演员的理由有没有转给导演
   */
  function mock(script, calls, say, actor) {
    return async (messages) => {
      const sys = messages[0].content;
      const user = messages[1]?.content ?? '';
      if (sys.includes('「情感分析」这场对话的导演')) {
        calls.director++;
        calls.prompts.push(user.split('【现在】')[1] ?? '');
        const record = user.split('【每个人现在的账】')[0];
        return JSON.stringify(script((record.match(/^\[m\d+\] (?!用户)/gm) ?? []).length, user));
      }
      if (sys.includes('情感分析的记录员')) {
        return JSON.stringify({
          recap: '主要是被晾着的失落。', consensus: ['先别急着下结论'], disagreements: [],
          openQuestions: ['对方是不是忘了'], suggestions: ['今晚发一句轻松的问候'],
        });
      }
      if (sys.includes('"private_reply"')) return JSON.stringify({ private_reply: '行，我收着点说。', plan: '说话收着点', inner: '原来他介意', mood: { 火气: -1 } });
      const who = sys.match(/"name": "([^"]+)"/)?.[1] ?? '';
      return JSON.stringify(actor?.(who) ?? { say, inner: '先接住' });
    };
  }
  function run(script, say = ['我听到了。'], { actor, options, debug } = {}) {
    const calls = { director: 0, prompts: [] };
    const events = [];
    const engine = createLiveEngine(createEmotionKit(), mock(script, calls, say, actor), debug);
    engine.start({ ...cfg, engineOptions: { ...cfg.engineOptions, ...options } }, (e) => events.push(e));
    return { engine, events, calls };
  }
  const speeches = (events) => events.filter((e) => e.type === 'message' && e.message.kind === 'speech');
  const rounds = (events) => events.filter((e) => e.type === 'round').map((e) => e.label);

  // 3. 三步分段；导演提前说 end 不算数，走到最后一步才收尾
  {
    const { engine, events } = run((n) => {
      const speaker = participants[n % 3].persona.name;
      if (n < 3) return { arc: '回应情绪', next: { speaker, to: '用户', gist: '接住情绪' }, end: n === 2 };
      if (n < 8) return { arc: '分清事实与感受', next: { speaker, gist: '分开事实和猜测' }, end: true };
      return { arc: '下一步行动', next: { speaker, gist: '给一小步' }, end: true };
    });
    const result = await until(() => events.find((e) => e.type === 'result'), '收尾总结');
    engine.stop();
    assert.equal(result.result.summary, '主要是被晾着的失落。');
    assert.deepEqual(rounds(events), STAGES);
    // 第 7、8 句时已经聊够 8 次发言、导演也说了 end，但还在第二步，不算数；第 9 句走到最后一步才收尾
    assert.equal(speeches(events).length, 9);
    const mind = events.find((e) => e.type === 'mind' && e.agentId === pz.agentId).mind;
    assert.deepEqual(mind.mood.map((m) => m.key), MOODS.map((m) => m.key));
    assert.equal(mind.label, '有点冒火');
  }

  // 4. 没走到最后一步就冷场：停下来等你开口，不收尾、不再叫导演；私聊照常回；你开口后接着聊
  {
    const { engine, events, calls } = run((n, user) => {
      if (user.includes('我想先倒倒苦水')) return { arc: '回应情绪', next: { speaker: sd.persona.name, to: '用户', gist: '接住他' } };
      if (n === 0) return { arc: '回应情绪', next: { speaker: lc.persona.name, to: '用户', gist: '问他想倾诉还是要建议' } };
      // 冷场这一步导演写了最后一步：没人开口不算走到，照样等你开口
      return { arc: '下一步行动', next: { speaker: '' } };
    });
    await until(() => events.find((e) => e.type === 'status' && e.action === '等你开口'), '等你开口');
    const idleCalls = calls.director;
    await sleep(100);
    assert.equal(calls.director, idleCalls, '等你开口时还在叫导演');
    engine.sendUserMessage({ text: '你说话能不能收着点', targetAgentId: pz.agentId });
    const reply = await until(() => events.find((e) => e.type === 'message' && e.message.kind === 'reply'), '私下回复');
    assert.equal(reply.message.private, true);
    assert.equal(reply.message.speakerId, pz.agentId);
    await sleep(50);
    assert.equal(calls.director, idleCalls, '私聊之后公开对话不该自己接着聊');
    engine.sendUserMessage({ text: '我想先倒倒苦水' });
    await until(() => speeches(events).length >= 2, '你开口后有人接');
    engine.stop();
    assert.equal(speeches(events)[1].message.speakerId, sd.agentId);
    assert.ok(!events.some((e) => e.type === 'result'), '还没走到最后一步就收尾了');
    assert.deepEqual(rounds(events), [STAGES[0]], '冷场那一步不该推进步骤');
  }

  // 5. 走到最后一步以后冷场：照常连着两次冷场就收尾
  {
    const { engine, events } = run((n) => (n === 0
      ? { arc: '下一步行动', next: { speaker: lc.persona.name, to: '用户', gist: '给一小步' } }
      : { arc: '下一步行动', next: { speaker: '' } }));
    await until(() => events.find((e) => e.type === 'result'), '最后一步冷场后收尾');
    engine.stop();
    assert.deepEqual(rounds(events), [STAGES[0], STAGES[2]]);
  }

  // 6. 台词里引用别人的原话，引号要留着；只有包着整句的那对引号才去掉
  {
    const say = ['「故意」是你替他补的', '“我听到了。”', '那我给你一句：“周五怎么说？”'];
    const { engine, events } = run(() => ({ arc: '回应情绪', next: { speaker: lc.persona.name, to: '用户', gist: '接住' } }), say);
    await until(() => speeches(events).length >= 4, '说完三条台词');
    engine.stop();
    const shown = speeches(events).slice(0, 3)
      .map((s) => events.filter((e) => e.type === 'message_update' && e.id === s.message.id).at(-1).text);
    assert.deepEqual(shown, ['「故意」是你替他补的', '我听到了。', '那我给你一句：“周五怎么说？”']);
  }

  // 7. 权力分开：导演只提名，谁开口按冲动抽；点名、用户在等是硬规则；演员自己定看法和打算，可以不照导演说；说话状态会过期；小反应走人设
  const [LC, SD, PZ] = [lc.persona.name, sd.persona.name, pz.persona.name];
  const three = () => ({ candidates: [LC, PZ, SD].map((speaker) => ({ speaker, gist: '接一句' })) });
  const lastMind = (events, id) => events.filter((e) => e.type === 'mind' && e.agentId === id).at(-1)?.mind;
  {
    // 随性 0：总按导演首选
    const { engine, events } = run(() => ({ arc: '回应情绪', ...three() }), undefined, { options: { spontaneity: 0 } });
    await until(() => speeches(events).length >= 3, '三句');
    engine.stop();
    assert.deepEqual(speeches(events).slice(0, 3).map((e) => e.message.speakerId), [lc.agentId, lc.agentId, lc.agentId]);
  }
  {
    // 随性 1：按冲动抽（这里让随机数总取最大，抽中候选里排最后的那个）
    const random = Math.random;
    Math.random = () => 0.99;
    const picked = [];
    try {
      const { engine, events } = run(() => ({ arc: '回应情绪', ...three() }), undefined, {
        options: { spontaneity: 1 }, debug: (e) => { if (e.type === 'cue') picked.push(e.cue.picked); },
      });
      await until(() => speeches(events).length >= 1, '一句');
      engine.stop();
      assert.equal(speeches(events)[0].message.speakerId, sd.agentId);
      assert.equal(picked[0], 2);
    } finally {
      Math.random = random;
    }
  }
  {
    // 点名：导演没提名被点的人，也让他先接
    const { engine, events } = run((n, user) => (user.includes('@' + PZ)
      ? { arc: '回应情绪', candidates: [{ speaker: LC, to: '用户', gist: '接' }] }
      : { arc: '回应情绪', ...three() }), undefined, { options: { spontaneity: 0 } });
    await until(() => speeches(events).length >= 1, '第一句');
    const before = events.length;
    engine.sendUserMessage({ text: '@' + PZ + ' 你怎么看' });
    const next = await until(() => events.slice(before).find((e) => e.type === 'message' && e.message.kind === 'speech'), '点名后的一句');
    engine.stop();
    assert.equal(next.message.speakerId, pz.agentId);
  }
  {
    // 点名：被点的人就算导演写他冲别人说，也是来接用户的
    const cues = [];
    const { engine, events } = run((n, user) => (user.includes('@' + PZ)
      ? { arc: '回应情绪', candidates: [{ speaker: PZ, to: LC, gist: '怼冷萃' }] }
      : { arc: '回应情绪', ...three() }), undefined, { options: { spontaneity: 0 }, debug: (e) => { if (e.type === 'cue') cues.push(e.cue); } });
    await until(() => speeches(events).length >= 1, '第一句');
    engine.sendUserMessage({ text: '@' + PZ + ' 你怎么看' });
    await until(() => cues.find((c) => c.speaker === pz.agentId), '点名后的安排');
    engine.stop();
    assert.equal(cues.find((c) => c.speaker === pz.agentId).to, 'user');
  }
  {
    // 用户说了话、导演却一个人都没提名：不能晾着他，按冲动挑人接；用户的话接过以后再冷场，才停下来等他
    const { engine, events } = run(() => ({ arc: '回应情绪', candidates: [] }), undefined, { options: { spontaneity: 0 } });
    await until(() => speeches(events)[0], '有人接用户的开场');
    await until(() => events.find((e) => e.type === 'status' && e.action === '等你开口'), '接过以后等你开口');
    engine.stop();
    assert.equal(speeches(events).length, 1);
  }
  {
    // 用户在等：只在冲用户说的候选里抽，导演首选不冲用户也不行
    const { engine, events } = run(() => ({
      arc: '回应情绪', candidates: [{ speaker: LC, to: SD, gist: '跟树洞说' }, { speaker: SD, to: '用户', gist: '接用户' }],
    }), undefined, { options: { spontaneity: 0 } });
    const first = await until(() => speeches(events)[0], '第一句');
    engine.stop();
    assert.equal(first.message.speakerId, sd.agentId);
  }
  {
    // 演员自己定看法和打算，导演写的不算；没照导演说时，理由转给导演；导演给的说话状态过几次发言就过期
    const { engine, events, calls } = run((n) => ({
      arc: '回应情绪', candidates: [{ speaker: [PZ, LC, SD][n % 3], to: '用户', gist: '好好安慰他' }],
      stance: { [PZ]: '其实没那么气' }, plan: { [PZ]: '先忍着' },
      style: n === 0 ? { [LC]: '语气放平' } : {},
    }), undefined, {
      options: { spontaneity: 0 },
      actor: (who) => (who === PZ
        ? { say: ['凭什么啊'], stance: '对方就是不靠谱', plan: '逼他给个准话', mood: { 火气: 2 }, follow: false, why: '我才不绕弯子' }
        : { say: ['我在听'], inner: '先接住' }),
    });
    await until(() => speeches(events).length >= 9, '九句');
    engine.stop();
    const m = lastMind(events, pz.agentId);
    assert.equal(m.stance, '对方就是不靠谱');
    assert.equal(m.plan, '逼他给个准话');
    assert.ok(calls.prompts.some((p) => p.includes(PZ + '没照你的建议说：我才不绕弯子')), '演员的理由没转给导演');
    const styles = events.filter((e) => e.type === 'mind' && e.agentId === lc.agentId).map((e) => e.mind.style);
    assert.ok(styles.includes('语气放平'), '导演给的说话状态没记上');
    assert.equal(styles.at(-1), undefined, '说话状态过期后没清掉');
  }
  {
    // 小反应：说什么从这个人自己的清单里挑，导演写的原话不用；他不会的那种反应就不出声
    const { engine, events } = run((n) => ({
      arc: '回应情绪', candidates: [{ speaker: LC, to: '用户', gist: '接' }],
      react: n === 0 ? [{ who: PZ, kind: '不服', text: '我觉得不对' }, { who: SD, kind: '不服' }] : [],
    }), undefined, { options: { spontaneity: 0 } });
    await until(() => speeches(events).length >= 1, '一句');
    engine.stop();
    const reacts = events.filter((e) => e.type === 'message' && e.message.kind === 'react');
    assert.equal(reacts.length, 1);
    assert.equal(reacts[0].message.speakerId, pz.agentId);
    assert.ok(readReactions(pz).不服.includes(reacts[0].message.text), '小反应不是炮仗自己会说的');
  }

  console.log('情感分析：性情、提示词、三步分段、没走完不收尾、冷场等你开口、私聊、最后一步收尾、台词里的引号都正常；'
    + '导演只提名、按冲动抽谁开口、点名和用户在等优先、演员自己定看法并能不照导演说、说话状态会过期、小反应走人设也都正常。');
} finally {
  await server.close();
}
