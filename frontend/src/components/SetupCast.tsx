import { useEffect, useState } from 'react';
import type { Draft } from '../App';
import type { Persona, SessionConfig, Side } from '../types';
import { sceneById } from '../data/scenes';
import { DEBATE_CHAR_LIMIT, DEBATE_DEFAULT_FORMAT, DEBATE_FORMATS, EMOTION_SEATS, modeById, roundLabel, type DebateFormatId } from '../data/modes';
import { AGENT_COLORS } from '../data/personas';
import { engineFor } from '../engines/registry';
import { playLeave, playSeat } from '../sound';
import { PixelAvatar } from './PixelAvatar';

interface Pick { personalityId: string; side?: Side }

export function SetupCast({ draft, personas, maxMembers, notice, onStart }: {
  draft: Draft;
  personas: Persona[];
  /** 可选的人数上限；辩论的正反方与主持席位另有限制 */
  maxMembers?: number;
  /** 显示在标题右侧的提示 */
  notice?: string;
  onStart: (cfg: SessionConfig) => void;
}) {
  const scene = sceneById(draft.sceneId);
  const mode = draft.mode;
  const isRational = mode === 'rational';
  // 其他场景仍由用户选的模式决定是否分正反方。
  const isDebate = isRational;
  const isProduct = mode === 'product';
  const isEmotion = mode === 'emotion';
  // 辩论最多 7 人（正 3 反 3 主持 1）；情感分析最多 7 位回应风格；其他模式按场景和引擎上限
  const maxSeats = isDebate ? Math.min(7, scene.maxSeats)
    : Math.min(scene.maxSeats, maxMembers ?? scene.maxSeats, isEmotion ? EMOTION_SEATS : Infinity);
  // 人物没写 modes 时所有模式可用；写了就只在对应模式里出现
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [order, setOrder] = useState<string[]>([]);
  const available = personas.filter((p) => !p.modes || p.modes.includes(mode));
  const [lead, setLead] = useState<string | null>(null);
  const [personality, setPersonality] = useState<Record<string, string>>({});
  // 辩论流程固定，只选快辩还是标准
  const [formatId, setFormatId] = useState<DebateFormatId>(DEBATE_DEFAULT_FORMAT);
  const format = DEBATE_FORMATS.find((f) => f.id === formatId) ?? DEBATE_FORMATS[1];
  // 刚入座的卡片播一次落座动画
  const [landed, setLanded] = useState<string | null>(null);

  const sideCount = (s: Side) => order.filter((id) => picked[id]?.side === s).length;
  const nextSide = (): Side | undefined => {
    if (!isDebate) return undefined;
    if (sideCount('pro') <= sideCount('con') && sideCount('pro') < 3) return 'pro';
    if (sideCount('con') < 3) return 'con';
    if (sideCount('host') < 1) return 'host';
    return undefined;
  };

  const toggle = (p: Persona) => {
    if (picked[p.id]) {
      const { [p.id]: _, ...rest } = picked;
      setPicked(rest);
      setOrder(order.filter((x) => x !== p.id));
      if (lead === p.id) setLead(null);
      playLeave();
      return;
    }
    if (order.length >= maxSeats) return;
    const side = nextSide();
    if (isDebate && !side) return;
    setPicked({ ...picked, [p.id]: { personalityId: personality[p.id] ?? p.defaultPersonalityId, side } });
    setOrder([...order, p.id]);
    if (isProduct && !lead) setLead(p.id);
    setLanded(p.id);
    playSeat(order.length);
  };

  const setPer = (p: Persona, id: string) => {
    setPersonality({ ...personality, [p.id]: id });
    if (picked[p.id]) setPicked({ ...picked, [p.id]: { ...picked[p.id], personalityId: id } });
  };

  const setSide = (id: string, side: Side) => {
    const pk = picked[id];
    if (!pk || (pk.side !== side && sideCount(side) >= (side === 'host' ? 1 : 3))) return;
    setPicked({ ...picked, [id]: { ...pk, side } });
  };

  const minCount = isDebate ? 2 : 2;
  const debateOk = !isDebate || (sideCount('pro') >= 1 && sideCount('con') >= 1);
  const canStart = order.length >= minCount && debateOk;
  /** 这档赛制一共几次发言：主持开场一次，每一轮正反方每人一次（最后整理讨论总结） */
  const speeches = (rounds: number) => sideCount('host') + rounds * (sideCount('pro') + sideCount('con'));

  const start = () => {
    // 辩论室：正方占 0-2 号座，反方 3-5 号，主持 6 号
    const used = { pro: 0, con: 0, host: 0 };
    const participants = order.map((id, i) => {
      const persona = personas.find((p) => p.id === id)!;
      const pk = picked[id];
      let seatIndex = i;
      // 辩论室按座位上标的 group 入座（正方蓝桌、反方红桌、主持讲台）；其他场景按顺序坐
      if (isDebate && pk.side && scene.seats.some((s) => s.group)) {
        const seats = scene.seats.map((s, k) => ({ s, k })).filter(({ s }) => s.group === pk.side);
        seatIndex = seats[used[pk.side]]?.k ?? i;
        used[pk.side]++;
      }
      return {
        agentId: id, seatIndex, color: persona.visual.shirt ?? AGENT_COLORS[i % 8],
        side: pk.side, isLead: isProduct ? id === lead : undefined,
        personalityId: pk.personalityId, persona,
      };
    });
    const brief = scene.brief ?? (scene.custom ? scene.description : undefined);
    onStart({
      sessionId: 's-' + Date.now().toString(36),
      mode, sceneId: draft.sceneId,
      // 场景说明（座位分工等）交给引擎：内置场景写在 brief 里，自己添加的场景用描述；其他内置场景的描述是界面文案，不传
      scene: brief ? { name: scene.name, description: brief } : undefined,
      theme: { title: draft.theme.trim() },
      // 娱乐模式不固定轮数：每场随机 7～8 轮，太短不好看
      maxRounds: isRational ? format.rounds : mode === 'entertainment' ? 7 + Math.floor(Math.random() * 2) : modeById(mode).roundLabels.length,
      maxChars: isRational ? DEBATE_CHAR_LIMIT : undefined,
      participants,
      engineOptions: { ...engineFor(mode).defaults },
      createdAt: new Date().toISOString(),
    });
  };

  const sideLabel = { pro: '正方', con: '反方', host: '主持' } as const;

  return (
    <main className="setup cast">
      <section className="panel cast-head">
        <h2><b>04</b> 选择人物 <small>{modeById(mode).name} · {scene.name} · 已选 {order.length}/{maxSeats}
          {isDebate && `（正方 ${sideCount('pro')}/3 · 反方 ${sideCount('con')}/3 · 主持 ${sideCount('host')}/1）`}</small></h2>
        <span className="hint">{notice || (isDebate
          ? '先点「入座」，再用「阵营」选择正方、反方或主持。正反方各最多 3 人，主持最多 1 人。'
          : '想加新人物？到右上角「图鉴」里导入')}</span>
      </section>

      <div className="persona-grid">
        {available.map((p) => {
          const pk = picked[p.id];
          const perId = pk?.personalityId ?? personality[p.id] ?? p.defaultPersonalityId;
          const per = p.personalities.find((x) => x.id === perId) ?? p.personalities[0];
          return (
            <article
              key={p.id}
              className={'persona-card' + (pk ? ' on' : '') + (pk && landed === p.id ? ' landed' : '')}
              style={{ ['--ac' as string]: p.visual.shirt }}
              onAnimationEnd={() => landed === p.id && setLanded(null)}
            >
              <div className="pc-top" onClick={() => toggle(p)}>
                <div className="pc-avatar"><PixelAvatar v={p.visual} size={56} /></div>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.identity}</small>
                </div>
                {pk && <span className="pc-no">{order.indexOf(p.id) + 1}</span>}
              </div>
              <dl>
                <dt>知识</dt><dd>{p.knowledge.join(' / ')}</dd>
                <dt>思想</dt><dd>{p.thinking}</dd>
                <dt>价值</dt><dd>{p.values}</dd>
              </dl>
              <label className="pc-select">
                性格
                <select value={perId} onChange={(e) => setPer(p, e.target.value)}>
                  {p.personalities.map((x) => <option key={x.id} value={x.id}>{x.label}{x.id === p.defaultPersonalityId ? '（默认）' : ''}</option>)}
                </select>
              </label>
              <p className="pc-behavior">▸ {per.behavior}　“{per.style}”</p>
              <div className="pc-actions">
                <button className={'px-btn ' + (pk ? 'danger' : 'primary')} onClick={() => toggle(p)}>{pk ? '移出' : '入座'}</button>
                {pk && isDebate && (
                  <label className="pc-select pc-side-select">
                    阵营
                    <select aria-label={`${p.name}的阵营`} value={pk.side} onChange={(e) => setSide(p.id, e.target.value as Side)}>
                      {(['pro', 'con', 'host'] as const).map((side) => {
                        const full = pk.side !== side && sideCount(side) >= (side === 'host' ? 1 : 3);
                        return <option key={side} value={side} disabled={full}>{sideLabel[side]}{full ? '（已满）' : ''}</option>;
                      })}
                    </select>
                  </label>
                )}
                {pk && isProduct && <button className={'px-btn' + (lead === p.id ? ' lead' : '')} onClick={() => setLead(p.id)}>{lead === p.id ? '★ 负责人' : '设为负责人'}</button>}
              </div>
            </article>
          );
        })}
      </div>

      {isRational && (
        <section className="panel rt-settings">
          <h2><b>05</b> 辩论赛制 <small>流程固定，只选长短；每人每次发言不超过 {DEBATE_CHAR_LIMIT} 字</small></h2>
          <div className="rt-formats" role="radiogroup" aria-label="辩论赛制">
            {DEBATE_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === formatId}
                className={'rt-format' + (f.id === formatId ? ' on' : '')}
                onClick={() => setFormatId(f.id)}
              >
                <b>{f.label}</b>
                <span>{f.note}</span>
                <small>{debateOk ? `按现在的阵容共 ${speeches(f.rounds)} 次发言` : '正反方入座后估算发言次数'}</small>
              </button>
            ))}
          </div>
          <ol className="rt-flow">
            {Array.from({ length: format.rounds }, (_, i) => (
              <li key={i}><i>{i + 1}</i>{roundLabel('rational', i + 1, format.rounds)}</li>
            ))}
          </ol>
          <p className="hint">主持开场宣布辩题和双方持方 → 两方交替立论 → 交锋轮里双方互相质询、被问的一方必须正面作答 → 反方先、正方最后总结陈词 → 赛后整理双方观点、共识和待澄清问题。</p>
        </section>
      )}

      <footer className="setup-foot">
        <span>「{draft.theme}」{isRational && ` · ${format.label}（${format.note}）· 每次 ≤${DEBATE_CHAR_LIMIT} 字`}{!debateOk && ' · 辩论需要正反方各至少 1 人'}</span>
        <button className="px-btn primary" disabled={!canStart} onClick={start}>进入对话 ▶</button>
      </footer>
    </main>
  );
}
