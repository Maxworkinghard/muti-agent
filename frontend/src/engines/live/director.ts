/**
 * 模型调用与轮流：调模型拿 JSON（ask）、导演提名 + 按冲动抽谁开口（plan / cast / draw / impulse）、
 * 解析导演和演员的回答（parseCue / parseSpeech）、私聊回复（whisper / answerWhisper）、散场总结（summarize）。
 * 所有函数都以 LiveRoom 为第一个参数。
 */
import { isAbort } from '../../llm/client';
import { openingDirection } from '../../data/conversationVariation';
import { extractJson } from './json';
import { heat, type Mind } from './mind';
import {
  arcText, cueText, logText, nowText, privateText, stateAll, stateOne, transcriptText,
} from './prompts';
import { bump, message, moodStep, note, rest, showMind, status } from './state';
import { clamp, errMsg, escapeRe, STEP_MOOD, uid, unwrapQuotes } from './util';
import { REACT_KINDS, type Candidate, type ChatFn, type Cue, type Speech } from './types';
import type { LiveRoom, Pending, Plan } from './engine';

/** 调一次模型拿 JSON，没按格式回答就再问一次 */
export async function ask<T>(
  room: LiveRoom, who: string, temperature: number, signal: AbortSignal,
  build: () => Parameters<ChatFn>[0], parse: (t: string) => T | null,
): Promise<T> {
  const messages = build();
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = parse(await room.chatFn(messages, { temperature, signal }));
    if (r) return r;
  }
  throw new Error(who + ' 两次都没按格式回答');
}

/** 导演提名，引擎按冲动抽谁开口，演员自己说出来 */
export async function plan(room: LiveRoom, signal: AbortSignal, p?: Pending): Promise<Plan> {
  const cue = await ask(room, '导演', room.opts.directorTemperature, signal, () => room.kit.directorMessages({
    cfg: room.cfg, transcript: transcriptText(room), state: stateAll(room), arc: arcText(room), now: nowText(room),
  }), (t) => parseCue(room, t));
  cast(room, cue);
  const first = firstSpeaker(room);
  if (first && cue.speaker !== first.id) {
    // 随机抽中的开场人物必须落实到实际发言；导演偶尔忽略提示时也能避免紧邻两场同人开头。
    cue.speaker = first.id;
    cue.picked = -1;
    cue.to = 'user';
    cue.replyTo = room.lastFloor()?.id;
    cue.gist = `接住用户的原话；${openingDirection(room.cfg.mode, room.cfg.conversationVariation)}`;
    cue.emotion = '';
    cue.interrupt = false;
    cue.cutAfter = '';
    cue.react = cue.react.filter((r) => r.id !== first.id);
  }
  const m = cue.speaker ? room.minds.get(cue.speaker) ?? null : null;
  if (p) p.cue = cue;
  room.debug?.({ type: 'cue', cue, speaker: m?.name ?? '' });
  if (!m) return { cue, m: null, say: [], inner: '' };
  if (!signal.aborted && !room.paused && room.speaking?.m !== m) status(room, m, 'thinking', '想说话');
  const speech = await ask(room, m.name, room.opts.temperature, signal, () => room.kit.actorMessages({
    self: m.p, cfg: room.cfg, temper: m.t, transcript: transcriptText(room), privates: privateText(m),
    state: stateOne(room, m, cue), cue: cueText(room, m, cue), whisper: false,
  }), (t) => parseSpeech(room, t, m, false));
  room.debug?.({ type: 'speech', speaker: m.name, follow: speech.follow, why: speech.why, stance: speech.stance, plan: speech.plan });
  return { cue, m, say: speech.say, inner: speech.inner, speech };
}

/**
 * 谁开口：导演只提名候选，这里按各人此刻的冲动抽一个——随性程度（spontaneity）那么大的概率按冲动抽，否则用导演首选。
 * 硬规则优先：用户点了名，被点的人先接（导演没提名他也一样）；用户说了话，只在冲用户说的候选里抽，抽中的人得接他
 */
