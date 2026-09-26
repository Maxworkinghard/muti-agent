import type { Draft } from '../App';
import { MODES, TRACKS, trackById } from '../data/modes';
import { SCENE_LIST } from '../data/scenes';

export function SetupScene({ draft, onChange, onNext }: { draft: Draft; onChange: (d: Draft) => void; onNext: () => void }) {
  const mode = MODES.find((m) => m.id === draft.mode)!;
  return (
    <main className="setup">
      <section className="panel">
        <h2><b>01</b> 选择模式 <small>按工作台分组</small></h2>
        {TRACKS.map((t) => (
          <div key={t.id} className="bench" style={{ ['--tc' as string]: t.color }}>
            <div className="bench-head"><strong>{t.name}</strong><small>{t.desc}</small></div>
            <div className="mode-grid">
              {MODES.filter((m) => m.track === t.id).map((m) => (
                <button
                  key={m.id}
                  className={'mode-card' + (m.id === draft.mode ? ' on' : '')}
                  style={{ ['--mc' as string]: m.color }}
                  onClick={() => onChange({ ...draft, track: m.track, mode: m.id, sceneId: m.scene })}
                >
                  <span className="tag">{m.tag}</span>
                  <strong>{m.name}</strong>
                  <small>{m.desc}</small>
                  <em>{m.roundLabels.join(' → ')}</em>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2><b>02</b> 讨论主题 <small>可以不填，进入对话后按你的第一句话自动生成</small></h2>
        <input
          className="px-input big"
          placeholder="输入你想讨论的问题…（可不填）"
          value={draft.theme}
          maxLength={60}
          onChange={(e) => onChange({ ...draft, theme: e.target.value })}
        />
        <div className="chips">
          {mode.presets.map((p) => (
            <button key={p} className="chip" onClick={() => onChange({ ...draft, theme: p })}>{p}</button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2><b>03</b> 场景图</h2>
        <div className="scene-grid">
          {SCENE_LIST.map((s) => (
            <button key={s.id} className={'scene-card' + (s.id === draft.sceneId ? ' on' : '')} onClick={() => onChange({ ...draft, sceneId: s.id })}>
              <img src={s.image} alt={s.name} />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                {s.recommendedMode === draft.mode && <i className="rec">推荐</i>}
              </div>
              <small>{s.description}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="setup-foot">
        <span>{trackById(mode.track).name} / {mode.name} · {SCENE_LIST.find((s) => s.id === draft.sceneId)!.name}</span>
        <button className="px-btn primary" onClick={onNext}>下一步：选择人物 ▶</button>
      </footer>
    </main>
  );
}
