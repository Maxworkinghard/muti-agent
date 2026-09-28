/**
 * 命令行跑娱乐或情感分析模式（导演 + 演员），不开浏览器：调参数，看导演提名了谁、抽中了谁、演员有没有照导演说、情绪怎么递进。
 * 模型配置读 frontend/.env（和网页一样）。
 *
 *   npm run sim -- --topic "假如一周没有手机，你会怎么办？" --cast 老方,小正,小林,阿冷,阿禾 --minds
 *   npm run sim -- --mode emotion --topic "朋友答应周五回复，到现在还没消息" --minds
 *   npm run sim -- --mode emotion --runs 3 --max 14 --pace 0     同一设置连跑 3 场，比比走向有多不一样
 *
 * 选项：
 *   --mode        entertainment（默认）或 emotion（情感分析）
 *   --topic       话题（默认：娱乐是“手机消失一周，你会怎么过？”，情感是“朋友答应周五回复，到现在还没消息”）
 *   --open        你的开场白（默认和话题一样）
 *   --cast        入座的人，逗号分隔（默认：娱乐前 5 个人物；情感是冷萃、树洞、暖宝宝、炮仗、芥末）
 *   --max         最多几次发言（默认 30）
 *   --pace        节奏倍数（默认 0.3，0 表示不等待）
 *   --spontaneity 随性程度 0~1：谁开口有多少按各人此刻的冲动抽（默认用模式的设置）
 *   --say         "8:@老方 你自己不也天天刷？"   第 8 句之后你对全体说一句（可以写多次）
 *   --whisper     "5:小林:老方刚才在笑你"        第 5 句之后私下对小林说（可以写多次）
 *   --pause       "10:3"                        第 10 句之后暂停 3 秒
 *   --reply       "我想先倒倒苦水"               情感模式里大家停下来等你开口时，替你说这句（默认“嗯，你们接着说吧”）
 *   --runs        同一设置连跑几场（默认 1）；多于 1 场时只打印每场的概要，最后给对照：
 *                 开场是谁、发言顺序差多少、各人口吻重合多少、导演首选被抽中的比例、演员没照导演说的比例
 *   --minds       每句之后打印每个人的心情，说话状态、看法变了也打印（只在跑一场时）
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
const runs = Math.max(1, Math.floor(Number(args.runs ?? 1)));
const verbose = runs === 1;

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

const pool = LIBRARY_PERSONAS.filter((p) => !p.modes || p.modes.includes(mode));
const castArg = args.cast || M.cast;
const names = castArg ? castArg.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : pool.slice(0, 5).map((p) => p.name);
const cast = names.map((n) => pool.find((p) => p.name === n) ?? (console.error('没有这个' + M.label + '人物：' + n + '（可选：' + pool.map((p) => p.name).join('、') + '）'), process.exit(1)));
const participants = cast.map((persona, i) => ({
  agentId: persona.id, seatIndex: i, color: persona.visual.shirt, personalityId: persona.defaultPersonalityId, persona,
}));
const nameOf = (id) => (id === 'user' ? '你' : participants.find((p) => p.agentId === id)?.persona.name ?? id);
const engineOptions = { ...DEFAULTS, maxMessages: max, pace, ...(args.spontaneity !== undefined ? { spontaneity: Number(args.spontaneity) } : {}) };

const dim = (s) => '\x1b[2m' + s + '\x1b[0m';
const bold = (s) => '\x1b[1m' + s + '\x1b[0m';
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');

/** 直连模型服务（网页里走 /api/llm/chat 转发，这里没有浏览器）；每场各记各的用量 */
function makeChat(stats) {
  return async (messages, { temperature, signal }) => {
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
    stats.reasoningTokens += data?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    if (!String(text).trim()) throw new Error('模型返回了空内容');
    return text;
  };
}

const at = (list) => list.map((s) => { const i = s.indexOf(':'); return [Number(s.slice(0, i)), s.slice(i + 1)]; });
const says = at(args.say);
const whispers = at(args.whisper).map(([n, rest]) => { const i = rest.indexOf(':'); return [n, rest.slice(0, i), rest.slice(i + 1)]; });
const pauses = at(args.pause);

let current = null;

