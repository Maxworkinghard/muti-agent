import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { McStage3D } from '../components/McStage3D';
import { SCENES } from '../data/scenes';
import type { Participant } from '../types';
import '../styles.css';
import './style.css';

const scenes = Object.values(SCENES).filter((scene) => scene.mcStage);
const requested = new URLSearchParams(location.search).get('scene');
/** ?v=2 预览 src/mc/v2 的重建场景（没有新实现的场景仍是旧的） */
const version = new URLSearchParams(location.search).get('v') === '2' ? 2 : 1;
const colors = ['#4f9db8', '#b95c51', '#728d55', '#9f7cae', '#cc9954', '#66768b', '#947453', '#638f85'];

function Lab() {
  const [id, setId] = useState(scenes.some((scene) => scene.id === requested) ? requested! : scenes[0]?.id ?? 'roundtable-mc');
  const [speaker, setSpeaker] = useState(-1);
  const [error, setError] = useState('');
  const scene = SCENES[id];
  const kind = scene?.mcStage;
  if (!scene || !kind) {
    return <main className="stage-lab">
      <header><h1>3D 场景预览</h1></header>
      <p style={{ padding: '2rem', textAlign: 'center' }}>当前没有可用的 3D 场景</p>
    </main>;
  }
  const participants: Participant[] = scene.seats.map((seat, i) => {
    const visual = { skin: '#f1c9a5', hair: '#352c29', shirt: colors[i % colors.length], accent: '#fbf5e4', hairStyle: 'short' as const };
    return {
      agentId: 'preview-' + i, seatIndex: i, color: visual.shirt,
      personalityId: 'neutral', isLead: i === 0,
      persona: {
        id: 'preview-' + i, name: seat.group === 'host' ? '主持人' : `角色 ${i + 1}`, identity: '预览角色', knowledge: [], thinking: '',
        values: '', personalities: [], defaultPersonalityId: 'neutral', boundaries: [],
        visual,
      },
    };
  });
  return <main className="stage-lab">
    <header><h1>3D 场景预览</h1><label>场景<select aria-label="预览场景" value={id} onChange={(event) => { setId(event.target.value); setSpeaker(-1); setError(''); }}>
      {scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label><label>演示发言<select aria-label="演示发言" value={speaker} onChange={(event) => setSpeaker(Number(event.target.value))}>
      <option value={-1}>无人发言</option>{participants.map((p, i) => <option key={p.agentId} value={i}>{p.persona.name}</option>)}
    </select></label><a href="/">返回工作台</a></header>
    <section className="stage-lab-world stage-3d-ready" aria-label={scene.name}>
      <McStage3D key={id} sceneKind={kind} version={version} participants={participants}
        status={Object.fromEntries(participants.map((p, i) => [p.agentId, { state: speaker === i ? 'speaking' as const : 'idle' as const, action: '' }]))}
        round={{ n: 1, label: '预览' }} totalRounds={1} session="running" messages={[]}
        minds={{}} focus={null} errors={[]} result={null} theme="3D 场景预览"
        muted={true} onFocus={() => {}} onLoaded={(err) => setError(err ?? '')} onStageDone={() => {}} />
      {error && <p role="alert">{error}</p>}
    </section>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Lab />);
import.meta.hot?.dispose(() => root.unmount());