function cast(room: LiveRoom, cue: Cue) {
  const take = (c: Candidate, i: number) => {
    cue.picked = i;
    cue.speaker = c.speaker;
    cue.to = c.to;
    cue.gist = c.gist;
    cue.emotion = c.emotion;
    cue.replyTo = c.replyTo;
    cue.interrupt = c.interrupt;
    cue.cutAfter = c.cutAfter;
  };
  const cands = cue.candidates;
  cue.weights = cands.map((c) => impulse(room, room.minds.get(c.speaker)));
  const lastUser = room.lastUserLine();
  const named = room.userWaiting ? [...room.mentioned] : [];
  const answer = (id: string, gist: string) => ({ speaker: id, to: 'user', gist, emotion: '', replyTo: lastUser?.id, interrupt: false, cutAfter: '' });
  if (named.length) {
    const i = cands.findIndex((c) => room.mentioned.has(c.speaker));
    if (i >= 0) take(cands[i], i);
    else take(answer(named[Math.floor(Math.random() * named.length)], '接用户点名问你的话'), -1);
    // 被点名的人是来接用户的话的
    if (cue.to !== 'user') { cue.to = 'user'; cue.replyTo = lastUser?.id; }
  } else if (!cands.length && room.userWaiting) {
    // 用户说了话，导演却没提名任何人：不能冷场晾着他，按冲动挑一个人来接
    const minds = [...room.minds.values()];
    const i = draw(room, minds.map((_, k) => k), minds.map((m) => impulse(room, m)), 1);
    take(answer(minds[i].id, '接用户刚才的话'), -1);
  } else if (cands.length) {
    let pool = cands.map((_, i) => i);
    const toUser = (c: Candidate) => c.to === 'user' || (!!lastUser && c.replyTo === lastUser.id);
    if (room.userWaiting && pool.some((i) => toUser(cands[i]))) pool = pool.filter((i) => toUser(cands[i]));
    const i = draw(room, pool, cue.weights);
    take(cands[i], i);
    if (room.userWaiting && !toUser(cue)) { cue.to = 'user'; cue.replyTo = lastUser?.id; }
  }
  cue.react = cue.react.filter((r) => r.id !== cue.speaker);
}

/** 随性程度那么大的概率按冲动抽（冲动越大越容易抽中），否则用导演首选（pool 里排最前的） */
function draw(room: LiveRoom, pool: number[], weights: number[], spontaneity = room.opts.spontaneity) {
  if (pool.length === 1 || Math.random() >= spontaneity) return pool[0];
  const total = pool.reduce((s, i) => s + weights[i], 0);
  let r = Math.random() * total;
  for (const i of pool) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return pool[pool.length - 1];
}

/**
 * 一个人此刻有多想开口（代码算，不问模型）：话多的人门槛低，上头的人憋不住，
 * 最新一句冲他来的、看不惯刚说话的人、刚被打断的更想接；刚说完的让一让，憋久了的想说两句
 */
function impulse(room: LiveRoom, m: Mind | undefined) {
  if (!m) return 0;
  const last = room.lastFloor();
  let w = 0.4 + m.t.talk + 1.2 * heat(m, room.kit.moods);
  if (last && last.speaker !== m.id) {
    const target = last.to || room.lines.find((l) => l.id === last.replyTo)?.speaker;
    if (target === m.id) w += 1.2;
    if (last.speaker !== 'user' && (m.rel[last.speaker] ?? 0) <= -3) w += 0.6;
  }
  if (m.cutoff) w += 0.8;
  const since = m.lastSpoke < 0 ? -1 : room.step - m.lastSpoke;
  if (since === 0) w *= 0.3;
  else if (since < 0 ? room.step >= 4 : since >= 6) w += 0.3;
  return Math.round(w * 100) / 100;
}

