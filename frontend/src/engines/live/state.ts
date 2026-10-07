/**
 * 事件发射与状态管理（记账）：界面事件（status / mind / message / round / error）、
 * 导演安排的账（情绪限速、说话状态、好恶、全场阶段）、用户发言的记录。
 * 所有函数都以 LiveRoom 为第一个参数，行为与原 LiveRoom 上的私有方法一致。
 */
import type { AgentState, ChatMessage } from '../../types';
import { cool, feel, like, moodLabel, view, type Mind } from './mind';
import type { Cue, Line, Speech } from './types';
import { clamp, errMsg, escapeRe, STEP_MOOD, STEP_MOOD_MAX, uid } from './util';
import type { LiveRoom } from './engine';

export function rest(room: LiveRoom, m: Mind) {
  status(room, m, room.finished ? 'done' : 'idle', moodLabel(m, room.kit.moods));
}

export function status(room: LiveRoom, m: Mind, state: AgentState, action: string) {
  const key = state + '|' + action;
  if (room.shownStatus.get(m.id) === key) return;
  room.shownStatus.set(m.id, key);
  room.emit({ type: 'status', agentId: m.id, state, action });
}

export function showMind(room: LiveRoom, m: Mind) {
  room.emit({ type: 'mind', agentId: m.id, mind: view(m, room.kit.moods, (id) => room.nameOf(id), room.lastWhisper.get(m.id)) });
}

export function message(room: LiveRoom, m: Omit<ChatMessage, 'round' | 'at'>) {
  room.emit({ type: 'message', message: { ...m, round: room.round, at: Date.now() } });
}

export function note(room: LiveRoom, text: string) {
  room.events.push({ step: room.step, text });
  if (room.events.length > 20) room.events.shift();
}

/** 记录或心思变了：准备到一半的下一句作废 */
export function bump(room: LiveRoom) {
  room.ver++;
  room.signal.notify();
}

function newRound(room: LiveRoom, label: string) {
  room.round++;
  room.roundStep = room.step;
  room.roundLabel = label;
  room.emit({ type: 'round', round: room.round, label });
}

/**
 * 照导演的安排记账：旁人的情绪（限速）、说话状态、好恶、全场走到哪。
 * 说话的人自己报了心情（ownMood）就用他自己的，导演给他的那份不算；态度和打算导演不管
 */
export function apply(room: LiveRoom, cue: Cue, speaker: Mind | null, ownMood?: Record<string, number>) {
  const touched = new Set<Mind>();
  for (const [id, delta] of Object.entries(cue.mood)) {
    const m = room.minds.get(id);
    if (!m || (ownMood && m === speaker)) continue;
    moodStep(room, m, delta);
    touched.add(m);
  }
  for (const [id, v] of Object.entries(cue.style)) {
    const m = room.minds.get(id);
    if (!m) continue;
    m.style = v;
    m.styleAt = room.step;
    touched.add(m);
  }
  for (const [id, map] of Object.entries(cue.toward)) {
    const m = room.minds.get(id);
    if (!m) continue;
    for (const [other, d] of Object.entries(map)) if (other !== id) like(m, other, d);
    touched.add(m);
  }
  for (const m of touched) { showMind(room, m); if (m !== speaker && room.speaking?.m !== m) rest(room, m); }
  // 导演的安排只在幕后：界面上只看得到话题换了（分步的模式还看得到走到了哪一步）
  if (cue.topic && room.step - room.roundStep >= 6) newRound(room, '换话题 · ' + cue.topic);
  // 新的一步从有人开口算起：冷场那一步不推进，免得还在等你回答就被当成走到了最后一步
  if (cue.arc) { room.arc = cue.arc; if (speaker) advanceStage(room, cue.arc); }
  if (cue.arcNote) room.arcNote = cue.arcNote;
}

