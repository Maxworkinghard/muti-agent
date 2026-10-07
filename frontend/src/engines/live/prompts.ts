/**
 * 给模型看的材料：把房间里的账（记录、私聊、心情、关系、阶段、刚发生的事）
 * 拼成导演和演员提示词里用的文本。所有函数都以 LiveRoom 为第一个参数。
 */
import { openingDirection } from '../../data/conversationVariation';
import { moodWords, relationWord, type Mind } from './mind';
import { firstSpeaker } from './director';
import { lastStage } from './state';
import { clip } from './util';
import type { Cue } from './types';
import type { LiveRoom } from './engine';

export function transcriptText(room: LiveRoom) {
  const recent = room.lines.slice(-60);
  if (!recent.length) return '（还没人说话）';
  let prev = '';
  return recent.map((l) => {
    if (l.kind === 'react') return `（${l.name} 小声：${l.text}）`;
    const reply = l.replyTo && l.replyTo !== prev ? `（回 ${l.replyTo}）` : '';
    const target = l.to ? `（冲${room.nameOf(l.to)}）` : '';
    const how = l.interrupt ? '（插嘴）' : '';
    const cut = l.cutBy ? `（话没说完，被${l.cutBy}打断）` : '';
    prev = l.id;
    return `[${l.id}] ${l.name}${reply}${target}${how}：${l.text}${cut}`;
  }).join('\n');
}

export function privateText(m: Mind) {
  return m.privates.slice(-12).map((x) => (x.who === 'user' ? '用户：' : '你：') + x.text).join('\n');
}

function relText(room: LiveRoom, m: Mind) {
  return Object.entries(m.rel)
    .filter(([, v]) => Math.abs(v) >= 2)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([id, v]) => {
      const w = relationWord(v);
      return `${room.nameOf(id)} ${v > 0 ? '+' : ''}${Math.round(v)}${w ? '（' + w + '）' : ''}`;
    }).join('；');
}

function since(room: LiveRoom, m: Mind) {
  if (m.lastSpoke < 0) return '还没开过口';
  const n = room.step - m.lastSpoke;
  return n === 0 ? '最新那段是他说的' : `${n} 次发言前说过话`;
}

/** 给导演看的账：每个人一行 */
export function stateAll(room: LiveRoom) {
  return [...room.minds.values()].map((m) => {
    const parts = ['心情 ' + moodWords(m, room.kit.moods)];
    parts.push('说话状态：' + (m.style || '平常'));
    if (m.stance) parts.push('态度：' + m.stance);
    if (m.plan) parts.push('打算：' + m.plan);
    const rel = relText(room, m);
    if (rel) parts.push('对人：' + rel);
    if (m.cutoff) parts.push(`刚被${m.cutoff.by}打断，没说完：「${clip(m.cutoff.rest, 20)}」`);
    parts.push(since(room, m));
    return `- ${m.name}：${parts.join('｜')}`;
  }).join('\n');
}

/** 给演员看的自己的账 */
export function stateOne(room: LiveRoom, m: Mind, cue?: Cue) {
  const out = ['- 心情：' + moodWords(m, room.kit.moods)];
  const rel = relText(room, m);
  if (rel) out.push('- 对人：' + rel);
  out.push('- 你对这个话题的态度：' + (m.stance || '还没想好'));
  if (m.plan) out.push('- 你正打算：' + m.plan);
  if (m.inner) out.push('- 你上一刻心里想：' + m.inner);
  const style = cue?.style[m.id] ?? m.style;
  if (style) out.push('- 你现在的说话状态：' + style);
  if (m.cutoff) out.push(`- 你刚才的话被${m.cutoff.by}打断了，没说完的是：「${m.cutoff.rest}」`);
  return out.join('\n');
}

