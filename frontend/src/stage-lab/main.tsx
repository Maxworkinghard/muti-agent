import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SceneStage3D } from '../components/SceneStage3D';
import { McStage3D } from '../components/McStage3D';
import type { SceneCastMember } from '../components/scenePixelActors';
import { SCENES } from '../data/scenes';
import type { Participant } from '../types';
import '../styles.css';
import './style.css';

const scenes = Object.values(SCENES).filter((scene) => scene.model3d || scene.mcStage);
const requested = new URLSearchParams(location.search).get('scene');
const colors = ['#4f9db8', '#b95c51', '#728d55', '#9f7cae', '#cc9954', '#66768b', '#947453', '#638f85'];

function Lab() {
  const [id, setId] = useState(scenes.some((scene) => scene.id === requested) ? requested! : scenes[0]?.id ?? 'roundtable-mc');
  const [speaker, setSpeaker] = useState(-1);
  const [error, setError] = useState('');
  const scene = SCENES[id];
  if (!scene) {
    return <main className="stage-lab">
      <header><h1>3D 场景预览</h1></header>
      <p style={{ padding: '2rem', textAlign: 'center' }}>当前没有可用的 3D 场景</p>
    </main>;
  }
  const actors: SceneCastMember[] = scene.seats.map((seat, i) => ({
    id: 'preview-' + i,
    name: seat.group === 'host' ? '主持人' : `角色 ${i + 1}`,
    seatIndex: i,
    host: seat.group === 'host',
    visual: { skin: '#f1c9a5', hair: '#352c29', shirt: colors[i % colors.length], accent: '#fbf5e4', hairStyle: 'short' },
    pose: speaker === i ? 'speak' : seat.group === 'host' ? 'stand' : 'sit',
  }));
  const participants: Participant[] = actors.map((actor, i) => ({
    agentId: actor.id, seatIndex: i, color: actor.visual.shirt,
    personalityId: 'neutral', isLead: i === 0,
    persona: {
      id: actor.id, name: actor.name!, identity: '预览角色', knowledge: [], thinking: '',
      values: '', personalities: [], defaultPersonalityId: 'neutral', boundaries: [],
      visual: actor.visual,
    },
  }));
  return <main className="stage-lab">
    <header><h1>3D 场景预览</h1><label>场景<select aria-label="预览场景" value={id} onChange={(event) => { setId(event.target.value); setSpeaker(-1); setError(''); }}>
      {scenes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label><label>演示发言<select aria-label="演示发言" value={speaker} onChange={(event) => setSpeaker(Number(event.target.value))}>
      <option value={-1}>无人发言</option>{actors.map((actor, i) => <option key={actor.id} value={i}>{actor.name}</option>)}
    </select></label><a href="/">返回工作台</a></header>
    <section className="stage-lab-world stage-3d-ready" aria-label={scene.name}>
      {scene.mcStage ? (
        <McStage3D key={id} sceneKind={scene.mcStage} participants={participants}
          status={Object.fromEntries(actors.map((a, i) => [a.id, { state: speaker === i ? 'speaking' as const : 'idle' as const, action: '' }]))}
          round={{ n: 1, label: '预览' }} totalRounds={1} session="running" messages={[]}
          minds={{}} focus={null} errors={[]} result={null} theme="3D 场景预览"
          muted={true} onFocus={() => {}} onLoaded={(err) => setError(err ?? '')} onStageDone={() => {}} />
      ) : (
        <SceneStage3D key={id} scene={scene} actors={actors} cast={actors.map((actor) => actor.seatIndex)}
          cue={{ seat: speaker < 0 ? null : speaker, shot: speaker < 0 ? 'wide' : 'speak' }}
          onLoaded={(message) => setError(message ?? '')} onSeatPositions={() => {}} onStageView={() => {}} />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
    <footer>行走：WASD、Shift 加速。飞行：WASD、空格 / Ctrl 升降、滚轮调速。点击画面转向，Esc 返回室内。角色视角可拖动转头。</footer>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Lab />);
import.meta.hot?.dispose(() => root.unmount());
