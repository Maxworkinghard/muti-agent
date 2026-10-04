import { useState } from 'react';
import type { ModeId, Persona, SceneDef, SceneId, SessionConfig } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionView } from './components/DiscussionView';
import { PersonaCodex } from './components/PersonaCodex';
import { DemoIntro } from './components/DemoIntro';
import { DemoCollage } from './components/DemoCollage';
import { DemoPrompt } from './components/DemoPrompt';
import { LIBRARY_PERSONAS } from './data/personas';
import { loadCustomScenes, saveCustomScenes } from './data/scenes';
import { SoundToggle } from './sound';
import { demoFlags } from './demoFlags';

/** 电影感演示流开关；关掉后恢复普通三步配置。与 demoFlags.cinematic 保持一致。 */
export const DEMO_CINEMATIC = true;
demoFlags.cinematic = DEMO_CINEMATIC;

export interface Draft {
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

type DemoStep = 'intro' | 'collage' | 'discussion';
type NormalStep = 1 | 2 | 3;

const IMPORT_TAKE = new URLSearchParams(window.location.search).get('demo') === 'import';

const PROMPT_TAKE = new URLSearchParams(window.location.search).get('demo') === 'prompt';

export default function App() {
  if (PROMPT_TAKE) {
    return (
      <div className="app demo-cinematic">
        <DemoPrompt />
      </div>
    );
  }

  const [step, setStep] = useState<DemoStep | NormalStep>(DEMO_CINEMATIC ? (IMPORT_TAKE ? 'collage' : 'intro') : 1);
  const [draft, setDraft] = useState<Draft>({
    mode: 'entertainment',
    theme: IMPORT_TAKE ? '一座城市的夜班，怎么过才算活着' : '',
    sceneId: 'roundtable',
  });
  const [importedPersonas, setImportedPersonas] = useState<Persona[]>([]);
  const importedIds = new Set(importedPersonas.map((p) => p.id));
  // 内置人物已经按 id 去过重（含辩论组的）；导入的和内置的同 id 时以导入的为准
  const personas = [...LIBRARY_PERSONAS.filter((p) => !importedIds.has(p.id)), ...importedPersonas];
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
  const canBack = !DEMO_CINEMATIC && (codex || step === 2);
  const back = () => (codex ? setCodex(false) : setStep(1));
  const importPersonas = (list: Persona[]) =>
    setImportedPersonas((old) => [...old.filter((o) => !list.some((n) => n.id === o.id)), ...list]);
  const deleteImportedPersona = (id: string) =>
    setImportedPersonas((old) => old.filter((p) => p.id !== id));

  const inDiscussion = DEMO_CINEMATIC ? step === 'discussion' : step === 3;
  const showSetupChrome = !DEMO_CINEMATIC && !inDiscussion;
  return (
    <div className={'app' + (DEMO_CINEMATIC ? ' demo-cinematic' : '')}>
      {showSetupChrome && (
        <header className="topbar">
          <div className="topbar-left">
            {canBack && (
              <button className="back-btn" onClick={back} title={codex ? '关闭图鉴' : '返回上一步'}>◀ 返回</button>
            )}
            <span className="logo">多人格讨论工作台</span>
          </div>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={codex ? '' : step === i + 1 ? 'on' : (typeof step === 'number' && step > i + 1) ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <SoundToggle className="top" />
          <button className={'codex-btn' + (codex ? ' on' : '')} onClick={() => setCodex(!codex)} title="查看各模式的人物模板">▤ 图鉴</button>
        </header>
      )}
      {sceneMsg && !DEMO_CINEMATIC && step === 1 && !codex && <p className="scene-warn" onClick={() => setSceneMsg('')}>{sceneMsg}（点击关闭）</p>}
      {codex && showSetupChrome && <PersonaCodex personas={personas} importedIds={importedIds} initialMode={draft.mode} onImport={importPersonas} onDelete={deleteImportedPersona} onClose={() => setCodex(false)} />}

      {DEMO_CINEMATIC && step === 'intro' && (
        <DemoIntro
          onConfirm={(theme) => {
            setDraft((d) => ({ ...d, theme, mode: 'rational', sceneId: d.sceneId || 'roundtable' }));
            setStep('collage');
          }}
        />
      )}
      {DEMO_CINEMATIC && step === 'collage' && (
        <DemoCollage
          draft={draft}
          personas={personas}
          onChangeScene={(sceneId) => setDraft((d) => ({ ...d, sceneId }))}
          onStart={(cfg) => { setSession(cfg); setStep('discussion'); }}
          allowImport={IMPORT_TAKE}
          customScenes={IMPORT_TAKE ? customScenes : []}
          onSaveScene={saveScene}
          importedIds={importedIds}
          onImportPersonas={importPersonas}
        />
      )}

      {!DEMO_CINEMATIC && !codex && step === 1 && (
        <SetupScene
          draft={draft}
          onChange={setDraft}
          onNext={() => setStep(2)}
          customScenes={customScenes}
          onSaveScene={saveScene}
          onDeleteScene={deleteScene}
        />
      )}
      {!DEMO_CINEMATIC && !codex && step === 2 && (
        <SetupCast
          draft={draft}
          personas={personas}
          onStart={(cfg) => { setSession(cfg); setStep(3); }}
        />
      )}
      {inDiscussion && session && (
        <DiscussionView
          key={session.sessionId}
          config={session}
          cinematicIntro={DEMO_CINEMATIC}
          onExit={() => setStep(DEMO_CINEMATIC ? 'collage' : 2)}
        />
      )}
    </div>
  );
}
