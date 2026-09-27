import { useEffect, useState } from 'react';
import type { ModeId, Persona, SceneDef, SceneId, SessionConfig } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionView } from './components/DiscussionView';
import { PersonaCodex } from './components/PersonaCodex';
import { LIBRARY_PERSONAS } from './data/personas';
import { DB_PREFIX, loadOptions, toPersona } from './data/backendPersonas';
import { loadCustomScenes, saveCustomScenes } from './data/scenes';
import { SoundToggle } from './sound';

export interface Draft {
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

export default function App() {
  // 1 模式·主题·场景 → 2 选人物 → 3 讨论室；娱乐、辩论、工作共用这三步
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>({ mode: 'entertainment', theme: '', sceneId: 'roundtable' });
  const [basePersonas, setBasePersonas] = useState(LIBRARY_PERSONAS);
  const [importedPersonas, setImportedPersonas] = useState<Persona[]>([]);
  const importedIds = new Set(importedPersonas.map((p) => p.id));
  const personas = [...basePersonas.filter((p) => !importedIds.has(p.id)), ...importedPersonas];
  /** 辩论用 backend/人物 里的人物数据库，读不到时在选人物页提示 */
  const [dbNotice, setDbNotice] = useState('');
  useEffect(() => {
    loadOptions()
      .then((o) => {
        const db = o.personas.map((p, i) => toPersona(p, i, o.personalities));
        setBasePersonas((old) => [...old.filter((x) => !x.id.startsWith(DB_PREFIX)), ...db]);
        setDbNotice(o.dryRun ? '辩论后端是试跑模式：不调用模型，只显示示例发言' : o.configError ? '⚠ ' + o.configError : '');
      })
      .catch(() => setDbNotice('⚠ 连不上辩论后端，请先在 backend 文件夹运行 python 服务.py，然后刷新页面'));
  }, []);
  /** 辩论只用人物数据库里的人物，娱乐和工作模式照旧 */
  const isRational = draft.mode === 'rational';
  const castPersonas = isRational ? personas.filter((p) => p.id.startsWith(DB_PREFIX)) : personas;
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [codex, setCodex] = useState(false);
  const [customScenes, setCustomScenes] = useState<SceneDef[]>(loadCustomScenes);
  const [sceneMsg, setSceneMsg] = useState('');
  const updateScenes = (list: SceneDef[]) => {
    setCustomScenes(list);
    setSceneMsg(saveCustomScenes(list) ? '' : '图片太大，浏览器存不下；这个场景只在本次打开时可用');
  };
  const saveScene = (s: SceneDef) => updateScenes([...customScenes.filter((x) => x.id !== s.id), s]);
  const deleteScene = (id: string) => {
    updateScenes(customScenes.filter((x) => x.id !== id));
    if (draft.sceneId === id) setDraft({ ...draft, sceneId: 'roundtable' });
  };
  const canBack = codex || step === 2;
  const back = () => (codex ? setCodex(false) : setStep(1));
  const importPersonas = (list: Persona[]) =>
    setImportedPersonas((old) => [...old.filter((o) => !list.some((n) => n.id === o.id)), ...list]);
  const deleteImportedPersona = (id: string) =>
    setImportedPersonas((old) => old.filter((p) => p.id !== id));

  return (
    <div className="app">
      {step < 3 && (
        <header className="topbar">
          <div className="topbar-left">
            {canBack && (
              <button className="back-btn" onClick={back} title={codex ? '关闭图鉴' : '返回上一步'}>◀ 返回</button>
            )}
            <span className="logo">多人格讨论工作台</span>
          </div>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={codex ? '' : step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <SoundToggle className="top" />
          <button className={'codex-btn' + (codex ? ' on' : '')} onClick={() => setCodex(!codex)} title="查看各模式的人物模板">▤ 图鉴</button>
        </header>
      )}
      {sceneMsg && step === 1 && !codex && <p className="scene-warn" onClick={() => setSceneMsg('')}>{sceneMsg}（点击关闭）</p>}
      {codex && step < 3 && <PersonaCodex personas={personas} importedIds={importedIds} initialMode={draft.mode} onImport={importPersonas} onDelete={deleteImportedPersona} onClose={() => setCodex(false)} />}
      {!codex && step === 1 && (
        <SetupScene
          draft={draft}
          onChange={setDraft}
          onNext={() => setStep(2)}
          customScenes={customScenes}
          onSaveScene={saveScene}
          onDeleteScene={deleteScene}
        />
      )}
      {!codex && step === 2 && (
        <SetupCast
          draft={draft}
          personas={castPersonas}
          maxMembers={isRational ? 5 : undefined}
          notice={isRational ? dbNotice : undefined}
          onStart={(cfg) => { setSession(cfg); setStep(3); }}
        />
      )}
      {step === 3 && session && <DiscussionView key={session.sessionId} config={session} onExit={() => setStep(2)} />}
    </div>
  );
}