export function firstSpeaker(room: LiveRoom) {
  const v = room.cfg.conversationVariation?.speakerIndex;
  if (room.step !== 1 || room.mentioned.size || typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null;
  const p = room.cfg.participants[v % room.cfg.participants.length];
  return p ? room.minds.get(p.agentId) ?? null : null;
}

// ---------- 解析 ----------

function idOf(room: LiveRoom, name: unknown) {
  return typeof name === 'string' ? room.nameToId.get(name.replace(/^@/, '').trim()) : undefined;
}

function parseCue(room: LiveRoom, text: string): Cue | null {
  const j = extractJson(text);
  if (!j) return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : 0; };
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const byName = <T>(v: unknown, f: (x: unknown, id: string) => T | undefined) => {
    const out: Record<string, T> = {};
    for (const [name, x] of Object.entries(obj(v))) {
      const id = idOf(room, name);
      if (!id || id === 'user') continue;
      const val = f(x, id);
      if (val !== undefined) out[id] = val;
    }
    return out;
  };
  /** 导演提名的一个候选；认不出是谁的不要 */
  const candidate = (v: unknown): Candidate | null => {
    const c = obj(v);
    const speaker = idOf(room, c.speaker);
    if (!speaker || speaker === 'user') return null;
    const to = idOf(room, c.to) ?? '';
    const replyTo = str(c.reply_to, 12);
    return {
      speaker,
      to: to === speaker ? '' : to,
      gist: str(c.gist, 80),
      emotion: str(c.emotion, 20),
      replyTo: room.lines.some((l) => l.id === replyTo) ? replyTo : undefined,
      interrupt: c.interrupt === true || c.interrupt === 'true',
      cutAfter: str(c.cut_after, 20),
    };
  };
  // candidates 是现在的写法；next（只提一个人）是以前的写法，也认
  const candidates: Candidate[] = [];
  for (const v of Array.isArray(j.candidates) ? j.candidates : j.next ? [j.next] : []) {
    const c = candidate(v);
    if (c && !candidates.some((x) => x.speaker === c.speaker)) candidates.push(c);
    if (candidates.length >= 3) break;
  }
  return {
    speaker: '', to: '', gist: '', emotion: '', interrupt: false, cutAfter: '',
    candidates,
    picked: -1,
    weights: [],
    mood: byName(j.mood, (x) => {
      const d: Record<string, number> = {};
      for (const k of room.kit.moods) d[k.key] = int(obj(x)[k.key], -STEP_MOOD, STEP_MOOD);
      return d;
    }),
    style: byName(j.style, (x) => (typeof x === 'string' ? x.trim().slice(0, 40) : undefined)),
    toward: byName(j.toward, (x) => {
      const d: Record<string, number> = {};
      for (const [name, v] of Object.entries(obj(x))) { const id = idOf(room, name); if (id) d[id] = int(v, -2, 2); }
      return d;
    }),
    react: (Array.isArray(j.react) ? j.react : [])
      .map((r) => {
        const kind = str(obj(r).kind, 4);
        return { id: idOf(room, obj(r).who) ?? '', kind: REACT_KINDS.includes(kind) ? kind : '', text: clean(str(obj(r).text, 12)) };
      })
      .filter((r) => r.id && r.id !== 'user' && (r.kind || r.text))
      .slice(0, 2),
    arc: str(j.arc, 8),
    arcNote: str(j.arc_note, 60),
    topic: str(j.topic, 12),
    end: j.end === true || j.end === 'true',
  };
}

function parseSpeech(room: LiveRoom, text: string, m: Mind, whisper: boolean): Speech | null {
  const j = extractJson(text);
  if (!j) return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const rawSay = Array.isArray(j.say) ? j.say : typeof j.say === 'string' ? [j.say] : [];
  const say = rawSay.map((s) => clean(String(s), m)).filter(Boolean).slice(0, 3);
  const mood: Record<string, number> = {};
  const rawMood = j.mood && typeof j.mood === 'object' ? (j.mood as Record<string, unknown>) : {};
  for (const d of room.kit.moods) { const n = Math.round(Number(rawMood[d.key])); mood[d.key] = Number.isFinite(n) ? n : 0; }
  const sp: Speech = {
    say, inner: str(j.inner, 60), privateReply: clean(str(j.private_reply, 120), m),
    stance: str(j.stance, 60), plan: str(j.plan, 40), mood,
    follow: !(j.follow === false || j.follow === 'false'), why: str(j.why, 40),
  };
  return whisper ? (sp.privateReply ? sp : null) : (say.length ? sp : null);
}