export function arcText(room: LiveRoom) {
  const stages = room.kit.stages;
  const where = stages?.length
    ? `现在在第 ${room.stage + 1}/${stages.length} 步「${stages[room.stage]}」，这一步已经 ${room.step - room.stageStep} 次发言（顺序：${stages.join(' → ')}）`
    : `全场现在：${room.arc}`;
  return `${where}。你上一步的打算：${room.arcNote || '（还没有）'}`;
}

export function nowText(room: LiveRoom) {
  const out: string[] = [];
  if (room.step <= 1) out.push('刚开聊，用户开了个头。提名第一句的候选；需要的话可以给人定下说话状态。');
  if (room.step <= 1) {
    const direction = openingDirection(room.cfg.mode, room.cfg.conversationVariation);
    if (direction) out.push('这场先从这里切入：' + direction + '后续仍要顺着现场自然发展，不要反复强调这个切入点。');
    const first = firstSpeaker(room);
    if (first) out.push('开场先让' + first.name + '接用户的话，其他人随后自然加入。');
  }
  const last = room.lastFloor();
  if (last) {
    const who = last.speaker === 'user' ? '用户' : last.name;
    const talking = room.speaking && room.speaking.lines.includes(last);
    out.push(`最新一句是 [${last.id}] ${who}说的${talking ? '（他话还没说完；要提名人插嘴，就在那个候选里写 interrupt 和 cut_after）' : ''}。`);
  }
  const recent = room.events.filter((e) => e.step >= room.step - 3).map((e) => '- ' + e.text);
  if (recent.length) out.push('刚发生的事：\n' + recent.join('\n'));
  if (room.userWaiting) {
    const named = [...room.mentioned].map((id) => room.nameOf(id));
    out.push('用户的话还没人接，候选里得有冲用户说的人' + (named.length ? `；他点名了${named.join('、')}，被点名的人一定先接，把他排进候选。` : '。'));
  }
  const quiet = [...room.minds.values()]
    .filter((x) => (x.lastSpoke < 0 ? room.step >= 6 : room.step - x.lastSpoke >= 6))
    .map((x) => x.name);
  if (quiet.length) out.push('一直没怎么吭声的：' + quiet.join('、') + '。');
  if (room.budget - room.step <= 5) {
    const stages = room.kit.stages;
    out.push(lastStage(room)
      ? '聊了挺久了，快到尾声，可以往收尾走；差不多了就 end=true。'
      : `聊了挺久了，快到尾声，还没走到「${stages![stages!.length - 1]}」，该往那走了；走到了再 end=true。`);
  }
  out.push('谁开口是从你的候选里按各人此刻的冲动抽的，演员也可能不照你的话头说；以记录为准，据此调整。');
  return out.join('\n');
}

/** 导演给演员的这一步建议：合他的人设和此刻的心思就顺着说，不合他可以不照着来 */
export function cueText(room: LiveRoom, m: Mind, cue: Cue) {
  const out = ['导演给你的建议（只有你看得到；合你的人设和此刻的心思就顺着说，不合就按你自己会怎么说来）：'];
  if (cue.to) out.push('- 冲' + room.nameOf(cue.to) + '说' + (cue.to === 'user' && room.userWaiting ? '（用户在等人接他的话）' : ''));
  if (cue.gist) out.push('- 话头：' + cue.gist);
  if (cue.emotion) out.push('- 情绪：' + cue.emotion);
  const style = cue.style[m.id] ?? m.style;
  if (style) out.push('- 说话状态：' + style);
  if (cue.interrupt && room.speaking && room.speaking.m !== m) {
    out.push(`- 你是插嘴：${room.speaking.m.name}正说着${cue.cutAfter ? '，说到「' + cue.cutAfter + '」你就忍不住打断了，只接这之前听到的内容' : '，你忍不住打断了'}`);
  }
  return out.join('\n');
}

export function logText(room: LiveRoom) {
  return room.lines.map((l) => (l.kind === 'react' ? `（${l.name} 小声：${l.text}）` : `${l.name}：${l.text}`)).join('\n');
}
