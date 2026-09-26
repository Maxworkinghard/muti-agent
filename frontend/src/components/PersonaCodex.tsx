import { Fragment, useRef, useState } from 'react';
import type { ModeId, Persona } from '../types';
import { MODES, TRACKS, trackById } from '../data/modes';
import { normalizePersona } from '../data/personas';
import { PixelAvatar } from './PixelAvatar';

interface ImportFailure { source: string; error: string }

/** 人物图鉴：按模式浏览人物模板，点卡片看详细信息；导入的人物放进当前标签的模式 */
export function PersonaCodex({ personas, initialMode, onImport, onClose }: {
  personas: Persona[];
  initialMode: ModeId;
  onImport: (list: Persona[]) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ModeId>(initialMode);
  const [open, setOpen] = useState<Persona | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [failures, setFailures] = useState<ImportFailure[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = MODES.find((x) => x.id === mode)!;
  // 人物来自 backend 的模式只列 backend 的人物；其他模式里没写 modes 的人物处处可用
  const inMode = (id: ModeId) => personas.filter((p) => (MODES.find((x) => x.id === id)?.backendPersonas ? p.modes?.includes(id) : !p.modes || p.modes.includes(id)));
  const list = inMode(mode);

  const onFile = async (f: File) => {
    let data: unknown;
    try {
      data = JSON.parse((await f.text()).replace(/^﻿/, ''));
    } catch (e) {
      setImportMsg('导入失败：' + f.name + ' 不是合法的 JSON');
      setFailures([{ source: f.name, error: 'JSON 格式错误：' + (e as Error).message }]);
      return;
    }
    const arr = Array.isArray(data) ? data : [data];
    const ok: Persona[] = [];
    const bad: ImportFailure[] = [];
    arr.forEach((raw, i) => {
      // 序号按文件里的位置算，报错时能对上是第几项
      const r = normalizePersona(raw, i);
      if (typeof r === 'string') bad.push({ source: arr.length > 1 ? f.name + ' 第 ' + (i + 1) + ' 项' : f.name, error: r });
      else ok.push(r);
    });
    // 导入的人物如果没写 modes，默认放进当前标签的模式
    ok.forEach((p) => { if (!p.modes?.length) p.modes = [mode]; });
    onImport(ok);
    const wrongMode = ok.filter((p) => p.modes && !p.modes.includes(mode)).map((p) => p.name);
    setImportMsg(
      `导入 ${ok.length} 个人物到${m.name}` + (bad.length ? `，${bad.length} 个失败` : '')
      + (wrongMode.length ? `；${wrongMode.join('、')} 属于其他模式，请切换标签查看` : ''),
    );
    setFailures(bad);
  };

  return (
    <main className="setup codex">
      <section className="panel">
        <h2><b>图鉴</b> 人物模板 <small>点卡片查看详细信息</small></h2>
        {TRACKS.map((t) => (
          <div key={t.id} className="bench" style={{ ['--tc' as string]: t.color }}>
            <div className="bench-head"><strong>{t.name}</strong></div>
            <div className="codex-tabs">
              {MODES.filter((x) => x.track === t.id).map((x) => (
                <button key={x.id} className={'codex-tab' + (x.id === mode ? ' on' : '')} style={{ ['--mc' as string]: x.color }} onClick={() => setMode(x.id)}>
                  {x.name}<i>{inMode(x.id).length}</i>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="codex-head">
          <h2><b>{m.tag}</b> {m.name}模式 · {list.length} 位人物</h2>
          {!m.backendPersonas && (
            <div className="cast-tools">
              <input ref={fileRef} type="file" accept=".json,application/json" hidden
                onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
              <button className="px-btn primary" onClick={() => fileRef.current?.click()}>{trackById(m.track).importLabel}</button>
            </div>
          )}
        </div>
        {importMsg && <p className="hint">{importMsg}</p>}
        {failures.length > 0 && (
          <div className="import-report">
            {failures.map((x, i) => (
              <div key={x.source + i} className="ir-item"><b>✕ 未加载 · {x.source}</b><p>{x.error}</p></div>
            ))}
          </div>
        )}
        {list.length === 0 && <p className="empty">{m.backendPersonas ? '这个模式的人物来自 backend/ 的人格数据库，现在没读到：确认 backend/ 还在，并且是用 npm run dev 启动的' : '这个模式还没有人物模板'}</p>}
        {m.backendPersonas && list.length > 0 && <p className="hint">人物来自 backend 的人格数据库，每个人在开讨论前自选一种性格</p>}
        <div className="codex-grid">
          {list.map((p, i) => (
            <button key={p.id} className="codex-card" style={{ ['--ac' as string]: p.visual.shirt, animationDelay: i * 40 + 'ms' }} onClick={() => setOpen(p)}>
              <span className="pc-avatar"><PixelAvatar v={p.visual} size={64} /></span>
              <strong>{p.name}</strong>
              <small>{p.identity}</small>
              <em>{p.personalities.map((x) => x.label).join(' · ')}</em>
            </button>
          ))}
        </div>
      </section>
      <footer className="setup-foot">
        <span>导入的人物会出现在对应模式的「选择人物」里</span>
      </footer>
      {open && <PersonaDetail p={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function PersonaDetail({ p, onClose }: { p: Persona; onClose: () => void }) {
  // 按人格资料包协议 v1.0 导入的人物，额外展示协议里才有的字段
  const raw = p.protocol as Record<string, any> | undefined;
  const style = raw?.communicationStyle;
  const rows: Array<[string, string | undefined]> = [
    ['身份', p.identity],
    ['知识', p.knowledge.join(' / ')],
    ['不擅长', raw?.knowledge?.weak?.join(' / ')],
    ['思想', p.thinking],
    ['价值', p.values],
    ['盲点', raw?.worldview?.blindSpots?.join(' / ')],
    ['表达', style ? [style.tone, style.verbosity, style.humor && '幽默：' + style.humor].filter(Boolean).join(' · ') : undefined],
    ['口头禅', style?.catchphrases?.join(' / ')],
    ['适用模式', p.modes?.map((id) => MODES.find((x) => x.id === id)?.name ?? id).join(' / ') ?? '全部'],
  ];
  return (
    <div className="codex-overlay" onClick={onClose}>
      <article className="codex-detail" style={{ ['--ac' as string]: p.visual.shirt }} onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="pc-avatar"><PixelAvatar v={p.visual} size={80} /></span>
          <div>
            <strong>{p.name}</strong>
            <small>{(raw?.description as string) ?? p.identity}</small>
          </div>
          <button className="px-btn tiny" onClick={onClose}>✕</button>
        </header>
        <dl>
          {rows.filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>
        <h3>可选性格</h3>
        <ul className="codex-pers">
          {p.personalities.map((x) => (
            <li key={x.id}><b>{x.label}{x.id === p.defaultPersonalityId ? '（默认）' : ''}</b>{x.behavior}{x.style && <i>“{x.style}”</i>}</li>
          ))}
        </ul>
        {p.boundaries.length > 0 && (<><h3>底线</h3><ul className="codex-bounds">{p.boundaries.map((b) => <li key={b}>{b}</li>)}</ul></>)}
      </article>
    </div>
  );
}