/** 跑一场，返回这场的记录（给多场对照用） */
function runOnce() {
  return new Promise((resolve) => {
    const stats = { calls: 0, ms: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 };
    const t0 = Date.now();
    const clock = () => dim(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's');
    const log = (...a) => { if (verbose) console.log(...a); };
    const minds = {};
    const styles = {};
    const stances = {};
    const open = new Map();
    let said = 0;
    const counts = { speech: 0, cut: 0, interrupt: 0, react: 0, whisper: 0 };
    const byWho = {};
    /** 每次发言是谁（同一个人连发的几条算一次）、每个人说过的话、分段 */
    const order = [];
    const linesBy = {};
    const rounds = [];
    let firstLine = '';
    const picks = { first: 0, other: 0, forced: 0 };
    const acts = { total: 0, off: 0, why: [] };
    let lastArc = '';
    let lastNote = '';
    let waiting = false;
    let finished = false;
    let result = null;

    /** 发言是一个字一个字出来的，等下一条消息出现（或者被打断）时再整条打印 */
    function flush() {
      for (const [id, m] of open) {
        open.delete(id);
        const tags = [m.tag, m.cut && '被打断', m.quote && '↪' + m.quote.name].filter(Boolean).join(' ');
        log(clock(), bold(nameOf(m.speakerId)) + (tags ? dim(' [' + tags + ']') : '') + '：' + m.text);
        byWho[m.speakerId] = (byWho[m.speakerId] ?? 0) + 1;
        (linesBy[m.speakerId] ??= []).push(m.text);
        if (order[order.length - 1] !== m.speakerId) order.push(m.speakerId);
        if (!firstLine) firstLine = nameOf(m.speakerId) + '：' + m.text;
        counts.speech++;
        if (m.cut) counts.cut++;
        if (m.tag === '插嘴') counts.interrupt++;
        said++;
        script(said);
        if (verbose && args.minds) {
          console.log('        ' + dim(participants.map((p) => {
            const x = minds[p.agentId];
            return x ? p.persona.name + x.emoji + x.mood.map((v) => Math.round(v.value)).join('/') : '';
          }).join('  ')));
        }
      }
    }

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

    /** 导演提名了谁、各人冲动多大、抽中了谁；演员没照导演说时的理由。只在命令行里看得到（调参用），网页上不显示 */
    function onDebug(a, b) {
      // 旧版底盘的 debug 是 (cue, speaker)，也认，方便拿同一个脚本对照新旧两版
      const e = typeof b === 'string' ? { type: 'cue', cue: a, speaker: b } : a;
      if (e.type === 'speech') {
        acts.total++;
        if (!e.follow) {
          acts.off++;
          acts.why.push(e.speaker + '：' + (e.why || '（没说理由）'));
          log('        ' + dim('↯ ' + e.speaker + ' 没照导演说：' + (e.why || '（没说理由）')));
        }
        return;
      }
      const cue = e.cue;
      const cands = cue.candidates ?? [];
      if (cands.length) {
        if (cue.picked === 0) picks.first++;
        else if (cue.picked > 0) picks.other++;
        else picks.forced++;
      }
      if (!verbose) return;
      const bits = [];
      if (cue.arc && cue.arc !== lastArc) { lastArc = cue.arc; bits.push('全场：' + cue.arc); }
      if (cue.arcNote && cue.arcNote !== lastNote) { lastNote = cue.arcNote; bits.push('打算：' + cue.arcNote); }
      if (cands.length > 1 || cue.picked < 0) {
        const how = cue.picked < 0 ? '按规则派' : cue.picked === 0 ? '导演首选' : '按冲动抽中';
        bits.push('候选 ' + cands.map((c, i) => nameOf(c.speaker) + ' ' + cue.weights[i] + (i === cue.picked ? '✓' : '')).join(' / ') + ' → ' + how);
      }
      bits.push(e.speaker ? '下一句 ' + e.speaker + (cue.gist ? '（' + cue.gist + (cue.emotion ? '，' + cue.emotion : '') + '）' : '') : '冷场');
      console.log('        ' + dim('🎬 ' + bits.join('｜')));
    }

    const engine = createLiveEngine(createKit(), makeChat(stats), onDebug);
    current = engine;

    function done(code) {
      if (finished) return;
      finished = true;
      flush();
      engine.stop();
      resolve({
        code, stats, counts, byWho, order, linesBy, rounds, firstLine, picks, acts, result, secs: (Date.now() - t0) / 1000,
      });
    }

    log(bold('话题：') + topic + '  ' + dim('（' + model + ' · ' + names.join('、') + ' · 随性 ' + engineOptions.spontaneity + '）'));
    log(clock(), bold('你') + '：' + opening);
    engine.start({
      sessionId: 'sim-' + Date.now().toString(36), mode, sceneId: 'roundtable',
      theme: { title: topic, brief: opening }, maxRounds: 1, participants, engineOptions,
      createdAt: new Date().toISOString(),
    }, (e) => {
      if (finished) return;
      switch (e.type) {
        case 'status':
          // 分步的模式没走完就冷场：大家停下来等你开口，这里替你说一句，不然会一直等着
          if (e.action === '等你开口' && !waiting) {
            waiting = true;
            flush();
            log(clock(), dim('（大家在等你开口）'));
            setTimeout(() => { waiting = false; engine.sendUserMessage({ text: args.reply || '嗯，你们接着说吧' }); }, 0);
          }
          break;
        case 'message': {
          const m = e.message;
          // 正在说的那句不打断打印：只有下一句开口时才把上一句整条印出来
          if (m.kind === 'speech') { flush(); open.set(m.id, { ...m }); break; }
          if (m.kind === 'react') { counts.react++; log(clock(), dim(nameOf(m.speakerId) + ' 小声：' + m.text)); break; }
          if (m.kind === 'reply' && m.private) { counts.whisper++; log(clock(), dim('（' + nameOf(m.speakerId) + ' 私下回你：' + m.text + '）')); break; }
          if (m.speakerId === 'user') log(clock(), bold('你') + (m.private ? dim(' → ' + nameOf(m.targetId) + ' 私聊') : '') + '：' + m.text);
          break;
        }
        case 'message_update': {
          const m = open.get(e.id);
          if (m) { m.text = e.text; if (e.cut) { m.cut = true; flush(); } }
          break;
        }
        case 'mind':
          minds[e.agentId] = e.mind;
          if (verbose && args.minds && e.mind.style && styles[e.agentId] !== e.mind.style) {
            styles[e.agentId] = e.mind.style;
            console.log('        ' + dim('✎ ' + nameOf(e.agentId) + ' 的说话状态：' + e.mind.style));
          }
          if (verbose && args.minds && e.mind.stance && stances[e.agentId] !== e.mind.stance) {
            stances[e.agentId] = e.mind.stance;
            console.log('        ' + dim('◆ ' + nameOf(e.agentId) + ' 的看法：' + e.mind.stance));
          }
          break;
        case 'round':
          rounds.push(e.label);
          if (e.round > 1) { flush(); log(dim('—— ' + e.label + ' ——')); }
          break;
        case 'session':
          if (e.state === 'paused') log(dim('（暂停）'));
          if (e.state === 'stopped') done(1);
          break;
        case 'result': {
          flush();
          result = e.result;
          if (verbose) {
            const r = e.result;
            console.log('\n' + bold('这场聊下来：') + (r.summary ?? ''));
            const [openQ, next] = mode === 'emotion' ? ['还要确认', '一小步'] : ['没聊完', '可以接着聊'];
            for (const [k, v] of [['共识', r.consensus], ['分歧', r.disagreements], [openQ, r.openQuestions], [next, r.suggestions]]) {
              if (v?.length) console.log('  ' + k + '：' + v.join('；'));
            }
          }
          done(0);
          break;
        }
        case 'error':
          flush();
          console.error('出错：' + e.message);
          done(1);
          break;
      }
    });
  });
}

