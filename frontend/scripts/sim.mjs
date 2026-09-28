/**
 * 命令行跑一场娱乐或情感分析模式（导演 + 演员），不开浏览器：调参数、看导演怎么排、情绪怎么递进。模型配置读 frontend/.env（和网页一样）。
 *
 *   npm run sim -- --topic "假如一周没有手机，你会怎么办？" --cast 老方,小正,小林,阿冷,阿禾 --minds
 *   npm run sim -- --mode emotion --topic "朋友答应周五回复，到现在还没消息" --minds
 *
 * 选项：
 *   --mode    entertainment（默认）或 emotion（情感分析）
 *   --topic   话题（默认：娱乐是“手机消失一周，你会怎么过？”，情感是“朋友答应周五回复，到现在还没消息”）
 *   --open    你的开场白（默认和话题一样）
 *   --cast    入座的人，逗号分隔（默认：娱乐前 5 个人物；情感是冷萃、树洞、暖宝宝、炮仗、芥末）
 *   --max     最多几次发言（默认 30）
 *   --pace    节奏倍数（默认 0.3，0 表示不等待）
 *   --say     "8:@老方 你自己不也天天刷？"   第 8 句之后你对全体说一句（可以写多次）
 *   --whisper "5:小林:老方刚才在笑你"        第 5 句之后私下对小林说（可以写多次）
 *   --pause   "10:3"                        第 10 句之后暂停 3 秒
 *   --reply   "我想先倒倒苦水"               情感模式里大家停下来等你开口时，替你说这句（默认“嗯，你们接着说吧”）
 *   --minds   每句之后打印每个人的心情，说话状态变了也打印
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = { say: [], whisper: [], pause: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'minds') { args.minds = true; continue; }
  const v = argv[++i];
  if (Array.isArray(args[k])) args[k].push(v); else args[k] = v;
}
const MODES = {
  entertainment: {
    label: '娱乐', kit: 'entertainment/kit.ts', make: 'createEntertainmentKit', config: 'entertainment/config.ts', defaults: 'ENTERTAINMENT_DEFAULTS',
    topic: '手机消失一周，你会怎么过？',
  },
  emotion: {
    label: '情感', kit: 'emotion/kit.ts', make: 'createEmotionKit', config: 'emotion/config.ts', defaults: 'EMOTION_DEFAULTS',
    topic: '朋友答应周五回复，到现在还没消息', cast: '冷萃,树洞,暖宝宝,炮仗,芥末',
  },
};
const mode = args.mode || 'entertainment';
const M = MODES[mode];
if (!M) {
  console.error('没有这个模式：' + mode + '（可选：' + Object.keys(MODES).join('、') + '）');
  process.exit(1);
}
const topic = args.topic || M.topic;
const opening = args.open || topic;
const max = Number(args.max ?? 30);
const pace = Number(args.pace ?? 0.3);

const env = { ...loadEnv('development', root, ''), ...process.env };
const baseUrl = (env.LLM_BASE_URL || env.ROUNDTABLE_API_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const apiKey = env.LLM_API_KEY || env.ROUNDTABLE_API_KEY;
const model = env.LLM_MODEL || env.ROUNDTABLE_MODEL || 'deepseek-chat';
if (!apiKey) {
  console.error('没有 LLM_API_KEY：在 frontend/.env 里填上（和网页用的是同一份）');
  process.exit(1);
}

const server = await createServer({
  root, configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
});
const load = (p) => server.ssrLoadModule(p);
const { createLiveEngine } = await load('/src/engines/live/engine.ts');
const createKit = (await load('/src/engines/' + M.kit))[M.make];
const DEFAULTS = (await load('/src/engines/' + M.config))[M.defaults];
const { LIBRARY_PERSONAS } = await load('/src/data/personas.ts');
const { LlmError } = await load('/src/llm/client.ts');

const stats = { calls: 0, ms: 0, promptTokens: 0, completionTokens: 0 };
/** 直连模型服务（网页里走 /api/llm/chat 转发，这里没有浏览器） */
async function chatFn(messages, { temperature, signal }) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages, temperature, max_tokens: 8000, stream: false }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new LlmError('aborted', '已停止', false);
    throw e;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + '：' + (await res.text()).slice(0, 200));
  let data = await res.json();
  if (data?.data?.choices) data = data.data;
  const text = data?.choices?.[0]?.message?.content ?? '';
  stats.calls++;
  stats.ms += Date.now() - t0;
  stats.promptTokens += data?.usage?.prompt_tokens ?? 0;
  stats.completionTokens += data?.usage?.completion_tokens ?? 0;
  if (!String(text).trim()) throw new Error('模型返回了空内容');
  return text;
}

