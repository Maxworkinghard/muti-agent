import { Fragment, useRef, useState } from 'react';
import type { ModeId, Persona } from '../types';
import { MODES } from '../data/modes';
import { LIBRARY_ISSUES, checkPersona, type PersonaCheck } from '../data/personas';
import { PixelAvatar } from './PixelAvatar';

/** 人物图鉴：按模式浏览人物模板，点卡片看详细信息；导入的人物放进当前标签的模式 */
export function PersonaCodex({ personas, importedIds, initialMode, onImport, onDelete, onClose }: {
  personas: Persona[];
  importedIds: Set<string>;
  initialMode: ModeId;
  onImport: (list: Persona[]) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ModeId>(initialMode);
  const [open, setOpen] = useState<Persona | null>(null);
  const [importMsg, setImportMsg] = useState('');
  // 导入和人物库里有错误或提醒的文件，逐条列出来
  const [checks, setChecks] = useState<PersonaCheck[]>(LIBRARY_ISSUES);
  const [showChecks, setShowChecks] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const m = MODES.find((x) => x.id === mode)!;
  const list = personas.filter((p) => !p.modes || p.modes.includes(mode));

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
    // 导入的人物如果没写 modes，默认放进当前标签的模式
    ok.forEach((p) => { if (!p.modes?.length) p.modes = [mode]; });
    onImport(ok);
    const failed = results.filter((r) => !r.persona).length;
    const warned = results.filter((r) => r.persona && r.warnings.length).length;
    const wrongMode = ok.filter((p) => p.modes && !p.modes.includes(mode)).map((p) => p.name);
    setImportMsg(
      `导入 ${ok.length} 个人物到${m.name}` + (failed ? `，${failed} 个失败` : '') + (warned ? `，${warned} 个有提醒` : '')
      + (wrongMode.length ? `；${wrongMode.join('、')} 属于其他模式，请切换标签查看` : ''),
    );
    const issues = results.filter((r) => r.errors.length || r.warnings.length);
    setChecks(issues);
    setShowChecks(issues.some((r) => r.errors.length > 0));
  };

  return (
    <main className="setup codex">
      <section className="panel">
        <h2><b>图鉴</b> 人物模板 <small>点卡片查看详细信息</small></h2>
        <div className="codex-tabs">
          {MODES.map((x) => (
            <button key={x.id} className={'codex-tab' + (x.id === mode ? ' on' : '')} style={{ ['--mc' as string]: x.color }} onClick={() => setMode(x.id)}>
              {x.name}<i>{personas.filter((p) => !p.modes || p.modes.includes(x.id)).length}</i>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="codex-head">
          <h2><b>{m.tag}</b> {m.name}模式 · {list.length} 位人物</h2>
          <div className="cast-tools">
            <input ref={fileRef} type="file" accept=".json,application/json" hidden
              onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
            <button className="px-btn primary" onClick={() => fileRef.current?.click()}>{m.importLabel}</button>
            {checks.length > 0 && (
              <button className="px-btn tiny" onClick={() => setShowChecks(!showChecks)}>
                {showChecks ? '收起' : '查看'}问题（{checks.length}）
              </button>
            )}
          </div>
        </div>
        {importMsg && <p className="hint">{importMsg}</p>}
        {showChecks && checks.length > 0 && (
          <div className="import-report">
            {checks.map((c, i) => (
              <div key={c.source + i} className={'ir-item' + (c.persona ? ' warn' : ' bad')}>
                <b>{c.persona ? '⚠ 已加载，有提醒' : '✕ 未加载'} · {c.source}{c.persona ? '（' + c.persona.name + '）' : ''}</b>
                <ul>
                  {c.errors.map((e) => <li key={e} className="e">{e}</li>)}
                  {c.warnings.map((w) => <li key={w} className="w">{w}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
        {list.length === 0 && <p className="empty">这个模式还没有人物模板</p>}
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
      {open && <PersonaDetail p={open} onClose={() => setOpen(null)} onDelete={importedIds.has(open.id) ? () => {
        onDelete(open.id);
        setChecks((old) => old.filter((c) => c.persona?.id !== open.id));
        setImportMsg(`已删除导入人物「${open.name}」`);
        setOpen(null);
      } : undefined} />}
    </main>
  );
}

function PersonaDetail({ p, onClose, onDelete }: { p: Persona; onClose: () => void; onDelete?: () => void }) {
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
        {onDelete && <div className="codex-detail-actions"><button className="px-btn danger" onClick={onDelete}>删除人物</button></div>}
      </article>
    </div>
  );
}
