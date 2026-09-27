import { useEffect, useState } from 'react';
import type { Draft } from '../App';
import type { Participant, SessionConfig } from '../types';
import { sceneById } from '../data/scenes';
import { modeById } from '../data/modes';
import { engineFor } from '../engines/registry';
import { loadOptions, toPersona, type Options } from '../data/backendPersonas';
import { PixelAvatar } from './PixelAvatar';

const clamp = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));

/** 理性讨论的选人页：人物和性格来自 backend 的人格数据库，每人必须选一种性格；轮数和字数上限在这里设 */
export function DiscussionCast({ draft, onStart }: { draft: Draft; onStart: (cfg: SessionConfig) => void }) {
  const scene = sceneById(draft.sceneId);
  const mode = modeById(draft.mode);
  const [opt, setOpt] = useState<Options | null>(null);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [rounds, setRounds] = useState(mode.roundLabels.length);
  const [maxChars, setMaxChars] = useState(Number(engineFor(draft.mode).defaults.maxChars ?? 150));

  const load = () => {
    setErr('');
    loadOptions().then(setOpt).catch((e: Error) => setErr(`读不到人格数据库：${e.message}。确认是用 npm run dev 启动的，再点重试。`));
  };
  useEffect(load, []);

  if (!opt) {
    return (
      <main className="setup cast">
        <section className="panel">
          <p>{err || '正在读取人格数据库…'}</p>
          {err && <button className="px-btn" onClick={load}>重试</button>}
        </section>
      </main>
    );
  }

  const maxSeats = Math.min(opt.limits.members[1], scene.maxSeats);
  const pickOf = (id: string) => picks[id] ?? '';
  const toggleSeat = (id: string) => {
    if (order.includes(id)) setOrder(order.filter((x) => x !== id));
    else if (order.length < maxSeats) setOrder([...order, id]);
  };
  const missing = order.filter((id) => !pickOf(id));
  const names = (ids: string[]) => ids.map((id) => opt.personas.find((p) => p.id === id)!.name).join('、');
  const canStart = order.length >= opt.limits.members[0] && !missing.length;

  const start = () => {
    const participants: Participant[] = order.map((id, i) => {
      const idx = opt.personas.findIndex((p) => p.id === id);
      const ap = opt.personas[idx];
      return {
        // 按人数把座位均匀分开
        agentId: id, seatIndex: Math.round((i * scene.maxSeats) / order.length) % scene.maxSeats, color: ap.color,
        personalityId: pickOf(id), persona: toPersona(ap, idx, opt.personalities, draft.mode),
      };
    });
    onStart({
      sessionId: 's-' + Date.now().toString(36), mode: draft.mode, sceneId: draft.sceneId,
      theme: { title: draft.theme.trim() }, maxRounds: rounds, participants,
      engineOptions: { ...engineFor(draft.mode).defaults, maxChars }, createdAt: new Date().toISOString(),
    });
  };

  return (
    <main className="setup cast">
      <section className="panel cast-head">
        <h2><b>04</b> 选择人物 <small>{scene.name} · 已选 {order.length}/{maxSeats} · 每人选 1 种性格</small></h2>
        <span className="hint">
          {opt.configError ? '⚠ ' + opt.configError : '模型：' + opt.model}
        </span>
      </section>

      <section className="panel">
        <h2><b>05</b> 讨论设置</h2>
        <div className="rt-settings">
          <label>
            轮数
            <input className="px-input" type="number" min={opt.limits.rounds[0]} max={opt.limits.rounds[1]} value={rounds}
              onChange={(e) => setRounds(clamp(+e.target.value || opt.limits.rounds[0], opt.limits.rounds))} />
            <small>第 1 轮开场，最后一轮收尾，中间是交锋</small>
          </label>
          <label>
            每次发言字数上限
            <input className="px-input" type="number" min={opt.limits.maxChars[0]} max={opt.limits.maxChars[1]} step={10} value={maxChars}
              onChange={(e) => setMaxChars(clamp(+e.target.value || 150, opt.limits.maxChars))} />
          </label>
        </div>
      </section>

      <div className="persona-grid">
        {opt.personas.map((ap, i) => {
          const on = order.includes(ap.id);
          const pk = pickOf(ap.id);
          const persona = toPersona(ap, i, opt.personalities, draft.mode);
          return (
            <article key={ap.id} className={'persona-card' + (on ? ' on' : '')} style={{ ['--ac' as string]: ap.color }}>
              <div className="pc-top" onClick={() => toggleSeat(ap.id)}>
                <div className="pc-avatar"><PixelAvatar v={persona.visual} size={56} /></div>
                <div>
                  <strong>{ap.name}</strong>
                  <small>{ap.role} · {ap.profession}</small>
                </div>
                {on && <span className="pc-no">{order.indexOf(ap.id) + 1}</span>}
              </div>
              <dl>
                <dt>知识</dt><dd>{ap.domains.join(' / ')}</dd>
                <dt>思想</dt><dd>{ap.tradition}</dd>
                <dt>信念</dt><dd>{ap.coreConviction}</dd>
              </dl>
              <label className="pc-select">
                性格
                <select value={pk} onChange={(e) => setPicks({ ...picks, [ap.id]: e.target.value })}>
                  <option value="">请选择…</option>
                  {opt.personalities.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <p className="pc-behavior">▸ {opt.personalities.find((s) => s.name === pk)?.description ?? ap.description}</p>
              <div className="pc-actions">
                <button className={'px-btn ' + (on ? 'danger' : 'primary')} onClick={() => toggleSeat(ap.id)}>{on ? '移出' : '入座'}</button>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="setup-foot">
        <span>
          {draft.theme.trim() ? `「${draft.theme.trim()}」` : '主题会按你的第一句话自动生成'}
          {order.length < opt.limits.members[0] && ` · 至少选 ${opt.limits.members[0]} 人`}
          {missing.length > 0 && ` · 还要给 ${names(missing)} 选性格`}
        </span>
        <button className="px-btn primary" disabled={!canStart} onClick={start}>进入对话 ▶</button>
      </footer>
    </main>
  );
}