const pool = LIBRARY_PERSONAS.filter((p) => !p.modes || p.modes.includes(mode));
const castArg = args.cast || M.cast;
const names = castArg ? castArg.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : pool.slice(0, 5).map((p) => p.name);
const cast = names.map((n) => pool.find((p) => p.name === n) ?? (console.error('没有这个' + M.label + '人物：' + n + '（可选：' + pool.map((p) => p.name).join('、') + '）'), process.exit(1)));
const participants = cast.map((persona, i) => ({
  agentId: persona.id, seatIndex: i, color: persona.visual.shirt, personalityId: persona.defaultPersonalityId, persona,
}));
const nameOf = (id) => (id === 'user' ? '你' : participants.find((p) => p.agentId === id)?.persona.name ?? id);

const dim = (s) => '\x1b[2m' + s + '\x1b[0m';
const bold = (s) => '\x1b[1m' + s + '\x1b[0m';
const t0 = Date.now();
const clock = () => dim(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's');

const minds = {};
let lastArc = '';
let lastNote = '';
const styles = {};
const open = new Map();
let said = 0;
const counts = { speech: 0, cut: 0, interrupt: 0, react: 0, whisper: 0 };
const byWho = {};

/** 发言是一个字一个字出来的，等下一条消息出现（或者被打断）时再整条打印 */
function flush() {
  for (const [id, m] of open) {
    open.delete(id);
    const tags = [m.tag, m.cut && '被打断', m.quote && '↪' + m.quote.name].filter(Boolean).join(' ');
    console.log(clock(), bold(nameOf(m.speakerId)) + (tags ? dim(' [' + tags + ']') : '') + '：' + m.text);
    byWho[m.speakerId] = (byWho[m.speakerId] ?? 0) + 1;
    counts.speech++;
    if (m.cut) counts.cut++;
    if (m.tag === '插嘴') counts.interrupt++;
    said++;
    script(said);
    if (args.minds) {
      console.log('        ' + dim(participants.map((p) => {
        const x = minds[p.agentId];
        return x ? p.persona.name + x.emoji + x.mood.map((v) => Math.round(v.value)).join('/') : '';
      }).join('  ')));
    }
  }
}

const at = (list) => list.map((s) => { const i = s.indexOf(':'); return [Number(s.slice(0, i)), s.slice(i + 1)]; });
const says = at(args.say);
const whispers = at(args.whisper).map(([n, rest]) => { const i = rest.indexOf(':'); return [n, rest.slice(0, i), rest.slice(i + 1)]; });
const pauses = at(args.pause);
function script(n) {
  for (const [k, text] of says) if (k === n) setTimeout(() => engine.sendUserMessage({ text }), 0);
  for (const [k, who, text] of whispers) {
    if (k !== n) continue;
    const p = participants.find((x) => x.persona.name === who);
    if (p) setTimeout(() => engine.sendUserMessage({ text, targetAgentId: p.agentId }), 0);
  }
  for (const [k, secs] of pauses) {
    if (k !== n) continue;
    setTimeout(() => { engine.pause(); setTimeout(() => engine.resume(), Number(secs) * 1000); }, 0);
  }
}

function done(code = 0) {
  flush();
  const avg = stats.calls ? Math.round(stats.ms / stats.calls) : 0;
  console.log('\n' + bold('统计') + '：' + counts.speech + ' 句（' + Object.entries(byWho).map(([id, n]) => nameOf(id) + ' ' + n).join('、') + '）'
    + '，插嘴 ' + counts.interrupt + '，被打断 ' + counts.cut + '，小声 ' + counts.react + '，私聊回复 ' + counts.whisper);
  console.log('模型调用 ' + stats.calls + ' 次，平均 ' + avg + 'ms，输入 ' + stats.promptTokens + ' / 输出 ' + stats.completionTokens + ' tokens');
  void server.close().finally(() => process.exit(code));
}