// ---------- 对照用的几个量 ----------

/** 两场的发言顺序差多少：编辑距离 / 较长的那个，0 一样，1 完全不同 */
function orderDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n && !m) return 0;
  const d = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[n][m] / Math.max(n, m);
}

/** 一场里各人口吻重合多少：两两比较各自说过的话里相邻两字的重合（Jaccard），取平均；越低越各说各的 */
function voiceOverlap(linesBy) {
  const grams = (texts) => {
    const t = texts.join('').replace(/[\s\p{P}\p{S}]/gu, '');
    const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const sets = Object.values(linesBy).filter((ls) => ls.length >= 2).map(grams);
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let both = 0;
      for (const x of sets[i]) if (sets[j].has(x)) both++;
      const union = sets[i].size + sets[j].size - both;
      if (union) { sum += both / union; pairs++; }
    }
  }
  return pairs ? sum / pairs : 0;
}

function summaryLine(i, r) {
  const who = r.order.slice(0, 10).map(nameOf).join('→');
  const picked = r.picks.first + r.picks.other + r.picks.forced;
  const per = (v) => (r.stats.calls ? Math.round(v / r.stats.calls) : 0);
  return bold('第 ' + i + ' 场') + '：' + r.counts.speech + ' 句 · ' + r.secs.toFixed(0) + 's · 调用 ' + r.stats.calls + ' 次'
    + '（平均 ' + per(r.stats.ms) + 'ms、输出 ' + per(r.stats.completionTokens) + ' tokens/次）'
    + ' · 导演首选 ' + pct(r.picks.first, picked) + ' · 没照导演说 ' + r.acts.off + '/' + r.acts.total
    + ' · 口吻重合 ' + voiceOverlap(r.linesBy).toFixed(3) + (r.result ? '' : ' · 没收尾')
    + '\n    分段：' + r.rounds.join(' → ') + '\n    顺序：' + who + (r.order.length > 10 ? '…' : '')
    + '\n    开场：' + r.firstLine;
}

