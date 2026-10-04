import { useEffect, useMemo, useRef, useState } from 'react';
import type { Draft } from '../App';
import type { Persona, PersonaVisual, SceneDef, SessionConfig, Side } from '../types';
import { SCENE_LIST, sceneById } from '../data/scenes';
import { DEBATE_CHAR_LIMIT, DEBATE_DEFAULT_FORMAT, DEBATE_FORMATS, modeById } from '../data/modes';
import { AGENT_COLORS, checkPersona } from '../data/personas';
import { parseSceneImport } from '../data/sceneImport';
import { engineFor } from '../engines/registry';
import { PixelAvatar } from './PixelAvatar';
import { SceneEditor } from './SceneEditor';

/**
 * Demo cinematic preferred casts per scene recommendedMode.
 * 辩论室 / 教室 → rational：专业（阿澜数学、灰先生认识论、K 逻辑）+ 更接地气的南姐 + 搅局追问者老苏。
 */
const CAST_BY_MODE: Record<string, string[]> = {
  rational: ['阿澜', '灰先生', '南姐', '老苏', 'K'],
  entertainment: ['阿实', '老方', '小正', '阿冷', '小林'],
  product: ['积木', '放大镜', '算盘', '扳手', '照妖镜'],
};

/** Settle scene for the theme debate (tour still visits every 2D scene first). */
export const DEMO_SETTLE_SCENE = 'debate';

const SIDE_LABEL = { pro: '正方', con: '反方', host: '主持' } as const;

const SEAT_LOOKS: PersonaVisual[] = [
  { skin: '#f1c9a5', hair: '#2c241c', shirt: '#3d4f7c', accent: '#e8d48a', hairStyle: 'side', extras: ['brows', 'glasses'] },
  { skin: '#e8b892', hair: '#6b3a2a', shirt: '#c47a4a', accent: '#fbf5e4', hairStyle: 'bun', extras: ['happy'] },
];

