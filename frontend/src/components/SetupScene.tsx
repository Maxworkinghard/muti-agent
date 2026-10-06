import { useEffect, useMemo, useState } from 'react';
import type { Draft } from '../App';
import type { SceneDef } from '../types';
import { MODES } from '../data/modes';
import { pickTopics } from '../data/topicPicker';
import { SCENE_LIST } from '../data/scenes';
import { SceneEditor } from './SceneEditor';

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
  // 主题候选的批次编号：「↻ 换一批」加一，换模式时归零
  const [topicSeed, setTopicSeed] = useState(0);
  const topics = useMemo(() => pickTopics(mode.presets, topicSeed), [mode, topicSeed]);
  // null：关闭；'new'：添加；其他：编辑这个场景
  const [editing, setEditing] = useState<SceneDef | 'new' | null>(null);
  const [mcReady, setMcReady] = useState(false);
  useEffect(() => { let active = true; void fetch('/mc/manifest.json').then(async r => r.ok && (await r.json()).version)
    .then(ok => { if (active) setMcReady(Boolean(ok)); }).catch(() => {}); return () => { active = false; }; }, []);
  return (
    <main className="setup">
      <section className="panel">
        <h2><b>01</b> 选择模式</h2>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={'mode-card' + (m.id === draft.mode ? ' on' : '')}
              style={{ ['--mc' as string]: m.color }}
              // 换模式时，上一个模式的预设主题不再适用，清空；用户手写的主题保留
              onClick={() => {
                setTopicSeed(0);
                onChange({ ...draft, mode: m.id, sceneId: m.scene, theme: mode.presets.includes(draft.theme) ? '' : draft.theme });
              }}
            >
              <span className="tag">{m.tag}</span>
              <strong>{m.name}</strong>
              <small>{m.desc}</small>
              {/* 阶段名不拆开：一行放不下时只在两个阶段之间换行 */}
              <em>{m.roundLabels.flatMap((label, i) => [i ? ' ' : null, <span key={label}>{label}{i < m.roundLabels.length - 1 ? ' →' : ''}</span>])}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>
          <b>02</b> 讨论主题
          <button className="px-btn tiny refresh" onClick={() => setTopicSeed((s) => s + 1)} title="刷新主题：从题池里再挑一批">↻ 换一批</button>
        </h2>
        <input
          className="px-input big"
          placeholder="输入你想讨论的问题…"
          value={draft.theme}
          maxLength={60}
          onChange={(e) => onChange({ ...draft, theme: e.target.value })}
        />
        <div className="chips">
          {topics.map((p) => (
            <button key={p} className="chip" onClick={() => onChange({ ...draft, theme: p })}>{p}</button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2><b>03</b> 选择场景 <small>像素场景和新增 3D 场景可分别选择</small></h2>
        <div className="scene-grid">
          {scenes.filter((s) => !s.model3d && !s.mcStage).map((s) => (
            <button key={s.id} className={'scene-card' + (s.id === draft.sceneId ? ' on' : '')} onClick={() => onChange({ ...draft, sceneId: s.id })}>
              <img src={s.image} alt={s.name} />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                {s.custom && <i className="mine">自定义</i>}
                {s.recommendedMode === draft.mode && <i className="rec">推荐</i>}
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
        <h3 className="scene-section-title">新增 3D 场景</h3>
        <div className="scene-grid" aria-label="新增 3D 场景">
          {scenes.filter((s) => s.model3d || s.mcStage).map((s) => (
            <button key={s.id} disabled={Boolean(s.mcStage) && !mcReady} className={'scene-card scene-card-3d' + (s.mcStage && !mcReady ? ' mc-unavailable' : '') + (s.id === draft.sceneId ? ' on' : '')} onClick={() => onChange({ ...draft, sceneId: s.id })}>
              <img src={s.previewImage ?? s.image} alt={s.name} loading="lazy" />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                <i className="scene-3d-badge">3D</i>
              </div>
              <small>{s.mcStage && !mcReady ? '需要先导入游戏资源（npm run mc:import）' : s.description}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="setup-foot">
        <span>{mode.name} · {scenes.find((s) => s.id === draft.sceneId)?.name} · {draft.theme || '（还没有主题）'}</span>
        <button className="px-btn primary" disabled={Boolean(scenes.find(s=>s.id===draft.sceneId)?.mcStage)&&!mcReady} onClick={onNext}>下一步：选择人物 ▶</button>
      </footer>
      {editing && (
        <SceneEditor
          initial={editing === 'new' ? undefined : editing}
          defaultMode={draft.mode}
          onClose={() => setEditing(null)}
          onSave={(s) => { onSaveScene(s); onChange({ ...draft, sceneId: s.id }); setEditing(null); }}
          onDelete={editing === 'new' ? undefined : () => { onDeleteScene(editing.id); setEditing(null); }}
        />
      )}
    </main>
  );
}
