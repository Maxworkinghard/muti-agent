import { useState } from 'react';
import type { ModeId, Persona, SceneId, SessionConfig, Track } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionView } from './components/DiscussionView';
import { PersonaCodex } from './components/PersonaCodex';
import { SAMPLE_PERSONAS } from './data/personas';
import { modeById } from './data/modes';

export interface Draft {
  track: Track;
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

export default function App() {
  // 1 模式·主题·场景 → 2 选人物 → 3 讨论室
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>({ track: modeById('entertainment').track, mode: 'entertainment', theme: '', sceneId: 'roundtable' });
  const [personas, setPersonas] = useState(SAMPLE_PERSONAS);
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [codex, setCodex] = useState(false);
  const canBack = codex || step === 2;
  const back = () => (codex ? setCodex(false) : setStep(1));
  const importPersonas = (list: Persona[]) =>
    setPersonas((old) => [...old.filter((o) => !list.some((n) => n.id === o.id)), ...list]);

  return (
    <div className="app">
      {step < 3 && (
        <header className="topbar">
          <div className="topbar-left">
            <button className="back-btn" disabled={!canBack} onClick={back} title={codex ? '关闭图鉴' : '返回上一步'}>◀ 返回</button>
            <span className="logo">多人格讨论工作台</span>
          </div>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={codex ? '' : step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <button className={'codex-btn' + (codex ? ' on' : '')} onClick={() => setCodex(!codex)} title="查看各模式的人物模板">▤ 图鉴</button>
        </header>
      )}
      {codex && step < 3 && <PersonaCodex personas={personas} initialMode={draft.mode} onImport={importPersonas} onClose={() => setCodex(false)} />}
      {/* 打开图鉴时第 1、2 步只是藏起来，不卸载，关掉图鉴后已选的人物还在 */}
      <div className="screen" hidden={codex}>
        {step === 1 && <SetupScene draft={draft} onChange={setDraft} onNext={() => setStep(2)} />}
        {step === 2 && (
          <SetupCast
            draft={draft}
            personas={personas}
            onBack={() => setStep(1)}
            onStart={(cfg) => { setSession(cfg); setStep(3); }}
          />
        )}
      </div>
      {step === 3 && session && <DiscussionView key={session.sessionId} config={session} onExit={() => setStep(2)} />}
    </div>
  );
}
