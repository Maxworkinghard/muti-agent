import { useEffect, useState } from 'react';
import type { ModeId, Persona, SceneId, SessionConfig, Track } from './types';
import { SetupScene } from './components/SetupScene';
import { SetupCast } from './components/SetupCast';
import { DiscussionCast } from './components/DiscussionCast';
import { DiscussionView } from './components/DiscussionView';
import { PersonaCodex } from './components/PersonaCodex';
import { SAMPLE_PERSONAS } from './data/personas';
import { MODES, modeById } from './data/modes';
import { loadOptions, toPersona } from './data/backendPersonas';

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
        {step === 2 && (modeById(draft.mode).backendPersonas
          ? <DiscussionCast draft={draft} onBack={() => setStep(1)} onStart={(cfg) => { setSession(cfg); setStep(3); }} />
          : (
            <SetupCast
              draft={draft}
              personas={personas}
              onBack={() => setStep(1)}
              onStart={(cfg) => { setSession(cfg); setStep(3); }}
            />
          ))}
      </div>
      {step === 3 && session && <DiscussionView key={session.sessionId} config={session} onExit={() => setStep(2)} />}
    </div>
  );
}
