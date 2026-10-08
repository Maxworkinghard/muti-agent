import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// 娱乐 kit 的完整流程；现有 variation 检查只等首句，情感检查使用另一份 kit。
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const value = test();
    if (value) return value;
    await sleep(5);
  }
  throw new Error('没有等到：' + label);
}
let engine;
try {
  const [{ createLiveEngine }, { createEntertainmentKit }, { LIBRARY_PERSONAS }] = await Promise.all([
    vite.ssrLoadModule('/src/engines/live/engine.ts'),
    vite.ssrLoadModule('/src/engines/entertainment/kit.ts'),
    vite.ssrLoadModule('/src/data/personas.ts'),
  ]);
  const cast = LIBRARY_PERSONAS.filter(p => p.modes?.includes('entertainment')).slice(0, 3);
  assert.equal(cast.length, 3);
  const participants = cast.map((persona, i) => ({ agentId: persona.id, persona, personalityId: persona.defaultPersonalityId, seatIndex: i, color: persona.visual.shirt }));
  const events = [];
  let modelCalls = 0;
  const mock = async messages => {
    modelCalls++;
    const system = messages[0].content;
    if (system.includes('你是一场多人闲聊的导演')) {
      // 固定提名第一位；公开点名第二位时，必须由引擎落实用户点名。
      return JSON.stringify({ arc: '升温', next: { speaker: cast[0].name, to: '用户', gist: '接住话题' } });
    }
    if (system.includes('这场闲聊的记录员')) return JSON.stringify({ recap: '完整娱乐流程已结束。', consensus: ['讨论周末安排'], disagreements: [], openQuestions: [], suggestions: [] });
    return JSON.stringify({ say: ['先聊周末安排。'], private_reply: '只给你的回复。', inner: '核对安排', stance: '听听大家的想法' });
  };
  engine = createLiveEngine(createEntertainmentKit(), mock);
  let pausedOnce = false;
  engine.start({ sessionId: 'entertainment-fixture', mode: 'entertainment', sceneId: 'roundtable', theme: { title: '周末做什么', brief: '周末做什么' },
    maxRounds: 7, createdAt: new Date().toISOString(), participants, engineOptions: { maxMessages: 6, pace: 0, spontaneity: 0 } }, event => {
    events.push(event);
    if (!pausedOnce && event.type === 'message' && event.message.kind === 'speech') {
      pausedOnce = true;
      engine.pause();
    }
  });
  await until(() => events.some(e => e.type === 'session' && e.state === 'paused'), '首句暂停');
  const speeches = () => events.filter(e => e.type === 'message' && e.message.kind === 'speech');
  const count = speeches().length;
  engine.sendUserMessage({ text: '这是仅成员可见的私聊标记', targetAgentId: participants[0].agentId });
  const reply = await until(() => events.find(e => e.type === 'message' && e.message.kind === 'reply'), '暂停中私聊回复');
  assert.equal(reply.message.private, true);
  assert.equal(reply.message.speakerId, participants[0].agentId);
  await sleep(30);
  assert.equal(speeches().length, count, '暂停中公开流程继续推进');
  engine.sendUserMessage({ text: '@' + cast[1].name + ' 说说你的周末计划' });
  engine.resume();
  const result = await until(() => events.find(e => e.type === 'result'), '完整收尾');
  assert.equal(result.result.summary, '完整娱乐流程已结束。');
  assert.ok(events.some(e => e.type === 'session' && e.state === 'finished'));
  assert.equal(speeches()[count]?.message.speakerId, participants[1].agentId, '公开点名没有率先落实');
  assert.ok(events.filter(e => e.type === 'message' && !e.message.private).every(e => !e.message.text.includes('仅成员可见')));

  const end = events.length;
  engine.sendUserMessage({ text: '结束后再聊一个周末安排' });
  await until(() => events.slice(end).some(e => e.type === 'message' && e.message.kind === 'speech'), '结束后继续对话');
  engine.stop();
  assert.ok(events.some(e => e.type === 'session' && e.state === 'stopped'));
  const stopped = events.length;
  const stoppedCalls = modelCalls;
  await sleep(30);
  // 已开始的发言可回到 idle 作收尾；停止后不得再发言、生成总结或调用模型。
  assert.ok(events.slice(stopped).every(e => e.type === 'status' && e.state === 'idle'), '停止后继续产生对话或结果');
  assert.equal(modelCalls, stoppedCalls, '停止后仍调用模型');
  console.log('Pass：娱乐 kit 完整收尾、暂停中私聊、公开点名、恢复、结束后继续和停止。');
} finally {
  engine?.stop();
  await vite.close();
}