/** 记一步情绪：每种最多 ±STEP_MOOD，按性情放大后这一步最多变 STEP_MOOD_MAX */
export function moodStep(room: LiveRoom, m: Mind, delta: Record<string, number>) {
  const before = { ...m.mood };
  const raw: Record<string, number> = {};
  for (const [k, v] of Object.entries(delta)) raw[k] = clamp(v, -STEP_MOOD, STEP_MOOD);
  feel(m, raw, room.kit.moods);
  for (const d of room.kit.moods) m.mood[d.key] = clamp(m.mood[d.key], before[d.key] - STEP_MOOD_MAX, before[d.key] + STEP_MOOD_MAX);
}

/** 演员自己报的：对这件事的看法、打算、说完这句的心情；没照导演的建议说，就把他的理由告诉导演 */
export function own(room: LiveRoom, m: Mind, sp?: Speech) {
  if (!sp) return;
  if (sp.stance) m.stance = sp.stance;
  if (sp.plan) m.plan = sp.plan;
  moodStep(room, m, sp.mood);
  if (!sp.follow) note(room, `${m.name}没照你的建议说${sp.why ? '：' + sp.why : ''}（以他实际说的为准）`);
}

/** 分步的模式：导演说走到了后面的步骤，就开一段新的；只往前走，不回头 */
function advanceStage(room: LiveRoom, arc: string) {
  const stages = room.kit.stages;
  if (!stages?.length) return;
  const i = stages.findIndex((s) => arc.includes(s) || (arc.length >= 2 && s.includes(arc)));
  if (i <= room.stage) return;
  room.stage = i;
  room.stageStep = room.step;
  newRound(room, stages[i]);
}

/** 没有分步，或者已经走到最后一步：可以散场了 */
export function lastStage(room: LiveRoom) {
  const n = room.kit.stages?.length ?? 0;
  return n === 0 || room.stage >= n - 1;
}

/** 两次都失败：停下来，等你点重试 */
export function raise(room: LiveRoom, e: unknown) {
  room.hold = true;
  for (const m of room.minds.values()) if (room.speaking?.m !== m) rest(room, m);
  room.emit({
    type: 'error', id: uid('err'), message: '没接上话：' + errMsg(e),
    retry: () => {
      if (room.stopped) return;
      room.hold = false;
      room.retried = false;
      room.pending = null;
      room.signal.notify();
    },
  });
}

/**
 * 小反应说什么：从这个人会的那一种里挑一句，避开他最近用过的；他不会这种反应就不出声。
 * 人物文件没写小反应（比如导入的人物）时，用导演写的原话
 */
export function reactText(m: Mind, kind: string, text: string) {
  const all = Object.values(m.reactions).flat();
  if (!all.length) return text;
  const list = m.reactions[kind] ?? (all.includes(text) ? [text] : []);
  const fresh = list.filter((s) => !m.recentReacts.includes(s));
  const pool = fresh.length ? fresh : list;
  const out = pool[Math.floor(Math.random() * pool.length)] ?? '';
  if (out) {
    m.recentReacts.push(out);
    if (m.recentReacts.length > 3) m.recentReacts.shift();
  }
  return out;
}

export function mentionsIn(room: LiveRoom, text: string) {
  const out = new Set<string>();
  for (const m of room.minds.values()) {
    if (text.includes('@' + m.name) || new RegExp('^' + escapeRe(m.name) + '[，,：: ]').test(text)) out.add(m.id);
  }
  return out;
}

export function addUserLine(room: LiveRoom, text: string, show: boolean, targets = new Set<string>()) {
  const line: Line = { id: 'm' + ++room.lineNo, msgId: uid('u'), speaker: 'user', name: '用户', text, kind: 'user' };
  room.lines.push(line);
  if (show) message(room, { id: line.msgId, speakerId: 'user', text, kind: 'user' });
  room.step++;
  room.mentioned = targets;
  room.userWaiting = true;
  room.silence = 0;
  room.idle = false;
  if (room.speaking) room.userSpoke = true;
  for (const m of room.minds.values()) { cool(m, room.kit.moods); showMind(room, m); }
  bump(room);
}