// 导演只在命令行里看得到（调参用），网页上不显示
const engine = createLiveEngine(createKit(), chatFn, (cue, speaker) => {
  const bits = [];
  if (cue.arc && cue.arc !== lastArc) { lastArc = cue.arc; bits.push('全场：' + cue.arc); }
  if (cue.arcNote && cue.arcNote !== lastNote) { lastNote = cue.arcNote; bits.push('打算：' + cue.arcNote); }
  bits.push(speaker ? '下一句 ' + speaker + (cue.gist ? '（' + cue.gist + (cue.emotion ? '，' + cue.emotion : '') + '）' : '') : '冷场');
  console.log('        ' + dim('🎬 ' + bits.join('｜')));
});
console.log(bold('话题：') + topic + '  ' + dim('（' + model + ' · ' + names.join('、') + '）'));
console.log(clock(), bold('你') + '：' + opening);
let waiting = false;
engine.start({
  sessionId: 'sim-' + Date.now().toString(36), mode, sceneId: 'roundtable',
  theme: { title: topic, brief: opening }, maxRounds: 1, participants,
  engineOptions: { ...DEFAULTS, maxMessages: max, pace },
  createdAt: new Date().toISOString(),
}, (e) => {
  switch (e.type) {
    case 'status':
      // 分步的模式没走完就冷场：大家停下来等你开口，这里替你说一句，不然会一直等着
      if (e.action === '等你开口' && !waiting) {
        waiting = true;
        flush();
        console.log(clock(), dim('（大家在等你开口）'));
        setTimeout(() => { waiting = false; engine.sendUserMessage({ text: args.reply || '嗯，你们接着说吧' }); }, 0);
      }
      break;
    case 'message': {
      const m = e.message;
      // 正在说的那句不打断打印：只有下一句开口时才把上一句整条印出来
      if (m.kind === 'speech') { flush(); open.set(m.id, { ...m }); break; }
      if (m.kind === 'react') { counts.react++; console.log(clock(), dim(nameOf(m.speakerId) + ' 小声：' + m.text)); break; }
      if (m.kind === 'reply' && m.private) { counts.whisper++; console.log(clock(), dim('（' + nameOf(m.speakerId) + ' 私下回你：' + m.text + '）')); break; }
      if (m.speakerId === 'user') console.log(clock(), bold('你') + (m.private ? dim(' → ' + nameOf(m.targetId) + ' 私聊') : '') + '：' + m.text);
      break;
    }
    case 'message_update': {
      const m = open.get(e.id);
      if (m) { m.text = e.text; if (e.cut) { m.cut = true; flush(); } }
      break;
    }
    case 'mind':
      minds[e.agentId] = e.mind;
      if (args.minds && e.mind.style && styles[e.agentId] !== e.mind.style) {
        styles[e.agentId] = e.mind.style;
        console.log('        ' + dim('✎ ' + nameOf(e.agentId) + ' 的说话状态：' + e.mind.style));
      }
      break;
    case 'round': if (e.round > 1) { flush(); console.log(dim('—— ' + e.label + ' ——')); } break;
    case 'session':
      if (e.state === 'paused') console.log(dim('（暂停）'));
      if (e.state === 'stopped') done(1);
      break;
    case 'result': {
      flush();
      const r = e.result;
      console.log('\n' + bold('这场聊下来：') + (r.summary ?? ''));
      const [open, next] = mode === 'emotion' ? ['还要确认', '一小步'] : ['没聊完', '可以接着聊'];
      for (const [k, v] of [['共识', r.consensus], ['分歧', r.disagreements], [open, r.openQuestions], [next, r.suggestions]]) {
        if (v?.length) console.log('  ' + k + '：' + v.join('；'));
      }
      done();
      break;
    }
    case 'error':
      flush();
      console.error('出错：' + e.message);
      done(1);
      break;
  }
});
process.on('SIGINT', () => { engine.stop(); done(130); });
