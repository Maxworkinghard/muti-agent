import type { ChatMessage, DiscussionResult, MindView, Participant } from '../types';
import { PixelAvatar } from './PixelAvatar';
import type { Status } from './discussionUtils';

export function Line({ m, byId }: { m: ChatMessage; byId: Record<string, Participant> }) {
  if (m.kind === 'notice') return <div className="line notice"><p>⚠ {m.text}</p></div>;
  if (m.kind === 'react') {
    const p = byId[m.speakerId];
    return p ? <div className="line react" style={{ ['--ac' as string]: p.color }}><b>{p.persona.name}</b><span>{m.text}</span></div> : null;
  }
  if (m.speakerId === 'user') {
    const to = m.targetId ? byId[m.targetId]?.persona.name : '全体';
    return (
      <div className={'line user' + (m.private ? ' private' : '')}>
        <div className="who">你 → {to}{m.private && <i>私聊</i>}</div><p>{m.text}</p>
      </div>
    );
  }
  const p = byId[m.speakerId];
  if (!p) return null;
  return (
    <div className={'line ' + m.kind + (m.doc ? ' doc' : '') + (m.private ? ' private' : '') + (m.cut ? ' cut' : '')} style={{ ['--ac' as string]: p.color }}>
      <span className="l-avatar"><PixelAvatar v={p.persona.visual} size={28} /></span>
      <div>
        <div className="who">
          {p.persona.name}{m.targetId && m.targetId !== 'user' && byId[m.targetId] && <> → {byId[m.targetId].persona.name}</>}{m.tag && <em className="line-tag">{m.tag}</em>}{m.cut && <em className="line-tag">被打断</em>}
          {m.kind === 'reply' && <i>{m.private ? '私下回复你' : '回复你'}</i>}
        </div>
        {m.quote && <div className="quote">↪ {m.quote.name}：{m.quote.text}</div>}
        <p>{m.text}</p>
      </div>
    </div>
  );
}

/** 点开某个人时看到的内心：情绪、态度、打算、心里话、对谁有意见 */
export function MindPanel({ mind }: { mind: MindView }) {
  return (
    <div className="mind-panel">
      <div className="mood-bars">
        {mind.mood.map((x) => (
          <span key={x.key} className="mood-bar" style={{ ['--mc' as string]: x.color }}>
            {x.key}<i><b style={{ width: x.value * 10 + '%' }} /></i>{Math.round(x.value)}
          </span>
        ))}
      </div>
      <dl>
        <dt>心情</dt><dd>{mind.emoji} {mind.label}</dd>
        {mind.style && <><dt>说话</dt><dd>{mind.style}</dd></>}
        {mind.stance && <><dt>态度</dt><dd>{mind.stance}</dd></>}
        {mind.plan && <><dt>打算</dt><dd>{mind.plan}</dd></>}
        {mind.inner && <><dt>心里</dt><dd>{mind.inner}</dd></>}
        {mind.toward.length > 0 && (
          <><dt>对人</dt><dd>{mind.toward.map((t) => (
            <span key={t.id} className={'rel ' + (t.value > 0 ? 'good' : 'bad')}>{t.name} {t.value > 0 ? '+' : ''}{t.value}</span>
          ))}</dd></>
        )}
        {mind.whisper && <><dt>你说过</dt><dd className="whisper">“{mind.whisper}”</dd></>}
      </dl>
    </div>
  );
}

export function PersonaStrip({ p, status }: { p: Participant; status?: Status }) {
  const per = p.persona.personalities.find((x) => x.id === p.personalityId);
  return (
    <div className="persona-strip" style={{ ['--ac' as string]: p.color }}>
      <PixelAvatar v={p.persona.visual} size={36} />
      <div>
        <b>{p.persona.identity}</b>
        <small>性格：{per?.label} · 知识：{p.persona.knowledge.join('/')} · 当前：{status?.action ?? '就座'}</small>
      </div>
    </div>
  );
}

export function ResultCard({ r, live }: { r: DiscussionResult; live?: boolean }) {
  const sec: Array<[string, string[] | undefined, string]> = [
    ['共识', r.consensus, 'green'], ['分歧', r.disagreements, 'orange'],
    ['待验证', r.openQuestions, 'blue'], ['建议', r.suggestions, 'purple'], ['交付物', r.deliverables, 'yellow'],
  ];
  return (
    <div className="result">
      <div className="round-sep">讨论结果</div>
      {r.summary && <div className="res res-blue"><b>{live ? '这场聊下来' : '讨论总结'}</b><p className="summary-text">{r.summary}</p></div>}
      {sec.filter(([, v]) => v?.length).map(([k, v, c]) => (
        <div key={k} className={'res res-' + c}><b>{k}</b><ul>{v!.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
    </div>
  );
}