process.on('SIGINT', () => { current?.stop(); void server.close().finally(() => process.exit(130)); });

if (verbose) {
  const r = await runOnce();
  const avg = r.stats.calls ? Math.round(r.stats.ms / r.stats.calls) : 0;
  const picked = r.picks.first + r.picks.other + r.picks.forced;
  console.log('\n' + bold('统计') + '：' + r.counts.speech + ' 句（' + Object.entries(r.byWho).map(([id, n]) => nameOf(id) + ' ' + n).join('、') + '）'
    + '，插嘴 ' + r.counts.interrupt + '，被打断 ' + r.counts.cut + '，小声 ' + r.counts.react + '，私聊回复 ' + r.counts.whisper);
  if (picked) {
    console.log('谁开口：导演首选 ' + r.picks.first + '，按冲动抽中别的候选 ' + r.picks.other + '，按规则另派 ' + r.picks.forced
      + '；演员 ' + r.acts.total + ' 次里 ' + r.acts.off + ' 次没照导演说；各人口吻重合 ' + voiceOverlap(r.linesBy).toFixed(3));
  }
  console.log('模型调用 ' + r.stats.calls + ' 次，平均 ' + avg + 'ms，输入 ' + r.stats.promptTokens + ' / 输出 ' + r.stats.completionTokens + ' tokens'
    + (r.stats.reasoningTokens ? '（其中思考 ' + r.stats.reasoningTokens + '）' : ''));
  void server.close().finally(() => process.exit(r.code));
} else {
  console.log(bold('话题：') + topic + '  ' + dim('（' + model + ' · ' + names.join('、') + ' · 随性 ' + engineOptions.spontaneity + ' · 连跑 ' + runs + ' 场）'));
  const all = [];
  for (let i = 1; i <= runs; i++) {
    const r = await runOnce();
    all.push(r);
    console.log(summaryLine(i, r));
  }
  let dist = 0;
  let pairs = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { dist += orderDistance(all[i].order.slice(0, 10), all[j].order.slice(0, 10)); pairs++; }
  const sum = (f) => all.reduce((s, r) => s + f(r), 0);
  const picked = sum((r) => r.picks.first + r.picks.other + r.picks.forced);
  console.log('\n' + bold('对照') + '：开场的人 ' + new Set(all.map((r) => r.order[0])).size + '/' + all.length + ' 种'
    + ' · 前 10 次发言顺序两两相差 ' + (pairs ? (dist / pairs).toFixed(2) : '-') + '（0 一样，1 全不同）'
    + ' · 各人口吻重合 ' + (sum((r) => voiceOverlap(r.linesBy)) / all.length).toFixed(3) + '（越低越各说各的）'
    + (picked ? ' · 导演首选被抽中 ' + pct(sum((r) => r.picks.first), picked) : '')
    + ' · 演员没照导演说 ' + sum((r) => r.acts.off) + '/' + sum((r) => r.acts.total)
    + ' · 共调用 ' + sum((r) => r.stats.calls) + ' 次');
  const whys = all.flatMap((r) => r.acts.why);
  if (whys.length) console.log(dim('没照导演说的理由：\n  ' + whys.slice(0, 8).join('\n  ')));
  void server.close().finally(() => process.exit(all.some((r) => r.code) ? 1 : 0));
}
