import { useState } from 'react';
import type { ModeId, SceneId, SessionConfig } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionView } from './components/DiscussionView';
import { LIBRARY_PERSONAS } from './data/personas';

export interface Draft {
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

export default function App() {
  // 1 模式·主题·场景 → 2 选人物 → 3 讨论室；娱乐、辩论、工作共用这三步
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>({ mode: 'entertainment', theme: '', sceneId: 'roundtable' });
  const [personas, setPersonas] = useState(LIBRARY_PERSONAS);
  const [session, setSession] = useState<SessionConfig | null>(null);

  return (
    <div className="app">
      {step < 3 && (
        <header className="topbar">
          <button className="logo" onClick={() => setStep(1)} title="回到模式选择">▣ 多人格讨论工作台</button>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </header>
      )}
      {step === 1 && <SetupScene draft={draft} onChange={setDraft} onNext={() => setStep(2)} />}
      {step === 2 && (
        <SetupCast
          draft={draft}
          personas={personas}
          onImport={(list) => setPersonas((old) => [...old.filter((o) => !list.some((n) => n.id === o.id)), ...list])}
          onBack={() => setStep(1)}
          onStart={(cfg) => { setSession(cfg); setStep(3); }}
        />
      )}
      {step === 3 && session && <DiscussionView key={session.sessionId} config={session} onExit={() => setStep(2)} />}
    </div>
  );
}
