import { useState } from 'react';
import type { Draft } from '../App';
import type { Persona, SessionConfig, Side } from '../types';
import { SCENES } from '../data/scenes';
import { FLOW_HINT, modeById, roleName } from '../data/modes';
import { AGENT_COLORS } from '../data/personas';
import { PixelAvatar } from './PixelAvatar';

interface Pick { personalityId: string; side?: Side }

export function SetupCast({ draft, personas, onBack, onStart }: {
  draft: Draft;
  personas: Persona[];
  onBack: () => void;
  onStart: (cfg: SessionConfig) => void;
}) {
  const scene = SCENES[draft.sceneId];
  const mode = modeById(draft.mode);
  const isDebate = draft.sceneId === 'debate';
  // 通用的工作流程由用户指定负责人；总控 / 主 Agent 的流程里负责人固定是它
  const pickLead = mode.flow === 'work';
  // 人物没写 modes 时所有模式可用；写了就只在对应模式里出现
  const available = personas.filter((p) => !p.modes || p.modes.includes(draft.mode));
  /** 人物在这个模式流程里的固定角色；模式用不到的角色不算 */
  const roleOf = (p: Persona) => (mode.roles?.some((r) => r.id === p.role) ? p.role : undefined);
  const isLocked = (p: Persona) => !!mode.roles?.find((r) => r.id === roleOf(p))?.required;
  // 流程必需的角色一进来就入座，不能移出
  const [picked, setPicked] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(available.filter(isLocked).map((p) => [p.id, { personalityId: p.defaultPersonalityId }])));
  const [order, setOrder] = useState<string[]>(() => available.filter(isLocked).map((p) => p.id));
  const missing = mode.roles?.filter((r) => r.required && !available.some((p) => roleOf(p) === r.id)) ?? [];
  const [lead, setLead] = useState<string | null>(null);
  const [personality, setPersonality] = useState<Record<string, string>>({});

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
      if (isLocked(p)) return;
      const { [p.id]: _, ...rest } = picked;
      setPicked(rest);
      setOrder(order.filter((x) => x !== p.id));
      if (lead === p.id) setLead(null);
      return;
    }
    if (order.length >= scene.maxSeats) return;
    const side = nextSide();
    if (isDebate && !side) return;
    setPicked({ ...picked, [p.id]: { personalityId: personality[p.id] ?? p.defaultPersonalityId, side } });
    setOrder([...order, p.id]);
    // 第一个入座的人先当负责人，可以再改
    if (pickLead && !lead) setLead(p.id);
  };

  const setPer = (p: Persona, id: string) => {
    setPersonality({ ...personality, [p.id]: id });
    if (picked[p.id]) setPicked({ ...picked, [p.id]: { ...picked[p.id], personalityId: id } });
  };

  const cycleSide = (id: string) => {
    const sides: Side[] = ['pro', 'con', 'host'];
    const cur = picked[id].side ?? 'pro';
    for (let k = 1; k <= 3; k++) {
      const s = sides[(sides.indexOf(cur) + k) % 3];
      const limit = s === 'host' ? 1 : 3;
      if (s === cur || sideCount(s) < limit) { setPicked({ ...picked, [id]: { ...picked[id], side: s } }); return; }
    }
  };

  const minCount = isDebate ? 2 : 2;
  const debateOk = !isDebate || (sideCount('pro') >= 1 && sideCount('con') >= 1);
  const canStart = order.length >= minCount && debateOk && missing.length === 0;

  const start = () => {
    // 辩论室：正方占 0-2 号座，反方 3-5 号，主持 6 号
    const used = { pro: 0, con: 0, host: 0 };
    const participants = order.map((id, i) => {
      const persona = personas.find((p) => p.id === id)!;
      const pk = picked[id];
      let seatIndex = i;
      if (isDebate && pk.side) { seatIndex = pk.side === 'pro' ? used.pro : pk.side === 'con' ? 3 + used.con : 6; used[pk.side]++; }
      return {
        agentId: id, seatIndex, color: persona.visual.shirt ?? AGENT_COLORS[i % 8],
        side: pk.side, isLead: pickLead ? id === lead : roleOf(persona) === 'coordinator' || undefined,
        role: roleOf(persona), personalityId: pk.personalityId, persona,
      };
    });
    onStart({
      sessionId: 's-' + Date.now().toString(36),
      mode: draft.mode, sceneId: draft.sceneId,
      theme: { title: draft.theme.trim() },
      maxRounds: mode.roundLabels.length,
      participants,
      createdAt: new Date().toISOString(),
    });
  };

  const sideLabel = { pro: '正方', con: '反方', host: '主持' } as const;

  return (
    <main className="setup cast">
      <section className="panel cast-head">
        <h2><b>04</b> 选择人物 <small>{scene.name} · 已选 {order.length}/{scene.maxSeats}
          {isDebate && `（正方 ${sideCount('pro')}/3 · 反方 ${sideCount('con')}/3 · 主持 ${sideCount('host')}/1）`}</small></h2>
        <span className="hint">想加新人物？到右上角「图鉴」里导入</span>
        {FLOW_HINT[mode.flow] && <p className="flow-hint">{FLOW_HINT[mode.flow]}</p>}
      </section>

      <div className="persona-grid">
        {available.map((p) => {
          const pk = picked[p.id];
          const perId = pk?.personalityId ?? personality[p.id] ?? p.defaultPersonalityId;
          const per = p.personalities.find((x) => x.id === perId) ?? p.personalities[0];
          // 入座后标出在流程里的位置：固定角色、总控点名的候选、流水线之外的评审
          const badge = roleName(mode, roleOf(p)) ?? (mode.flow === 'dispatch' ? '候选' : mode.flow === 'pipeline' ? '评审' : undefined);
          return (
            <article key={p.id} className={'persona-card' + (pk ? ' on' : '')} style={{ ['--ac' as string]: p.visual.shirt }}>
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
              <p className="pc-behavior">▸ {per.behavior}{per.style && `　“${per.style}”`}</p>
              {p.systemPrompt && (
                <details className="pc-source">
                  <summary>人格文件 · {p.sourceFile}</summary>
                  <pre>{p.systemPrompt}</pre>
                </details>
              )}
              <div className="pc-actions">
                {isLocked(p)
                  ? <button className="px-btn" disabled title="这个角色是流程必需的">固定在座</button>
                  : <button className={'px-btn ' + (pk ? 'danger' : 'primary')} onClick={() => toggle(p)}>{pk ? '移出' : '入座'}</button>}
                {pk && isDebate && <button className={'px-btn side-' + pk.side} onClick={() => cycleSide(p.id)}>{sideLabel[pk.side!]} ⇄</button>}
                {pk && pickLead && <button className={'px-btn' + (lead === p.id ? ' lead' : '')} onClick={() => setLead(p.id)}>{lead === p.id ? '★ 负责人' : '设为负责人'}</button>}
                {pk && badge && <span className={'pc-role' + (roleOf(p) === 'coordinator' ? ' lead' : '')}>{roleOf(p) === 'coordinator' && '★ '}{badge}</span>}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="setup-foot">
        <button className="px-btn" onClick={onBack}>◀ 返回</button>
        <span>
          {draft.theme.trim() ? `「${draft.theme.trim()}」` : '主题会按你的第一句话自动生成'}
          {!debateOk && ' · 辩论需要正反方各至少 1 人'}
          {missing.length > 0 && ` · 缺少流程必需的角色：${missing.map((r) => r.name).join('、')}`}
        </span>
        <button className="px-btn primary" disabled={!canStart} onClick={start}>进入对话 ▶</button>
      </footer>
    </main>
  );
}
