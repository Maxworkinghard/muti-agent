import { useState } from 'react';
import type { Persona, SceneDef } from '../types';
import { SCENE_LIST } from '../data/scenes';
import { SceneEditor } from './SceneEditor';
import { PersonaEditor } from './PersonaEditor';
import { PixelAvatar } from './PixelAvatar';

/**
 * 只演示「添加场景」和「添加人物」。不进入讨论。
 * 场景表单是产品里的 SceneEditor；底图从已有像素场景里点选。
 * 人物表单只在 ?demo=add 出现（产品本身是导入 JSON，没有填写表单）。
 */
export function DemoAdd() {
  const picks = SCENE_LIST.filter((s) => !s.model3d).map((s) => ({ id: s.id, name: s.name, image: s.image }));
  const [scenes, setScenes] = useState<SceneDef[]>([]);
  const [people, setPeople] = useState<Persona[]>([]);
  const [editingScene, setEditingScene] = useState(false);
  const [editingPersona, setEditingPersona] = useState(false);
  const [freshScene, setFreshScene] = useState<string | null>(null);
  const [freshPerson, setFreshPerson] = useState<string | null>(null);

  return (
    <main className="setup demo-collage demo-add" data-demo="add" data-demo-scenes={scenes.map((s) => s.name).join(',')} data-demo-personas={people.map((p) => p.name).join(',')}>
      <section className="panel">
        <h2><b>01</b> 添加场景 <small>博客风格 · 选一张已有像素图，再写上名字</small></h2>
        <div className="demo-add-scenes">
          {scenes.map((s) => (
            <article key={s.id} className={'scene-card on just-added'} data-demo="scene-card" data-demo-scene-name={s.name}>
              <img src={s.image} alt={s.name} />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                <i className="mine">自定义</i>
              </div>
              <small>{s.description}</small>
            </article>
          ))}
          <button className="scene-card scene-add" data-demo="add-scene" onClick={() => setEditingScene(true)}>
            <b>＋</b>
            <strong>添加场景</strong>
            <small>选一张像素图，点出座位</small>
          </button>
        </div>
      </section>

      <section className="panel">
        <h2><b>02</b> 添加人物 <small>和这个场景配套：作者、编辑、读者</small></h2>
        <div className="demo-add-cast">
          {people.map((p) => (
            <article key={p.id} className={'persona-card on demo-persona-card just-added' + (freshPerson === p.id ? ' fresh' : '')} data-demo="persona-card" data-demo-persona={p.name} style={{ ['--ac' as string]: p.visual.shirt }}>
              <div className="pc-top">
                <div className="pc-avatar"><PixelAvatar v={p.visual} size={44} /></div>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.identity}</small>
                </div>
              </div>
              <dl>
                <dt>知识</dt><dd>{p.knowledge.join(' / ') || '—'}</dd>
                <dt>思想</dt><dd>{p.thinking || '—'}</dd>
                <dt>价值</dt><dd>{p.values || '—'}</dd>
              </dl>
            </article>
          ))}
          <button className="scene-card scene-add add-persona" data-demo="add-persona" onClick={() => setEditingPersona(true)}>
            <b>＋</b>
            <strong>添加人物</strong>
            <small>名字、身份、知识、思想、价值</small>
          </button>
        </div>
      </section>

      {editingScene && (
        <SceneEditor
          defaultMode="entertainment"
          picks={picks}
          onClose={() => setEditingScene(false)}
          onSave={(s) => {
            setScenes((old) => [...old.filter((x) => x.id !== s.id), s]);
            setFreshScene(s.id);
            setEditingScene(false);
          }}
        />
      )}
      {editingPersona && (
        <PersonaEditor
          index={people.length}
          onClose={() => setEditingPersona(false)}
          onSave={(p) => {
            setPeople((old) => [...old, p]);
            setFreshPerson(p.id);
            setEditingPersona(false);
          }}
        />
      )}
      <span className="demo-add-fresh" hidden>{freshScene}</span>
    </main>
  );
}
