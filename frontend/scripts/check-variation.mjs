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
  const load = (file) => server.ssrLoadModule(file);
  const [{ nextConversationVariation, openingDirection }, { createLiveEngine },
    { createEntertainmentKit }, { createEmotionKit }, { LIBRARY_PERSONAS }, { agentSystemPrompt }, { modeById },
    { RoundtableSession }] = await Promise.all([
    load('/src/data/conversationVariation.ts'), load('/src/engines/live/engine.ts'),
    load('/src/engines/entertainment/kit.ts'), load('/src/engines/emotion/kit.ts'), load('/src/data/personas.ts'),
    load('/server/prompts.ts'), load('/src/data/modes.ts'), load('/server/session.ts'),
  ]);

  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const cast = LIBRARY_PERSONAS.filter((p) => p.modes?.includes('entertainment')).slice(0, 2);
  assert.equal(cast.length, 2);
  const cfg = {
    sessionId: 'same-choices', mode: 'entertainment', sceneId: 'roundtable',
    theme: { title: '穿越回 1999 年你会带什么？', brief: '穿越回 1999 年你会带什么？' },
    maxRounds: 7, createdAt: new Date().toISOString(),
    engineOptions: { temperature: 1, directorTemperature: 0.8, pace: 0, maxMessages: 4 },
    participants: cast.map((persona, i) => ({
      agentId: persona.id, seatIndex: i, color: '#000',
      personalityId: persona.defaultPersonalityId, persona,
    })),
  };
  const first = nextConversationVariation(cfg);
  const second = nextConversationVariation({ ...cfg, sessionId: 'different-session-id' });
  assert.notEqual(second.openingIndex, first.openingIndex);
  assert.notEqual(second.speakerIndex, first.speakerIndex);
  assert.notEqual(openingDirection(cfg.mode, first), openingDirection(cfg.mode, second));
  let previous = second;
  for (let i = 0; i < 20; i++) {
    const next = nextConversationVariation(cfg);
    assert.notEqual(next.openingIndex, previous.openingIndex);
    assert.notEqual(next.speakerIndex, previous.speakerIndex);
    previous = next;
  }
  for (const mode of ['emotion', 'rational', 'product']) {
    const participants = cfg.participants.map((p, i) => ({
      ...p, side: mode === 'rational' ? (i === 0 ? 'pro' : 'con') : undefined,
      isLead: mode === 'product' && i === 0,
    }));
    const choices = { ...cfg, mode, participants };
    const a = nextConversationVariation(choices);
    const b = nextConversationVariation(choices);
    assert.notEqual(a.openingIndex, b.openingIndex, `${mode} 的开局切入点重复`);
    if (mode !== 'product') assert.notEqual(a.speakerIndex, b.speakerIndex, `${mode} 的首发顺序重复`);
    assert.ok(agentSystemPrompt(participants[0], { ...choices, conversationVariation: a }, modeById(mode))
      .includes(openingDirection(mode, a)));
  }

  async function firstSpeech(variation, { config = cfg, kit = createEntertainmentKit(), director = '你是一场多人闲聊的导演' } = {}) {
    let directorPrompt = '';
    const chatFn = async (messages) => {
      if (messages[0].content.includes(director)) {
        if (!directorPrompt) directorPrompt = messages[1].content;
        // 故意让导演总选第一个人，验证随机抽中的开场人物仍会生效。
        return JSON.stringify({ next: {
          speaker: config.participants[0].persona.name, to: '用户', gist: '先说自己的想法',
        } });
      }
      return JSON.stringify({ say: ['我带点有用的东西。'], inner: '认真想想' });
    };
    const engine = createLiveEngine(kit, chatFn);
    const speaker = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { engine.stop(); reject(new Error('没有等到首句')); }, 2000);
      engine.start({ ...config, conversationVariation: variation }, (event) => {
        if (event.type !== 'message' || event.message.kind !== 'speech') return;
        clearTimeout(timer);
        engine.stop();
        resolve(event.message.speakerId);
      });
    });
    assert.ok(directorPrompt.includes(openingDirection(config.mode, variation)));
    return speaker;
  }

  assert.equal(await firstSpeech(first), cfg.participants[first.speakerIndex].agentId);
  assert.equal(await firstSpeech(second), cfg.participants[second.speakerIndex].agentId);
  assert.notEqual(cfg.participants[first.speakerIndex].agentId, cfg.participants[second.speakerIndex].agentId);

  // 情感分析也跑在导演 + 演员底盘上：随机抽中的开场人物和切入点同样落实到第一句
  const emotionCast = LIBRARY_PERSONAS.filter((p) => p.modes?.includes('emotion')).slice(0, 3);
  assert.equal(emotionCast.length, 3);
  const emotionCfg = {
    ...cfg, mode: 'emotion',
    theme: { title: '朋友答应周五回复，到现在还没消息', brief: '朋友答应周五回复，到现在还没消息' },
    participants: emotionCast.map((persona, i) => ({
      agentId: persona.id, seatIndex: i, color: '#000', personalityId: persona.defaultPersonalityId, persona,
    })),
  };
  const emotionRun = { config: emotionCfg, kit: createEmotionKit(), director: '「情感分析」这场对话的导演' };
  const e1 = nextConversationVariation(emotionCfg);
  const e2 = nextConversationVariation(emotionCfg);
  assert.equal(await firstSpeech(e1, emotionRun), emotionCfg.participants[e1.speakerIndex].agentId);
  assert.equal(await firstSpeech(e2, emotionRun), emotionCfg.participants[e2.speakerIndex].agentId);
  assert.notEqual(emotionCfg.participants[e1.speakerIndex].agentId, emotionCfg.participants[e2.speakerIndex].agentId);
  assert.notEqual(
    agentSystemPrompt(cfg.participants[0], { ...cfg, conversationVariation: first }, modeById('entertainment')),
    agentSystemPrompt(cfg.participants[0], { ...cfg, conversationVariation: second }, modeById('entertainment')),
  );
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '固定回答' } }] }), {
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    async function eventsFor(config, variation) {
      const session = new RoundtableSession('test', { ...config, conversationVariation: variation }, {
        baseUrl: 'http://unused.local', apiKey: 'test', model: 'test',
      });
      await session.run();
      return session.events;
    }
    for (const mode of ['emotion', 'rational']) {
      const participants = cfg.participants.map((p, i) => ({
        ...p, side: mode === 'rational' ? (i === 0 ? 'pro' : 'con') : undefined,
      }));
      const choices = { ...cfg, mode, maxRounds: mode === 'rational' ? 2 : 3, participants };
      const a = nextConversationVariation(choices);
      const b = nextConversationVariation(choices);
      const firstSpeaker = (events) => events.find((e) => e.type === 'message' && e.message.kind === 'speech')?.message.speakerId;
      assert.notEqual(firstSpeaker(await eventsFor(choices, a)), firstSpeaker(await eventsFor(choices, b)));
    }
    const extra = LIBRARY_PERSONAS.filter((p) => p.modes?.includes('entertainment'))[2];
    const productCfg = {
      ...cfg, mode: 'product', maxRounds: 3,
      participants: [...cfg.participants.map((p, i) => ({ ...p, isLead: i === 0 })), {
        agentId: extra.id, seatIndex: 2, color: '#000', personalityId: extra.defaultPersonalityId, persona: extra,
      }],
    };
    const a = nextConversationVariation(productCfg);
    const b = nextConversationVariation(productCfg);
    const firstAssigned = (events) => events.find((e) => e.type === 'task' && e.task.status === 'assigned')?.task.to;
    assert.notEqual(firstAssigned(await eventsFor(productCfg, a)), firstAssigned(await eventsFor(productCfg, b)));
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log('同样选项的连续开局：随机切入点和首位发言者均避开上一场。');
} finally {
  await server.close();
  delete globalThis.localStorage;
}
