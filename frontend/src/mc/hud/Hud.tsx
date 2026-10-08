import type {Participant,McSceneKind} from '../../types';
import {role,sideName} from '../../engines/rational/schedule';
import {actionBar,teamColor,type DirectorState} from '../director';
import {QUALITY_LABEL,type Quality} from '../post';
export function identity(p:Participant,cast:Participant[],kind:McSceneKind='debate'){if(kind==='debate')return p.side==='host'?'主持人':sideName(p)+role(cast.filter(x=>x.side===p.side),p);const seat=p.seatIndex+1;return kind==='podcast'?(seat===1?'主持人':'嘉宾'):kind==='classroom'?(seat===1?'讲台':'学生席 '+(seat-1)):kind==='office'?(p.isLead?'负责人':'工位 '+seat):'成员 '+seat;}
/** 名字牌上只标有意义的身份（辩手位、主持、嘉宾、负责人、讲台）；“成员 3”“工位 5”这类编号不贴在人头上，悬停卡片里仍有。 */
function showRole(p:Participant,cast:Participant[],kind:McSceneKind){const role=identity(p,cast,kind);if(kind==='debate'||kind==='podcast')return role;if(kind==='office')return p.isLead?role:null;if(kind==='classroom')return p.seatIndex===0?role:null;return null;}
const roleColor=(kind:McSceneKind)=>({office:'#d98a4e',classroom:'#6f9e6b',podcast:'#c0625a'} as Record<string,string>)[kind]??'#5f82b0';
export function Hud({kind='debate',s,cast,view,setView,reset,anchor,hover,credit,quality,setQuality,freeControl}:{kind?:McSceneKind;s:DirectorState;cast:Participant[];view:string;setView:(v:string)=>void;reset:()=>void;anchor:(id:string,kind:string,el:HTMLElement|null)=>void;hover:{id:string;x:number;y:number}|null;credit:string|null;quality:Quality;setQuality:(q:Quality)=>void;freeControl:{active:boolean;locked:boolean}}){
  const age=s.title?s.now-s.title.born:99999,titleOpacity=age<500?age/500:age<3000?1:age<4000?1-(age-3000)/1000:0;const me=s.bubbles.find(b=>b.speakerId===view),person=hover?s.actors[hover.id]:null;
  const coarse=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
  // 飞行操作持续可见；保留原来带人物与碰撞的评委行走视角。
  return <div className="mc-hud">
    {credit&&<span className="mc-pack-credit">{credit}</span>}
    <nav className="mc-views" aria-label="舞台视角"><button className="mc-button" aria-pressed={view==='overview'} onClick={()=>setView('overview')}>全景</button><button className="mc-button" aria-pressed={view==='judge'} onClick={()=>setView('judge')}>{kind==='debate'?'评委席':'观摩位'}</button><select className="mc-button" aria-label="人物视角" value={view==='walk'||cast.some(p=>p.agentId===view)?view:''} onChange={e=>setView(e.target.value)}><option value="" disabled>人物视角 ▾</option>{cast.map(p=><option key={p.agentId} value={p.agentId}>{p.persona.name} · {identity(p,cast,kind)}</option>)}{kind==='debate'&&<option value="walk">评委行走 · F5 切人称</option>}</select><button className="mc-button" aria-pressed={view==='free'} title={coarse?'自由视角需要键盘':undefined} onClick={()=>setView(coarse?'__blocked__':'free')}>自由视角</button><button className="mc-button" onClick={reset}>回到默认</button><select className="mc-button" aria-label="画质" value={quality} onChange={e=>setQuality(e.target.value as Quality)}>{(['high','medium','low'] as const).map(q=><option key={q} value={q}>画质：{QUALITY_LABEL[q]}</option>)}</select></nav>
    {view==='free'&&<div className="mc-free-hint mc-flight-hint">{!freeControl.active&&<>点击画面继续控制 · </>}WASD 飞行 · 空格/Ctrl 升降 · Shift 加速 · {freeControl.locked?'鼠标转向':'拖动鼠标转向'} · 滚轮调速 · Esc 退出</div>}
    {view==='walk'&&<div className="mc-free-hint">WASD 走动 · 拖动鼠标看四周 · 滚轮远近 · F5 切人称 · Esc 退出</div>}
    {view==='__blocked__'&&<div className="mc-free-hint">自由视角需要键盘，在电脑上使用</div>}
    {view==='walk'&&<div ref={el=>anchor('walk','name',el)} className="mc-name"><span style={{color:'#FFAA00'}}>[评委]</span> 你</div>}
    {cast.map(p=>{const role=showRole(p,cast,kind);return <div key={p.agentId} ref={el=>anchor(p.agentId,'name',el)} className="mc-name" style={{display:view===p.agentId?'none':undefined}}>{role&&<span className="mc-role" style={{background:kind==='debate'?teamColor(p.side??'host'):roleColor(kind)}}>{role}</span>}{p.persona.name}{s.actors[p.agentId]?.error&&<b className="mc-error-mark"> !</b>}</div>;})}
    {s.bubbles.filter(b=>b.speakerId!==view).map(b=><div key={b.id} ref={el=>anchor(b.speakerId,'bubble',el)} className="mc-tooltip mc-bubble" style={{opacity:Math.min(1,Math.max(0,(b.expires-s.now)/200))}}><div style={{color:teamColor(s.actors[b.speakerId]?.side??'host')}}>{b.header}</div><p>{b.text}{b.cut?'——':''}</p></div>)}
    <div className="mc-chat" aria-live="polite">{s.chat.filter(c=>s.now-c.born<10500).map(c=><div key={c.id} style={{color:c.color,fontStyle:c.private?'italic':undefined,opacity:Math.min(1,(10500-(s.now-c.born))/500)}}>{c.text}</div>)}</div>
    {s.title&&titleOpacity>0&&<div className="mc-title" style={{color:s.title.color,opacity:titleOpacity}}><strong>{s.title.text}</strong><div>{s.title.sub}</div></div>}
    {s.toast!==null&&s.now-s.toast<6000&&<aside className="mc-toast"><span>📖</span><div>{kind==='debate'?'辩论结束':'讨论结束'}<small>讨论总结已生成</small></div></aside>}
    {me&&<div className="mc-own-speech"><span style={{color:teamColor(s.actors[view]?.side??'host')}}>{s.actors[view]?.name}：</span>{me.text}{me.cut?'——':''}</div>}
    <div className="mc-actionbar">{kind==='debate'?actionBar(s):s.session==='waiting'?'说一句话，讨论就开始':actionBar(s)}</div>
    {s.session==='paused'&&(view==='free'?<div className="mc-paused-camera">{kind==='debate'?'辩论':'讨论'}已暂停 · 镜头可移动</div>:<div className="mc-paused"><strong>已暂停</strong></div>)}
    {s.actors[view]?.error&&<div className="mc-offline-view"/>}
    {s.globalError&&<div className="mc-disconnect"><strong>连接中断</strong><p>{s.globalError}</p><span>在右侧点“重试”</span></div>}
    {person&&hover&&<div className="mc-tooltip mc-hover" style={{left:hover.x,top:hover.y}}><strong>{person.name} · {identity(cast.find(p=>p.agentId===person.id)!,cast,kind)}</strong><p>{person.actionText}</p><p>{person.mind?.emoji} {person.mind?.label??'平静'}</p><p>心里：{person.mind?.inner??'暂无'}</p><p>立场：{person.mind?.stance??'尚未表态'}</p><p>打算：{person.mind?.plan??'暂无'}</p></div>}
  </div>;
}
