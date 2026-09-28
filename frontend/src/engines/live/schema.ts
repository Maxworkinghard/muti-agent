import type { Participant } from '../../types';
import { readReactions, REACT_KINDS, type MoodDef } from './types';

/**
 * 导演和演员输出里由底盘解析的那几个字段（engine.ts 的 parseCue / parseSpeech）怎么写。
 * 各模式共用这一份说明，只在自己的 prompt.ts 里加规则和例子，免得各写各的对不上。
 */

/** 导演输出里的候选：JSON 示例片段 */
export function candidatesExample(a: string, b: string) {
  return '"candidates": [{"speaker": "' + a + '", "to": "' + b + '", "gist": "", "emotion": "", "reply_to": "", "interrupt": false, "cut_after": ""}]';
}

/** 导演输出里的候选：字段说明 */
export const CANDIDATES_DOC = [
  '- candidates：这一步可能接话的人，一般给 2~3 个（明摆着只该某一个人说时才给 1 个），你最想让谁说就排第一。谁真的开口由现场定（各人此刻有多想说：话多不多、情绪多热、是不是冲他来的、刚说完没有），所以每个候选都得是此刻说得通的人；没人该说话时给 []。',
  '  每个候选：speaker 写名字；to 冲谁说（名字、“用户”或留空）；gist 是话头——这句大概往哪说，十几个字就够，不是台词，演员会按自己的人设决定怎么说，也可能不照你的来；emotion 建议的情绪，几个字；reply_to 接的是哪条消息的编号；interrupt / cut_after 见插嘴规则。',
].join('\n');

/** 导演输出里的小反应：导演只定谁、哪一种，说什么由这个人自己的习惯决定 */
export const REACT_DOC = '- react：[{"who": "名字", "kind": "笑"}]，旁人顺口的小反应，不占发言；kind 只能是'
  + REACT_KINDS.join('、') + '之一，而且只用这个人会的种类（见【在场的人】里的“小反应”），具体说什么由他自己的习惯决定；没有就 []。';

/** 【在场的人】里写这个人会的小反应，比如“小反应：附和（确实）、笑（笑死）” */
export function reactionWords(p: Participant) {
  const r = readReactions(p);
  const kinds = Object.keys(r);
  return kinds.length ? '小反应：' + kinds.map((k) => k + '（' + r[k][0] + '）').join('、') : '';
}

/** 演员的输出格式：说出口的话，加上他自己的心思（看法、打算、心情），以及这句有没有照导演的建议说 */
export function actorSchema(moods: MoodDef[], whisper: boolean) {
  const mood = '{' + moods.map((d) => '"' + d.key + '": 0').join(', ') + '}';
  if (whisper) {
    return [
      '只输出一个 JSON 对象，不要任何别的文字：',
      '{"private_reply": "", "inner": "", "stance": "", "plan": "", "mood": ' + mood + '}',
      '- private_reply：你私下回用户的一句话，口语、很短。',
      '- inner：你心里的真实反应，一句话。',
      '- stance：听完这句你对这件事的看法变了就写一句，没变留空。',
      '- plan：听完这句你接下来打算干嘛，一句话（没变就留空）。',
      '- mood：听完这句你各种情绪变了多少，-2 到 2 的整数。',
    ].join('\n');
  }
  return [
    '只输出一个 JSON 对象，不要任何别的文字：',
    '{"say": [], "inner": "", "stance": "", "plan": "", "mood": ' + mood + ', "follow": true, "why": ""}',
    '- say：你说出口的话，1~3 条短消息（想说的多就拆成几条）。',
    '- inner：你说这句时心里的真实想法，一句话，别人看不到。',
    '- stance：你对这件事的真实看法，一句话；还没表过态或者看法变了才写，和之前一样就留空（多数时候留空）。',
    '- plan：你接下来打算干嘛，一句话（可以和嘴上说的不一样）；没变就留空。',
    '- mood：说完这句你自己各种情绪变了多少，-2 到 2 的整数，没变写 0。',
    '- follow：这句是不是顺着导演的建议说的；是就写 true、why 留空；不是就写 false，why 用一句话说为什么（比如“这不像我会说的话”“我现在没那个心情”）。',
  ].join('\n');
}
