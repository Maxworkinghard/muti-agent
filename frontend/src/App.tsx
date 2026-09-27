import { useEffect, useState } from 'react';
import type { ModeId, Persona, SceneDef, SceneId, SessionConfig } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionCast } from './components/DiscussionCast';
import { DiscussionView } from './components/DiscussionView';
import { PersonaCodex } from './components/PersonaCodex';
import { LIBRARY_PERSONAS } from './data/personas';
import { MODES, modeById } from './data/modes';
import { loadOptions, toPersona } from './data/backendPersonas';
import { loadCustomScenes, saveCustomScenes } from './data/scenes';
import { SoundToggle } from './sound';

export interface Draft {
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

export default function App() {
  // 1 模式·主题·场景 → 2 选人物 → 3 讨论室
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>({ mode: 'entertainment', theme: '', sceneId: 'roundtable' });
  // 人物来自 frontend/personas/ 下的 JSON（人物库），图鉴里导入的人物也加进来
  const [personas, setPersonas] = useState(LIBRARY_PERSONAS);
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [codex, setCodex] = useState(false);
  // 用户自己添加的场景存在浏览器本地；图片太大存不下时只在本次打开时可用
  const [customScenes, setCustomScenes] = useState<SceneDef[]>(loadCustomScenes);
  const [sceneMsg, setSceneMsg] = useState('');
  const updateScenes = (list: SceneDef[]) => {
    setCustomScenes(list);
    setSceneMsg(saveCustomScenes(list) ? '' : '图片太大，浏览器存不下；这个场景只在本次打开时可用');
  };
  const saveScene = (s: SceneDef) => updateScenes([...customScenes.filter((x) => x.id !== s.id), s]);
  const deleteScene = (id: string) => {
    updateScenes(customScenes.filter((x) => x.id !== id));
    if (draft.sceneId === id) setDraft({ ...draft, sceneId: modeById(draft.mode).scene });
  };
  // 第一页没有上一步，不显示返回键
  const canBack = codex || step === 2;
  const back = () => (codex ? setCodex(false) : setStep(1));
  const importPersonas = (list: Persona[]) =>
    setPersonas((old) => [...old.filter((o) => !list.some((n) => n.id === o.id)), ...list]);

  // 理性讨论的人物在 backend 的人格数据库里：打开图鉴时向 backend 要一次，没启动就先不显示
  useEffect(() => {
    if (!codex) return;
    const mode = MODES.find((m) => m.backendPersonas);
    if (!mode) return;
    loadOptions()
      .then((o) => importPersonas(o.personas.map((p, i) => toPersona(p, i, o.personalities, mode.id))))
      .catch(() => {});
  }, [codex]);

  return (
    <div className="app">
      {step < 3 && (
        <header className="topbar">
          <div className="topbar-left">
            {canBack && <button className="back-btn" onClick={back} title={codex ? '关闭图鉴' : '返回上一步'}>◀ 返回</button>}
            <span className="logo">多人格讨论工作台</span>
          </div>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={codex ? '' : step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <div className="topbar-right">
            <SoundToggle className="top" />
            <button className={'codex-btn' + (codex ? ' on' : '')} onClick={() => setCodex(!codex)} title="查看各模式的人物模板">▤ 图鉴</button>
          </div>
        </header>
      )}
      {sceneMsg && step === 1 && !codex && <p className="scene-warn" onClick={() => setSceneMsg('')}>{sceneMsg}（点击关闭）</p>}
      {codex && step < 3 && <PersonaCodex personas={personas} initialMode={draft.mode} onImport={importPersonas} onClose={() => setCodex(false)} />}
      {/* 打开图鉴时第 1、2 步只是藏起来，不卸载，关掉图鉴后已选的人物还在 */}
      <div className="screen" hidden={codex}>
        {step === 1 && (
          <SetupScene
            draft={draft}
            onChange={setDraft}
            onNext={() => setStep(2)}
            customScenes={customScenes}
            onSaveScene={saveScene}
            onDeleteScene={deleteScene}
          />
        )}
        {/* 返回统一用顶栏左上角的按钮，页脚不再放返回 */}
        {step === 2 && (modeById(draft.mode).backendPersonas
          ? <DiscussionCast draft={draft} onStart={(cfg) => { setSession(cfg); setStep(3); }} />
          : (
            <SetupCast
              draft={draft}
              personas={personas}
              onStart={(cfg) => { setSession(cfg); setStep(3); }}
            />
          ))}
      </div>
      {step === 3 && session && <DiscussionView key={session.sessionId} config={session} onExit={() => setStep(2)} />}
    </div>
  );
}