export function DemoCollage({
  draft,
  personas,
  onChangeScene,
  onStart,
  allowAdd = false,
  allowImport = false,
  customScenes = [],
  onSaveScene,
  importedIds,
  onImportPersonas,
}: {
  draft: Draft;
  personas: Persona[];
  onChangeScene: (sceneId: string) => void;
  onStart: (cfg: SessionConfig) => void;
  /** 演示里从这张配置页打开产品自带的添加场景。默认辩论片不传。 */
  allowAdd?: boolean;
  /** ?demo=import：场景 JSON 和人物 JSON 各导入一次。默认辩论片不传。 */
  allowImport?: boolean;
  customScenes?: SceneDef[];
  onSaveScene?: (s: SceneDef) => void;
  importedIds?: Set<string>;
  onImportPersonas?: (list: Persona[]) => void;
}) {
  const scenes2d = useMemo(() => SCENE_LIST.filter((s) => !s.model3d), []);
  const shownScenes = useMemo(
    () => (allowAdd || allowImport) ? [...scenes2d, ...customScenes.filter((s) => !s.model3d)] : scenes2d,
    [scenes2d, customScenes, allowAdd, allowImport],
  );
  const scene = sceneById(draft.sceneId);
  const [addingScene, setAddingScene] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const personaFileRef = useRef<HTMLInputElement>(null);
  const importedPeople = useMemo(
    () => (allowImport && importedIds ? personas.filter((p) => importedIds.has(p.id)) : []),
    [allowImport, importedIds, personas],
  );
  const seatCast = scene.seats
    .map((seat, index) => ({ seat, index }))
    .filter(({ seat }) => !!seat.role?.trim());
  // 与 SetupCast 相同：人物没写 modes 时所有模式可用；写了就只在对应模式出现。
  // 场景本身不另存一份名单，可用人物 = 该场景 recommendedMode 下的模式人物。
  const modeId = scene.recommendedMode;
  const modeName = modeById(modeId).name;
  const prefer = CAST_BY_MODE[modeId] ?? CAST_BY_MODE.rational;
  const available = useMemo(() => {
    const pool = personas.filter((p) => !p.modes || p.modes.includes(modeId));
    const rank = (name: string) => {
      const i = prefer.indexOf(name);
      return i === -1 ? 100 : i;
    };
    return [...pool].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'zh'));
  }, [personas, modeId, prefer]);

  const [order, setOrder] = useState<string[]>([]);
  const [sides, setSides] = useState<Record<string, Side>>({});

  useEffect(() => {
    const ids = new Set(available.map((p) => p.id));
    setOrder((cur) => cur.filter((id) => ids.has(id)));
    setSides((cur) => {
      const next: Record<string, Side> = {};
      for (const id of Object.keys(cur)) if (ids.has(id)) next[id] = cur[id];
      return next;
    });
  }, [available]);

  const isRational = modeId === 'rational';
  const sideCount = (s: Side) => order.filter((id) => sides[id] === s).length;
  const sideLimit = (s: Side) => (s === 'host' ? 1 : 3);
  // 与 SetupCast.nextSide 相同，席位满了才用。
  const nextSide = (): Side | undefined => {
    if (!isRational) return undefined;
    if (sideCount('pro') <= sideCount('con') && sideCount('pro') < 3) return 'pro';
    if (sideCount('con') < 3) return 'con';
    if (sideCount('host') < 1) return 'host';
    return undefined;
  };
  // 入座先给一个看得见的阵营（按钮立刻显示 正方/反方/主持）。
  // 顺序跟理性阵容点击顺序一致：阿澜、灰先生、南姐、老苏、K。
  // 阿澜直接正方（数学教育，AI 放大数学）；南姐直接反方（关怀/代价，不拿她去转主持或正方）；
  // K 直接主持（逻辑控场）。灰先生、老苏先落在正方，只差一次 cycle 到反方，避免 正→反→主持 连转。
  // 最终站位仍只来自卡片上的 cycleSide，不在 start() 里改写。
  const OPENING: Side[] = ['pro', 'pro', 'con', 'pro', 'host'];

  const toggle = (id: string) => {
    if (order.includes(id)) {
      setOrder(order.filter((x) => x !== id));
      setSides((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      return;
    }
    let side = isRational ? OPENING[order.length] : undefined;
    if (side && sideCount(side) >= sideLimit(side)) side = nextSide();
    if (isRational && !side) return;
    setOrder([...order, id]);
    if (side) setSides((cur) => ({ ...cur, [id]: side }));
  };

  // 与 SetupCast.cycleSide 相同：正方 → 反方 → 主持，正/反最多 3，主持最多 1。
  const cycleSide = (id: string) => {
    const list: Side[] = ['pro', 'con', 'host'];
    const cur = sides[id] ?? 'pro';
    for (let k = 1; k <= 3; k++) {
      const s = list[(list.indexOf(cur) + k) % 3];
      const limit = s === 'host' ? 1 : 3;
      if (s === cur || sideCount(s) < limit) {
        setSides({ ...sides, [id]: s });
        return;
      }
    }
  };

  const debateOk = !isRational || (sideCount('pro') >= 1 && sideCount('con') >= 1);
  const canStart = order.length >= 2 && debateOk;
  const start = () => {
    if (!canStart) return;
    const used = { pro: 0, con: 0, host: 0 };
    const participants = order.map((id, i) => {
      const persona = available.find((p) => p.id === id)!;
      const side = isRational ? sides[id] : undefined;
      let seatIndex = i;
      if (isRational && side && scene.seats.some((s) => s.group)) {
        const seats = scene.seats.map((s, k) => ({ s, k })).filter(({ s }) => s.group === side);
        seatIndex = seats[used[side]]?.k ?? i;
        used[side]++;
      }
      return {
        agentId: id,
        seatIndex,
        color: persona.visual.shirt ?? AGENT_COLORS[i % 8],
        personalityId: persona.defaultPersonalityId,
        persona,
        side,
      };
    });
    const format = DEBATE_FORMATS.find((f) => f.id === DEBATE_DEFAULT_FORMAT) ?? DEBATE_FORMATS[1];
    const engineDefaults = engineFor(modeId).defaults;
    onStart({
      sessionId: 's-' + Date.now().toString(36),
      mode: modeId,
      sceneId: draft.sceneId,
      theme: { title: draft.theme.trim() },
      maxRounds: isRational ? format.rounds : modeId === 'entertainment' ? 7 + Math.floor(Math.random() * 2) : modeById(modeId).roundLabels.length,
      maxChars: isRational ? DEBATE_CHAR_LIMIT : undefined,
      participants,
      engineOptions: {
        ...engineDefaults,
        // demo cinematic：略快一点，辩论仍要听清论点
        pace: typeof engineDefaults.pace === 'number' ? Math.min(Number(engineDefaults.pace), modeId === 'rational' ? 0.4 : 0.88) : 0.88,
        // 只在这场演示里：同一人连续说出口的几段之间停 2s，换人发言不加
        ...(modeId === 'rational' ? { sameSpeakerGapMs: 2000 } : {}),
      },
      createdAt: new Date().toISOString(),
    });
  };

  const readJson = async (f: File) => JSON.parse((await f.text()).replace(/^\uFEFF/, ''));
  const onSceneFile = async (f: File) => {
    try {
      const parsed = parseSceneImport(await readJson(f));
      if (!parsed.scene) { setImportMsg(parsed.error || '场景导入失败'); return; }
      onSaveScene?.(parsed.scene);
      onChangeScene(parsed.scene.id);
      setImportMsg('');
    } catch {
      setImportMsg('场景文件不是合法 JSON');
    }
  };
  const onPeopleFile = async (f: File) => {
    let data: unknown;
    try { data = await readJson(f); }
    catch { setImportMsg('人物文件不是合法 JSON'); return; }
    const arr = Array.isArray(data) ? data : [data];
    const ok = arr.flatMap((raw, i) => {
      const c = checkPersona(raw, i, f.name);
      return c.persona ? [c.persona] : [];
    });
    if (!ok.length) { setImportMsg('人物文件里没有可用人物'); return; }
    onImportPersonas?.(ok);
    setImportMsg('');
  };

  return (
    <main className={'setup demo-collage' + ((allowAdd || allowImport) ? ' demo-can-add' : '')} data-demo="collage" data-demo-mode={modeId} data-demo-scene-name={scene.name} data-demo-imported={importedPeople.map((p) => p.name).join(',')}>
      <section className="panel">
        <h2><b>01</b> 选择场景 <small>像素场景</small></h2>
        <div className="scene-grid">
          {shownScenes.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'scene-card' + (s.id === draft.sceneId ? ' on' : '') + (s.custom ? ' custom' : '')}
              data-demo-scene={s.id}
              data-demo-scene-name={s.name}
              data-demo={s.custom ? 'scene-card' : undefined}
              onClick={() => onChangeScene(s.id)}
            >
              <img src={s.previewImage ?? s.image} alt={s.name} />
              <div className="scene-meta">
                <strong>{s.name}</strong>
                <span>{s.maxSeats} 席</span>
                {s.custom && <i className="mine">自定义</i>}
              </div>
              {s.custom && <small>{s.description}</small>}
            </button>
          ))}
          {allowAdd && customScenes.length === 0 && (
            <button type="button" className="scene-card scene-add" data-demo="add-scene" onClick={() => setAddingScene(true)}>
              <b>＋</b>
              <strong>添加场景</strong>
              <small>上传一张图，点出座位就能用</small>
            </button>
          )}
          {allowImport && customScenes.length === 0 && (
            <button type="button" className="scene-card scene-add" data-demo="import-scene" onClick={() => sceneFileRef.current?.click()}>
              <b>＋</b>
              <strong>导入场景</strong>
              <small>选择场景 JSON</small>
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>
          <b>02</b> {seatCast.length ? '场景席位' : '选择人物'} <small>
            {seatCast.length
              ? `${scene.name} · ${modeName} · 这个场景自带 ${seatCast.length} 个角色`
              : `${scene.name} · ${modeName} · 已选 ${order.length}/${available.length}`}
            {!seatCast.length && isRational && `（正方 ${sideCount('pro')}/3 · 反方 ${sideCount('con')}/3 · 主持 ${sideCount('host')}/1）`}
          </small>
          {allowImport && importedPeople.length === 0 && (
            <button type="button" className="px-btn tiny import-plus" data-demo="import-personas" onClick={() => personaFileRef.current?.click()}>＋ 导入人物</button>
          )}
        </h2>
        {importMsg && <p className="hint" data-demo="import-error">{importMsg}</p>}
        <div
          className="persona-grid demo-persona-grid"
          data-demo-personas={importedPeople.length ? importedPeople.map((p) => p.name).join(',') : seatCast.length ? seatCast.map(({ seat }) => seat.role).join(',') : available.map((p) => p.name).join(',')}
          data-demo={importedPeople.length ? 'imported-cast' : seatCast.length ? 'seat-cast' : undefined}
          style={{ ['--cols' as string]: String(Math.max(importedPeople.length || seatCast.length || available.length, 1)) }}
        >
          {importedPeople.length > 0 && importedPeople.map((p, index) => (
            <article
              key={p.id}
              className="persona-card demo-persona-card on"
              style={{ ['--ac' as string]: p.visual.shirt }}
              data-demo="imported-persona"
              data-demo-persona={p.name}
            >
              <div className="pc-top">
                <div className="pc-avatar"><PixelAvatar v={p.visual} size={44} /></div>
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.identity}</small>
                </div>
                <i className="mine">导入</i>
              </div>
              <dl>
                <dt>身份</dt><dd>{p.identity || '—'}</dd>
                <dt>知识</dt><dd>{p.knowledge.join(' / ') || '—'}</dd>
                <dt>思想</dt><dd>{p.thinking || '—'}</dd>
                <dt>价值</dt><dd>{p.values || '—'}</dd>
                <dt>性格</dt><dd>{(() => { const per = p.personalities.find((x) => x.id === p.defaultPersonalityId) ?? p.personalities[0]; return per ? (per.behavior ? `${per.label}，${per.behavior}` : per.label) : '—'; })()}</dd>
              </dl>
            </article>
          ))}
          {importedPeople.length === 0 && seatCast.length > 0 && seatCast.map(({ seat, index }) => (
            <article
              key={scene.id + '-' + index}
              className="persona-card demo-persona-card on"
              style={{ ['--ac' as string]: SEAT_LOOKS[index % SEAT_LOOKS.length].shirt }}
              data-demo="seat-role"
              data-demo-persona={seat.role}
            >
              <div className="pc-top">
                <div className="pc-avatar"><PixelAvatar v={SEAT_LOOKS[index % SEAT_LOOKS.length]} size={44} /></div>
                <div>
                  <strong>{seat.role}</strong>
                  <small>{seat.identity || '这个席位的角色'}</small>
                </div>
                <span className="pc-no">{index + 1}</span>
              </div>
              <dl>
                <dt>席位</dt><dd>第 {index + 1} 席</dd>
                <dt>身份</dt><dd>{seat.identity || '—'}</dd>
              </dl>
            </article>
          ))}
          {importedPeople.length === 0 && seatCast.length === 0 && available.map((p) => {
            const on = order.includes(p.id);
            const n = on ? order.indexOf(p.id) + 1 : 0;
            const side = sides[p.id];
            return (
              <article
                key={p.id}
                className={'persona-card demo-persona-card' + (on ? ' on' : '')}
                style={{ ['--ac' as string]: p.visual.shirt }}
                data-demo-persona={p.name}
                data-demo-side-value={on && side ? side : undefined}
                onClick={() => toggle(p.id)}
              >
                <div className="pc-top">
                  <div className="pc-avatar"><PixelAvatar v={p.visual} size={44} /></div>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.identity}</small>
                  </div>
                  {on && <span className="pc-no">{n}</span>}
                </div>
                <dl>
                  <dt>知识</dt><dd>{p.knowledge.join(' / ')}</dd>
                  <dt>思想</dt><dd>{p.thinking}</dd>
                  <dt>价值</dt><dd>{p.values}</dd>
                </dl>
                {on && isRational && side && (
                  <div className="pc-actions">
                    <button
                      type="button"
                      className={'px-btn pc-side side-' + side}
                      data-demo-side={p.name}
                      data-demo-side-value={side}
                      onClick={(e) => { e.stopPropagation(); cycleSide(p.id); }}
                    >
                      {SIDE_LABEL[side]} ⇄
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <footer className="setup-foot">
        <span className="hint">「{draft.theme || '（主题）'}」· {scene.name}</span>
        <button className="px-btn primary" data-demo="start" disabled={!canStart} onClick={start}>开始</button>
      </footer>
      {allowImport && (
        <>
          <input ref={sceneFileRef} type="file" accept=".json,application/json" hidden data-demo="scene-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSceneFile(f); e.target.value = ''; }} />
          <input ref={personaFileRef} type="file" accept=".json,application/json" hidden data-demo="persona-file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPeopleFile(f); e.target.value = ''; }} />
        </>
      )}
      {allowAdd && addingScene && (
        <SceneEditor
          defaultMode="entertainment"
          picks={scenes2d.map((s) => ({ id: s.id, name: s.name, image: s.image }))}
          onClose={() => setAddingScene(false)}
          onSave={(s) => {
            onSaveScene?.(s);
            onChangeScene(s.id);
            setAddingScene(false);
          }}
        />
      )}
    </main>
  );
}
