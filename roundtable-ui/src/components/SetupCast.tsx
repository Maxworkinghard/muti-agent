import { useRef, useState } from 'react';
import type { Draft } from '../App';
import type { Persona, SessionConfig, Side } from '../types';
import { SCENES } from '../data/scenes';
import { modeById } from '../data/modes';
import { AGENT_COLORS, LIBRARY_ISSUES, checkPersona, type PersonaCheck } from '../data/personas';
import { engineFor } from '../engines/registry';
import { PixelAvatar } from './PixelAvatar';

interface Pick { personalityId: string; side?: Side }

export function SetupCast({ draft, personas, onImport, onBack, onStart }: {
  draft: Draft;
  personas: Persona[];
  onImport: (list: Persona[]) => void;
  onBack: () => void;
  onStart: (cfg: SessionConfig) => void;
}) {
  const scene = SCENES[draft.sceneId];
  const isDebate = draft.sceneId === 'debate';
  const isProduct = draft.mode === 'product';
  // 人物没写 modes 时所有模式可用；写了就只在对应模式里出现
  const available = personas.filter((p) => !p.modes || p.modes.includes(draft.mode));
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [lead, setLead] = useState<string | null>(null);
  const [personality, setPersonality] = useState<Record<string, string>>({});
  const [importMsg, setImportMsg] = useState('');
  // 导入和人物库里有错误或提醒的文件，逐条列出来
  const [checks, setChecks] = useState<PersonaCheck[]>(LIBRARY_ISSUES);
  const [showChecks, setShowChecks] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      return;
    }
    if (order.length >= scene.maxSeats) return;
    const side = nextSide();
    if (isDebate && !side) return;
    setPicked({ ...picked, [p.id]: { personalityId: personality[p.id] ?? p.defaultPersonalityId, side } });
    setOrder([...order, p.id]);
    if (isProduct && !lead) setLead(p.id);
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

  const onFile = async (f: File) => {
    let data: unknown;
    try {
      data = JSON.parse((await f.text()).replace(/^\uFEFF/, ''));
    } catch (e) {
      setImportMsg('导入失败：' + f.name + ' 不是合法的 JSON');
      setChecks([{ source: f.name, errors: ['JSON 格式错误：' + (e as Error).message], warnings: [] }]);
      setShowChecks(true);
      return;
    }
    const arr = Array.isArray(data) ? data : [data];
    const results = arr.map((raw, i) => checkPersona(raw, personas.length + i, arr.length > 1 ? f.name + ' 第 ' + (i + 1) + ' 项' : f.name));
    const ok = results.flatMap((r) => (r.persona ? [r.persona] : []));
    // 导入的人物如果没写 modes，默认放进当前模式
    ok.forEach((p) => { if (!p.modes?.length) p.modes = [draft.mode]; });
    onImport(ok);
    const failed = results.filter((r) => !r.persona).length;
    const warned = results.filter((r) => r.persona && r.warnings.length).length;
    const wrongMode = ok.filter((p) => p.modes && !p.modes.includes(draft.mode)).map((p) => p.name);
    setImportMsg(
      `导入 ${ok.length} 个人物` + (failed ? `，${failed} 个失败` : '') + (warned ? `，${warned} 个有提醒` : '')
      + (wrongMode.length ? `；${wrongMode.join('、')} 不属于当前模式，不会显示在这里` : ''),
    );
    const issues = results.filter((r) => r.errors.length || r.warnings.length);
    setChecks(issues);
    setShowChecks(issues.some((r) => r.errors.length > 0));
  };

  const minCount = isDebate ? 2 : 2;
  const debateOk = !isDebate || (sideCount('pro') >= 1 && sideCount('con') >= 1);
  const canStart = order.length >= minCount && debateOk;

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
        side: pk.side, isLead: isProduct ? id === lead : undefined,
        personalityId: pk.personalityId, persona,
      };
    });
    onStart({
      sessionId: 's-' + Date.now().toString(36),
      mode: draft.mode, sceneId: draft.sceneId,
      theme: { title: draft.theme.trim() },
      maxRounds: modeById(draft.mode).roundLabels.length,
      participants,
      engineOptions: { ...engineFor(draft.mode).defaults },
      createdAt: new Date().toISOString(),
    });
  };

  const sideLabel = { pro: '正方', con: '反方', host: '主持' } as const;

  return (
    <main className="setup cast">
      <section className="panel cast-head">
        <h2><b>04</b> 选择人物 <small>{scene.name} · 已选 {order.length}/{scene.maxSeats}
          {isDebate && `（正方 ${sideCount('pro')}/3 · 反方 ${sideCount('con')}/3 · 主持 ${sideCount('host')}/1）`}</small></h2>
        <div className="cast-tools">
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="px-btn" onClick={() => fileRef.current?.click()}>{modeById(draft.mode).importLabel}</button>
          {importMsg && <span className="hint">{importMsg}</span>}
          {checks.length > 0 && (
            <button className="px-btn tiny" onClick={() => setShowChecks(!showChecks)}>
              {showChecks ? '收起' : '查看'}问题（{checks.length}）
            </button>
          )}
        </div>
      </section>

      {showChecks && checks.length > 0 && (
        <section className="panel import-report">
          {checks.map((c, i) => (
            <div key={c.source + i} className={'ir-item' + (c.persona ? ' warn' : ' bad')}>
              <b>{c.persona ? '⚠ 已加载，有提醒' : '✕ 未加载'} · {c.source}{c.persona ? '（' + c.persona.name + '）' : ''}</b>
              <ul>
                {c.errors.map((e) => <li key={e} className="e">{e}</li>)}
                {c.warnings.map((w) => <li key={w} className="w">{w}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className="persona-grid">
        {available.map((p) => {
          const pk = picked[p.id];
          const perId = pk?.personalityId ?? personality[p.id] ?? p.defaultPersonalityId;
          const per = p.personalities.find((x) => x.id === perId) ?? p.personalities[0];
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
              <p className="pc-behavior">▸ {per.behavior}　“{per.style}”</p>
              <div className="pc-actions">
                <button className={'px-btn ' + (pk ? 'danger' : 'primary')} onClick={() => toggle(p)}>{pk ? '移出' : '入座'}</button>
                {pk && isDebate && <button className={'px-btn side-' + pk.side} onClick={() => cycleSide(p.id)}>{sideLabel[pk.side!]} ⇄</button>}
                {pk && isProduct && <button className={'px-btn' + (lead === p.id ? ' lead' : '')} onClick={() => setLead(p.id)}>{lead === p.id ? '★ 负责人' : '设为负责人'}</button>}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="setup-foot">
        <button className="px-btn" onClick={onBack}>◀ 返回</button>
        <span>「{draft.theme}」{!debateOk && ' · 辩论需要正反方各至少 1 人'}</span>
        <button className="px-btn primary" disabled={!canStart} onClick={start}>进入对话 ▶</button>
      </footer>
    </main>
  );
}
