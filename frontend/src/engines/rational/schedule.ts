import type { Participant, SessionConfig } from '../../types';
import { roundLabel } from '../../data/modes';

export interface DebateTurn {
  speaker: Participant;
  target?: Participant;
  round: number;
  stage: string;
  tag: string;
  task: string;
}

const sideName = (p: Participant) => p.side === 'pro' ? '正方' : p.side === 'con' ? '反方' : '主持人';

function role(team: Participant[], p: Participant): string {
  const i = team.indexOf(p);
  if (team.length === 1) return '一辩';
  if (team.length === 2) return i === 0 ? '一辩' : '三辩';
  return ['一辩', '二辩', '三辩'][i] ?? '辩手';
}

/** 只固定辩论的轮次与双方出场机会，具体论点和回应由本模式的导演现场决定。 */
export function debateSchedule(cfg: SessionConfig): DebateTurn[] {
  const pro = cfg.participants.filter((p) => p.side === 'pro');
  const con = cfg.participants.filter((p) => p.side === 'con');
  const host = cfg.participants.find((p) => p.side === 'host');
  if (!pro.length || !con.length) throw new Error('辩论需要正方、反方各至少一人');
  const total = Math.min(6, Math.max(2, Math.round(cfg.maxRounds)));
  const turns: DebateTurn[] = [];
  const add = (speaker: Participant, round: number, stage: string, task: string, target?: Participant) => turns.push({
    speaker, target, round, stage: roundLabel('rational', round, total),
    tag: speaker.side === 'host' ? '主持人 · ' + stage : sideName(speaker) + role(speaker.side === 'pro' ? pro : con, speaker) + ' · ' + stage,
    task,
  });
  if (host) add(host, 1, '开场', '宣布辩题与双方持方，保持中立，不替任何一方立论');

  const conFirst = (cfg.conversationVariation?.speakerIndex ?? 0) % 2 === 1;
  for (let round = 1; round <= total; round++) {
    if (round === total) {
      for (const p of con) add(p, round, '总结', '收束反方最有力的论证，正面回答尚未答好的质询，指出正方推理的关键缺口', pro[0]);
      for (const p of pro) add(p, round, '总结', '收束正方最有力的论证，正面回答尚未答好的质询，指出反方推理的关键缺口', con[0]);
      continue;
    }
    const sides = (round - 1 + Number(conFirst)) % 2 ? [con, pro] : [pro, con];
    for (let i = 0; i < Math.max(pro.length, con.length); i++) {
      for (const team of sides) {
        const speaker = team[i];
        if (!speaker) continue;
        const rivals = team === pro ? con : pro;
        const target = rivals[i % rivals.length];
        add(speaker, round, round === 1 ? '立论' : '交锋', round === 1
          ? '陈述本方立场与一个有根据的核心论点；如果对方已经开口，接住其具体说法'
          : `先回答对方最近一个具体质询，再向${target.persona.name}提出一个可回答的问题`, target);
      }
    }
  }
  return turns;
}
