import { useState } from 'react';
import type { ModeId, SceneId, SessionConfig, Track } from './types';
import { Home } from './components/Home';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionView } from './components/DiscussionView';
import { SAMPLE_PERSONAS } from './data/personas';
import { modeById, trackById } from './data/modes';

export interface Draft {
  track: Track;
  mode: ModeId;
  theme: string;
  sceneId: SceneId;
}

export default function App() {
  // 0 首页选路线 → 1 模式·主题·场景 → 2 选人物 → 3 讨论室；讨论和工作共用后面三步
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [draft, setDraft] = useState<Draft>({ track: 'discuss', mode: 'entertainment', theme: '', sceneId: 'roundtable' });
  const [personas, setPersonas] = useState(SAMPLE_PERSONAS);
  const [session, setSession] = useState<SessionConfig | null>(null);

  const pickTrack = (track: Track) => {
    const mode = trackById(track).defaultMode;
    setDraft({ track, mode, theme: '', sceneId: modeById(mode).scene });
    setStep(1);
  };

  return (
    <div className="app">
      {step > 0 && step < 3 && (
        <header className="topbar">
          <button className="logo" onClick={() => setStep(0)} title="回到首页">▣ 多人格讨论工作台</button>
          <span className="track-tag" style={{ background: trackById(draft.track).color }}>{trackById(draft.track).name}</span>
          <ol className="steps">
            {['模式 · 主题 · 场景', '选择人物', '讨论'].map((s, i) => (
              <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </header>
      )}
      {step === 0 && <Home onPick={pickTrack} />}
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