/** 去掉包着整句的引号和“名字：”前缀 */
function clean(s: string, m?: Mind) {
  let t = unwrapQuotes(s.trim());
  if (m) t = unwrapQuotes(t.replace(new RegExp('^' + escapeRe(m.name) + '\\s*[:：]\\s*'), ''));
  return t.slice(0, 80).trim();
}

// ---------- 私聊 ----------

export function whisper(room: LiveRoom, m: Mind, text: string) {
  message(room, { id: uid('u'), speakerId: 'user', text, kind: 'user', targetId: m.id, private: true });
  m.privates.push({ who: 'user', text });
  room.lastWhisper.set(m.id, text);
  showMind(room, m);
  if (room.whispering.has(m.id)) { room.nextWhisper.set(m.id, text); return; }
  void answerWhisper(room, m, text);
}

/** 私聊：他自己私下回你一句，心思跟着变；导演也知道了（只能通过他来体现） */
async function answerWhisper(room: LiveRoom, m: Mind, text: string) {
  room.whispering.add(m.id);
  if (room.speaking?.m !== m) status(room, m, 'thinking', '想怎么回你…');
  try {
    const sp = await ask(room, m.name, room.opts.temperature, room.whisperCtrl.signal, () => room.kit.actorMessages({
      self: m.p, cfg: room.cfg, temper: m.t, transcript: transcriptText(room), privates: privateText(m),
      state: stateOne(room, m), cue: text, whisper: true,
    }), (t) => parseSpeech(room, t, m, true));
    if (room.stopped) return;
    moodStep(room, m, sp.mood);
    if (sp.stance) m.stance = sp.stance;
    if (sp.plan) m.plan = sp.plan;
    if (sp.inner) m.inner = sp.inner;
    const reply = sp.privateReply || '嗯。';
    m.privates.push({ who: 'self', text: reply });
    message(room, { id: uid('w'), speakerId: m.id, text: reply, kind: 'reply', targetId: 'user', private: true });
    showMind(room, m);
    note(room, `用户私下对${m.name}说「${text}」，${m.name}私下回「${reply}」${sp.plan ? '，打算：' + sp.plan : ''}（只有${m.name}知道，别让别人知道，只能通过${m.name}的言行体现）`);
    // 心思变了：还没说出口的下一句重新排
    bump(room);
  } catch (e) {
    if (room.stopped || isAbort(e)) return;
    room.emit({
      type: 'error', id: uid('err'), agentId: m.id, message: m.name + ' 没接住你的私聊：' + errMsg(e),
      retry: () => { if (!room.stopped) void answerWhisper(room, m, text); },
    });
  } finally {
    room.whispering.delete(m.id);
    if (!room.stopped && room.speaking?.m !== m) rest(room, m);
    const more = room.nextWhisper.get(m.id);
    if (more !== undefined && !room.stopped) { room.nextWhisper.delete(m.id); void answerWhisper(room, m, more); }
  }
}

// ---------- 散场总结 ----------

export async function summarize(room: LiveRoom) {
  const at = room.step;
  try {
    const text = await room.chatFn(room.kit.summaryMessages(room.cfg, logText(room)), {
      temperature: room.opts.summaryTemperature, signal: room.summaryCtrl.signal,
    });
    // 总结期间你又开口了，接着聊，这份总结不要了
    if (room.stopped || !room.finished || room.step !== at) return;
    room.emit({ type: 'result', result: room.kit.parseSummary(text) });
    room.emit({ type: 'session', state: 'finished' });
  } catch (e) {
    if (room.stopped || isAbort(e) || !room.finished) return;
    room.emit({ type: 'session', state: 'finished' });
    room.emit({ type: 'error', id: uid('err'), message: '整理这场聊天时出错：' + errMsg(e), retry: () => void summarize(room) });
  }
}
