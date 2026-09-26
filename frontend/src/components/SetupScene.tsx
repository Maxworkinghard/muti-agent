import { useState } from 'react';
import type { Draft } from '../App';
import type { SceneDef } from '../types';
import { MODES, TRACKS, trackById } from '../data/modes';
import { SCENE_LIST } from '../data/scenes';
import { SceneEditor } from './SceneEditor';

/** 推荐主题一次显示几个 */
const PICKS = 3;

/** 从主题库里随机挑 n 个（洗牌后取前 n 个） */
function sample(list: string[], n: number) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function SetupScene({ draft, onChange, onNext, customScenes, onSaveScene, onDeleteScene }: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onNext: () => void;
  customScenes: SceneDef[];
  onSaveScene: (s: SceneDef) => void;
  onDeleteScene: (id: string) => void;
}) {
  const mode = MODES.find((m) => m.id === draft.mode)!;
  const scenes = [...SCENE_LIST, ...customScenes];
  // null：关闭；'new'：添加；其他：编辑这个场景
  const [editing, setEditing] = useState<SceneDef | 'new' | null>(null);
  // 每次进入这一步、切换模式或点「换一批」都重新随机
  const [picks, setPicks] = useState(() => sample(mode.presets, PICKS));
  const reshuffle = () => {
    // 尽量换成这次没出现过的
    const rest = mode.presets.filter((p) => !picks.includes(p));
    setPicks(sample(rest.length >= PICKS ? rest : mode.presets, PICKS));
  };
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
                  onClick={() => { onChange({ ...draft, track: m.track, mode: m.id, sceneId: m.scene }); setPicks(sample(m.presets, PICKS)); }}
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
        <h2><b>02</b> 讨论主题</h2>
        <input
          className="px-input big"
          placeholder="输入你想讨论的问题…"
          value={draft.theme}
          maxLength={60}
          onChange={(e) => onChange({ ...draft, theme: e.target.value })}
        />
        <div className="chips">
          {picks.map((p) => (
            <button key={p} className="chip" onClick={() => onChange({ ...draft, theme: p })}>{p}</button>
          ))}
          <button className="chip shuffle" onClick={reshuffle} title="换一批推荐主题">↻ 换一批</button>
        </div>
      </section>

      <section className="panel">
        <h2><b>03</b> 场景图 <small>也可以上传自己的场景图</small></h2>
        <div className="scene-grid">
          {scenes.map((s) => (
            <button key={s.id} className={'scene-card' + (s.id === draft.sceneId ? ' on' : '')} onClick={() => onChange({ ...draft, sceneId: s.id })}>
              <img src={s.image} alt={s.name} />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                {s.custom && <i className="mine">自定义</i>}
              </div>
              <small>{s.description}</small>
              {s.custom && (
                <span className="scene-edit" role="button" title="编辑场景" onClick={(e) => { e.stopPropagation(); setEditing(s); }}>✎ 编辑</span>
              )}
            </button>
          ))}
          <button className="scene-card scene-add" onClick={() => setEditing('new')}>
            <b>＋</b>
            <strong>添加场景</strong>
            <small>上传一张图，点出座位就能用</small>
          </button>
        </div>
      </section>

      <footer className="setup-foot">
        <span>{trackById(mode.track).name} / {mode.name} · {scenes.find((s) => s.id === draft.sceneId)?.name}</span>
        <button className="px-btn primary" onClick={onNext}>下一步：选择人物 ▶</button>
      </footer>
      {editing && (
        <SceneEditor
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(s) => { onSaveScene(s); onChange({ ...draft, sceneId: s.id }); setEditing(null); }}
          onDelete={editing === 'new' ? undefined : () => { onDeleteScene(editing.id); setEditing(null); }}
        />
      )}
    </main>
  );
}
