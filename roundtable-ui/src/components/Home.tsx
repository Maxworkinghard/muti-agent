import type { Track } from '../types';
import { MODES, TRACKS } from '../data/modes';

export function Home({ onPick }: { onPick: (t: Track) => void }) {
  return (
    <main className="home">
      <h1 className="home-title">▣ 多人格讨论工作台</h1>
      <p className="home-sub">先选择你要做的事</p>
      <div className="home-grid">
        {TRACKS.map((t) => (
          <button key={t.id} className="home-card" style={{ ['--mc' as string]: t.color }} onClick={() => onPick(t.id)}>
            <span className="tag">{t.tag}</span>
            <strong>{t.name}</strong>
            <small>{t.desc}</small>
            <em>{MODES.filter((m) => m.track === t.id).map((m) => m.name).join(' / ')}</em>
          </button>
        ))}
      </div>
    </main>
  );
}
