import { useRef, useState } from 'react';
import type { ModeId, SceneDef, Seat } from '../types';
import { MODES } from '../data/modes';

export interface SceneImagePick {
  id: string;
  name: string;
  image: string;
}

const MAX_SEATS = 10;

/** 把上传的图片裁成舞台的 3:2 比例，缩到最宽 1536，存成 dataURL */
async function toSceneImage(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('图片读取失败'));
      i.src = url;
    });
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > 1.5) sw = sh * 1.5; else sh = sw / 1.5;
    const w = Math.min(1536, Math.round(sw));
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w / 1.5);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    // PNG 太大时存不进浏览器，改用 JPEG
    return png.length < 1_500_000 ? png : c.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 添加或编辑自定义场景：上传底图，在图上点出座位 */
export function SceneEditor({ initial, defaultMode, onSave, onDelete, onClose, picks }: {
  initial?: SceneDef;
  defaultMode: ModeId;
  onSave: (s: SceneDef) => void;
  onDelete?: () => void;
  onClose: () => void;
  /** 已有像素场景。只在演示里传入，用来点选底图，不走上传。 */
  picks?: SceneImagePick[];
}) {
  const [image, setImage] = useState(initial?.image ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [mode, setMode] = useState<ModeId>(initial?.recommendedMode ?? defaultMode);
  const [seats, setSeats] = useState<Seat[]>(initial?.seats ?? []);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    if (!f.type.startsWith('image/')) { setErr('请选择图片文件'); return; }
    try {
      setImage(await toSceneImage(f));
      setErr('');
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 16));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (seats.length >= MAX_SEATS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(2);
    const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(2);
    setSeats([...seats, { x, y }]);
  };

  const ok = image && name.trim() && seats.length >= 2;
  const save = () => {
    if (!ok) return;
    onSave({
      id: initial?.id ?? 'custom-' + Date.now().toString(36),
      name: name.trim(),
      image,
      description: desc.trim() || '自己添加的场景',
      recommendedMode: mode,
      maxSeats: seats.length,
      seats: seats.map((s) => ({
        x: s.x,
        y: s.y,
        ...(s.group ? { group: s.group } : {}),
        ...(s.role?.trim() ? { role: s.role.trim() } : {}),
        ...(s.identity?.trim() ? { identity: s.identity.trim() } : {}),
      })),
      custom: true,
    });
  };

  return (
    <div className="codex-overlay" onClick={onClose}>
      <article className={'codex-detail scene-editor' + (picks?.length ? ' has-picks' : '')} data-demo="scene-editor" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <strong>{initial ? '编辑场景' : '添加场景'}</strong>
            <small>选一张底图，在图上点出座位；每个座位写上角色，先后就是入座顺序</small>
          </div>
          <button className="px-btn tiny" onClick={onClose}>✕</button>
        </header>

        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
        {image ? (
          <div className="se-canvas" data-demo="scene-canvas" onClick={place}>
            <img src={image} alt="" draggable={false} />
            {seats.map((s, i) => (
              <button
                key={i}
                className="se-seat"
                style={{ left: s.x + '%', top: s.y + '%' }}
                title="点一下删掉这个座位"
                onClick={(e) => { e.stopPropagation(); setSeats(seats.filter((_, k) => k !== i)); }}
              >{i + 1}</button>
            ))}
          </div>
        ) : (
          <>
            <button className="se-drop" data-demo="scene-upload" onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
              <b>＋ 上传场景图</b>
              <small>点这里选图，或把图片拖进来。会自动裁成 3:2，俯视角的像素图效果最好</small>
            </button>
            {!!picks?.length && (
              <div className="se-picks" data-demo="scene-picks">
                <span>或选一张已有像素图</span>
                <div>
                  {picks.map((p) => (
                    <button key={p.id} type="button" data-demo="scene-pick" data-demo-pick={p.id} onClick={() => { setImage(p.image); setErr(''); if (!name) setName(''); }}>
                      <img src={p.image} alt={p.name} />
                      <small>{p.name}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div className="se-tools">
          <span className="hint">座位 {seats.length}/{MAX_SEATS}{image && seats.length < 2 && ' · 至少点 2 个座位'}</span>
          {image && <button className="px-btn tiny" onClick={() => fileRef.current?.click()}>换图</button>}
          {seats.length > 0 && <button className="px-btn tiny" onClick={() => setSeats(seats.slice(0, -1))}>撤销座位</button>}
          {seats.length > 0 && <button className="px-btn tiny" onClick={() => setSeats([])}>清空座位</button>}
        </div>
        {err && <p className="hint se-err">{err}</p>}

        <div className="se-form">
          <label>名称<input className="px-input" data-demo="scene-name" value={name} maxLength={16} placeholder="比如：宿舍楼顶" onChange={(e) => setName(e.target.value)} /></label>
          <label>描述<input className="px-input" data-demo="scene-desc" value={desc} maxLength={40} placeholder="一句话介绍这个场景" onChange={(e) => setDesc(e.target.value)} /></label>
          <label>推荐模式
            <select data-demo="scene-mode" value={mode} onChange={(e) => setMode(e.target.value as ModeId)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        {seats.length > 0 && (
          <div className="se-roles" data-demo="scene-roles">
            <div className="se-role se-role-head"><b>席位</b><span>角色</span><span>身份</span></div>
            {seats.map((s, i) => (
              <div className="se-role" key={i}>
                <b>席 {i + 1}</b>
                <input
                  className="px-input"
                  data-demo={'seat-role-' + i}
                  value={s.role ?? ''}
                  maxLength={8}
                  placeholder={i === 0 ? '主持人' : i === 1 ? '受访者' : '角色'}
                  onChange={(e) => setSeats(seats.map((seat, k) => k === i ? { ...seat, role: e.target.value } : seat))}
                />
                <input
                  className="px-input"
                  data-demo={'seat-identity-' + i}
                  value={s.identity ?? ''}
                  maxLength={16}
                  placeholder="一句话身份"
                  onChange={(e) => setSeats(seats.map((seat, k) => k === i ? { ...seat, identity: e.target.value } : seat))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="se-foot">
          {onDelete && <button className="px-btn danger" onClick={onDelete}>删除场景</button>}
          <button className="px-btn primary" data-demo="scene-save" disabled={!ok} onClick={save}>保存场景</button>
        </div>
      </article>
    </div>
  );
}
