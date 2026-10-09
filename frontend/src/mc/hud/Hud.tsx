import type {Participant,McSceneKind} from '../../types';
import {actionBar,teamColor,type DirectorState} from '../director';
import {QUALITY_LABEL,type Quality} from '../post';
export function identity(p:Participant,_cast:Participant[],_kind:McSceneKind='roundtable'){return '成员 '+(p.seatIndex+1);}
export function Hud({kind='roundtable',s,cast,view,setView,reset,anchor,hover,credit,quality,setQuality,freeControl}:{kind?:McSceneKind;s:DirectorState;cast:Participant[];view:string;setView:(v:string)=>void;reset:()=>void;anchor:(id:string,kind:string,el:HTMLElement|null)=>void;hover:{id:string;x:number;y:number}|null;credit:string|null;quality:Quality;setQuality:(q:Quality)=>void;freeControl:{active:boolean;locked:boolean}}){
  const age=s.title?s.now-s.title.born:99999,titleOpacity=age<500?age/500:age<3000?1:age<4000?1-(age-3000)/1000:0;const me=s.bubbles.find(b=>b.speakerId===view),person=hover?s.actors[hover.id]:null;
  const coarse=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
  // 圆桌样板的飞行操作持续可见。
  return <div className="mc-hud">
    {credit&&<span className="mc-pack-credit">{credit}</span>}
    <nav className="mc-views" aria-label="舞台视角"><button className="mc-button" aria-pressed={view==='overview'} onClick={()=>setView('overview')}>全景</button><button className="mc-button" aria-pressed={view==='judge'} onClick={()=>setView('judge')}>观摩位</button><select className="mc-button" aria-label="人物视角" value={cast.some(p=>p.agentId===view)?view:''} onChange={e=>setView(e.target.value)}><option value="" disabled>人物视角 ▾</option>{cast.map(p=><option key={p.agentId} value={p.agentId}>{p.persona.name} · {identity(p,cast,kind)}</option>)}</select><button className="mc-button" aria-pressed={view==='free'} title={coarse?'自由视角需要键盘':undefined} onClick={()=>setView(coarse?'__blocked__':'free')}>自由视角</button><button className="mc-button" onClick={reset}>回到默认</button><select className="mc-button" aria-label="画质" value={quality} onChange={e=>setQuality(e.target.value as Quality)}>{(['high','medium','low'] as const).map(q=><option key={q} value={q}>画质：{QUALITY_LABEL[q]}</option>)}</select></nav>
    {view==='free'&&<div className="mc-free-hint mc-flight-hint">{!freeControl.active&&<>点击画面继续控制 · </>}WASD 飞行 · 空格/Ctrl 升降 · Shift 加速 · {freeControl.locked?'鼠标转向':'拖动鼠标转向'} · 滚轮调速 · Esc 退出</div>}
    {view==='__blocked__'&&<div className="mc-free-hint">自由视角需要键盘，在电脑上使用</div>}
    {cast.map(p=><div key={p.agentId} ref={el=>anchor(p.agentId,'name',el)} className="mc-name" style={{display:view===p.agentId?'none':undefined}}>{p.persona.name}{s.actors[p.agentId]?.error&&<b className="mc-error-mark"> !</b>}</div>)}
    {s.bubbles.filter(b=>b.speakerId!==view).map(b=><div key={b.id} ref={el=>anchor(b.speakerId,'bubble',el)} className="mc-tooltip mc-bubble" style={{opacity:Math.min(1,Math.max(0,(b.expires-s.now)/200))}}><div style={{color:teamColor(s.actors[b.speakerId]?.side??'host')}}>{b.header}</div><p>{b.text}{b.cut?'——':''}</p></div>)}
    <div className="mc-chat" aria-live="polite">{s.chat.filter(c=>s.now-c.born<10500).map(c=><div key={c.id} style={{color:c.color,fontStyle:c.private?'italic':undefined,opacity:Math.min(1,(10500-(s.now-c.born))/500)}}>{c.text}</div>)}</div>
    {s.title&&titleOpacity>0&&<div className="mc-title" style={{color:s.title.color,opacity:titleOpacity}}><strong>{s.title.text}</strong><div>{s.title.sub}</div></div>}
    {s.toast!==null&&s.now-s.toast<6000&&<aside className="mc-toast"><span>📖</span><div>讨论结束<small>讨论总结已生成</small></div></aside>}
    {me&&<div className="mc-own-speech"><span style={{color:teamColor(s.actors[view]?.side??'host')}}>{s.actors[view]?.name}：</span>{me.text}{me.cut?'——':''}</div>}
    <div className="mc-actionbar">{actionBar(s)}</div>
    {s.session==='paused'&&(view==='free'?<div className="mc-paused-camera">讨论已暂停 · 镜头可移动</div>:<div className="mc-paused"><strong>已暂停</strong></div>)}
    {s.actors[view]?.error&&<div className="mc-offline-view"/>}
    {s.globalError&&<div className="mc-disconnect"><strong>连接中断</strong><p>{s.globalError}</p><span>在右侧点“重试”</span></div>}
    {person&&hover&&<div className="mc-tooltip mc-hover" style={{left:hover.x,top:hover.y}}><strong>{person.name} · {identity(cast.find(p=>p.agentId===person.id)!,cast,kind)}</strong><p>{person.actionText}</p><p>{person.mind?.emoji} {person.mind?.label??'平静'}</p><p>心里：{person.mind?.inner??'暂无'}</p><p>立场：{person.mind?.stance??'尚未表态'}</p><p>打算：{person.mind?.plan??'暂无'}</p></div>}
  </div>;
}
