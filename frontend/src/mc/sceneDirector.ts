import type {Participant,TaskEvent} from '../types';
import {readMs} from '../data/stageRules';
import type {Room,ActorAnchor} from './rooms/debate';
import type {Point} from './rooms/builders';
import {createDirector,type DirectorState,type Input,type Outputs,type Actor,type Action} from './director';

export interface SceneDirectorState extends DirectorState {leadId?:string;tasks:TaskEvent[];away:Record<string,{point:Point;sit:boolean;yaw?:number}>}
export function createSceneDirector(cast:Participant[],room:Room,theme:string,reduced=false):SceneDirectorState {
  const s=createDirector(cast,room,theme,reduced);
  for(const p of cast){const a=s.actors[p.agentId];a.side=p.side??'member';a.sit=room.standingSeats?.includes(p.seatIndex)?0:1;a.position=[...a.anchor.seat];a.ready=true;a.look=cast.find(x=>x.agentId!==p.agentId)?{agent:cast.find(x=>x.agentId!==p.agentId)!.agentId}:'camera';}
  s.boardLabel='等待开场';return {...s,leadId:cast.find(p=>p.isLead)?.agentId,tasks:[],away:{}};
}
const distance=(a:Point,b:Point)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const ease=(n:number)=>n*n*(3-2*n);
/** 接收既有引擎事件：不安排谁说什么，不更改娱乐/情感/工作/辩论引擎。 */
export function stepScene(previous:DirectorState,now:number,inputs:Input[],room:Room,navigate?:(from:Point,to:Point)=>Point[]):{state:SceneDirectorState;outputs:Outputs}{
  const old=previous as SceneDirectorState,s:SceneDirectorState={...old,actors:Object.fromEntries(Object.entries(old.actors).map(([id,a])=>[id,{...a,position:[...a.position] as Point,queue:[...a.queue],active:a.active?{...a.active,from:[...a.active.from] as Point}:null}])),pending:Object.fromEntries(Object.entries(old.pending).map(([id,m])=>[id,{...m}])),bubbles:old.bubbles.map(b=>({...b})),chat:old.chat.map(c=>({...c})),stages:[...old.stages],mics:{...old.mics},tasks:[...(old.tasks??[])],away:{...(old.away??{})}};
  const out:Outputs={sounds:[],particles:[],signals:[],actions:[]};
  s.now=old.session==='paused'||old.session==='stopped'||old.globalError?old.now:now;
  const queue=(a:Actor,...actions:Action[])=>{a.queue.push(...actions);s.enqueued+=actions.length;};
  const chat=(id:string,text:string,privateLine=false)=>{const existing=s.chat.find(c=>c.id===id);if(existing)existing.text=text;else s.chat.push({id,text,color:privateLine?'#AAAAAA':'#e6d8b8',private:privateLine,born:s.now});s.chat=s.chat.slice(-6);};
  const finish=(id:string,closed=false)=>{const m=s.pending[id];if(!m)return;m.complete=true;const who=s.actors[m.speakerId]?.name??(m.speakerId==='user'?'你':'系统');chat(id,m.private?`${who}（私聊）：${m.text}`:`<${who}> ${m.text}${m.cut?'——':''}`,!!m.private);const b=s.bubbles.find(b=>b.id===id);if(b)b.expires=s.now+readMs(m.text);if(m.private?closed||m.kind==='user':['user','system','notice'].includes(m.kind)||!!b)delete s.pending[id];};
  const index=(a:Actor)=>room.anchors.indexOf(a.anchor);
  const go=(a:Actor,point:Point,sit:boolean)=>{
    const ground:Point=[point[0],1,point[2]],path=navigate?navigate(a.position,ground):[ground];
    if(!path.length){chat('path-'+a.id+'-'+s.now,a.name+' 的通道被挡住了，暂时留在原位');return false;}
    a.queue=[];a.active=null;a.ready=false;
    if(a.sit>.1)queue(a,{kind:'standUp'});
    for(const p of path)queue(a,{kind:'walkTo',point:p});if(sit)queue(a,{kind:'sitDown'});queue(a,{kind:'signal',gate:'speech',key:a.id});return true;
  };
  for(const input of inputs){
    if(input.type==='session'){s.session=input.state;continue;}
    if(input.type==='round'){s.round=s.boardRound=input.round;s.label=s.boardLabel=input.label;s.roundReady=true;s.boardTheme=s.theme;s.title={text:'第 '+input.round+' 轮',sub:input.label,color:'#FFFFFF',born:s.now};out.signals.push({gate:'round',key:String(input.round)});}
    else if(input.type==='theme'){s.theme=s.boardTheme=input.title;}
    else if(input.type==='focus')s.focus=input.id;
    else if(input.type==='mind'){const a=s.actors[input.agentId];if(a)a.mind=input.mind;}
    else if(input.type==='status'){
      const a=s.actors[input.agentId];if(!a)continue;const was=a.desired;a.desired=input.state;a.actionText=input.action;if(a.error){a.error=null;if(a.active)a.active.start+=s.now-a.errorAt;}
      if(input.state==='speaking'){
        a.speechSerial++;if(!/私下/.test(input.action)){s.lookSpeaker=a.id;s.lookSpeakerAt=s.now;}s.mics[a.anchor.mic]=!/私下/.test(input.action);
        if(!room.seatedSpeech&&!room.standingSeats?.includes(index(a))&&a.sit>.1&&!/私下/.test(input.action))queue(a,{kind:'standUp'});
        if(room.kind==='classroom'&&room.standingSeats?.includes(index(a))&&!/私下/.test(input.action))queue(a,{kind:'flipScript'});
        if(a.active||a.queue.length){a.ready=false;queue(a,{kind:'signal',gate:'speech',key:a.id,serial:a.speechSerial});}else{a.ready=true;a.preparedSerial=a.speechSerial;a.status='speaking';out.signals.push({gate:'speech',key:a.id});}
      }else if(input.state==='idle'&&was==='speaking'){
        for(const m of Object.values(s.pending))if(m.speakerId===a.id)finish(m.id,true);s.mics[a.anchor.mic]=false;
        if(s.lookSpeaker===a.id)s.lookSpeaker=null;
        if(!room.seatedSpeech&&!room.standingSeats?.includes(index(a))&&!s.away[a.id])queue(a,{kind:'wait',ms:Math.max(300,...s.bubbles.filter(b=>b.speakerId===a.id).map(b=>Number.isFinite(b.expires)?b.expires-s.now:readMs(b.text)),...Object.values(s.pending).filter(m=>m.speakerId===a.id&&!m.private).map(m=>readMs(m.text)))},{kind:'sitDown'});
      }
    }else if(input.type==='message'){
      s.pending[input.message.id]={...input.message};const a=s.actors[input.message.speakerId];
      if(a&&input.message.targetId&&s.actors[input.message.targetId]&&!input.message.private)a.look={agent:input.message.targetId};
      if(input.message.kind!=='speech'||input.message.private)finish(input.message.id);
    }else if(input.type==='message_update'){
      const m=s.pending[input.id];if(m){m.text=input.text;m.cut=input.cut;if(m.private)finish(input.id);}const b=s.bubbles.find(b=>b.id===input.id);if(b){b.text=input.text;b.cut=input.cut;if(input.cut)b.expires=s.now+300;}
    }else if(input.type==='complete')finish(input.id,true);
    else if(input.type==='task'){s.tasks.push(input.task);s.tasks=s.tasks.slice(-12);chat(input.task.id+'-'+input.task.status,'任务：'+input.task.title);}
    else if(input.type==='move'&&room.work){
      const a=s.actors[input.agentId];if(!a)continue;let goal:Point|undefined,sit=false,meeting:ActorAnchor|undefined;
      if(input.to==='desk'){goal=[...a.anchor.seat];sit=true;}
      else if(input.to==='huddle'){const ids=Object.keys(s.actors).sort((a,b)=>Number(b===s.leadId)-Number(a===s.leadId)),q=-Math.PI/2+Math.PI*2*ids.indexOf(a.id)/Math.max(1,ids.length),h=room.work.huddle;goal=[h.center[0]+h.rx*Math.cos(q),1,h.center[2]+h.rz*Math.sin(q)];}
      else if(input.to==='meeting'){meeting=room.work.meeting.find(p=>!Object.entries(s.away).some(([id,v])=>id!==a.id&&v.sit&&distance(v.point,p.seat)<.1));if(meeting){goal=[...meeting.seat];sit=true;}else{const extra=Object.values(s.away).filter(a=>!a.sit).length,o=room.work.overflow??[5,1,11];goal=[o[0]+extra*.9,1,o[2]];}}
      else{const other=s.actors[input.to];if(other)goal=room.work.visits[index(other)];}
      if(goal&&go(a,goal,sit)){const center=input.to==='huddle'?room.work.huddle.center:meeting?room.layout.tables.find(t=>t.id==='meeting-table')!.center:s.actors[input.to]?.position,yaw=center?Math.atan2(center[0]-goal[0],center[2]-goal[2]):a.anchor.homeYaw;if(input.to==='desk')delete s.away[a.id];else s.away[a.id]={point:[...goal],sit,yaw};}
    }else if(input.type==='error'){
      if(input.agentId){const a=s.actors[input.agentId];if(a){a.error=input.message;a.errorAt=s.now;}}else s.globalError=input.message;
    }else if(input.type==='clear_error'){
      if(input.agentId){const a=s.actors[input.agentId];if(a?.error){a.error=null;if(a.active)a.active.start+=s.now-a.errorAt;}}else s.globalError=null;
    }else if(input.type==='result'){s.result=input.result;s.boardResult=true;s.resultStage=3;s.toast=s.now;s.title={text:'本次讨论结束',sub:'讨论总结已生成',color:'#FFFFFF',born:s.now};s.mics={};}
  }
  if(s.session==='paused'||s.session==='stopped'||s.globalError)return {state:s,outputs:out};
  for(const a of Object.values(s.actors)){
    if(a.error)continue;let guard=0,startAt=s.now;
    while(guard++<256){
      if(!a.active){const action=a.queue.shift();if(!action)break;const ms=s.reduced?0:action.kind==='walkTo'?Math.max(80,distance(a.position,action.point)/3*1000):action.kind==='wait'?action.ms:action.kind==='flipScript'?500:action.kind==='signal'?0:300;
        a.active={action,start:startAt,duration:ms,from:[...a.position],fromSit:a.sit,fromYaw:a.yaw};out.actions.push({actor:a.id,kind:action.kind,at:startAt});}
      const active=a.active,action=active.action,t=active.duration?Math.min(1,(s.now-active.start)/active.duration):1,u=ease(t);
      if(action.kind==='standUp'){a.sit=active.fromSit*(1-u);a.position[1]=active.from[1]-.5*active.fromSit*u;}else if(action.kind==='sitDown'){a.sit=active.fromSit+(1-active.fromSit)*u;a.position[1]=active.from[1]+.5*(1-active.fromSit)*u;}
      else if(action.kind==='walkTo'){a.position=active.from.map((v,i)=>v+(action.point[i]-v)*t) as Point;const dx=action.point[0]-active.from[0],dz=action.point[2]-active.from[2];if(Math.hypot(dx,dz)>.01)a.yaw=Math.atan2(dx,dz);}
      if(t<1)break;startAt=active.start+active.duration;a.active=null;s.executed++;
      if(action.kind==='signal'){a.ready=true;a.preparedSerial=Math.max(a.preparedSerial,action.serial??a.speechSerial);out.signals.push({gate:action.gate,key:action.key});}
    }
    if(!a.active&&!a.queue.length){a.ready=true;a.status=a.desired;a.yaw=s.away[a.id]?.yaw??a.anchor.homeYaw;}
    if(a.id!==s.lookSpeaker){const speaker=s.lookSpeaker&&s.actors[s.lookSpeaker],delay=300+(a.id.length*173)%1800;if(speaker&&s.now-s.lookSpeakerAt>delay)a.look={agent:speaker.id};else if(!a.active){const ids=Object.keys(s.actors).filter(id=>id!==a.id),j=Math.floor(s.now/6500+a.id.length)%Math.max(1,ids.length);a.look=ids[j]?{agent:ids[j]}:'camera';}}
    if(!s.reduced&&a.desired==='speaking'&&s.now>a.nextParticle){a.nextParticle=s.now+2800;for(const mood of a.mind?.mood??[])if(mood.value>=7)out.particles.push({actor:a.id,kind:/火|怒|烦/.test(mood.key)?'angry':/压力|焦虑|担/.test(mood.key)?'water':/信心|快乐|好奇/.test(mood.key)?'glint':'smoke'});}
  }
  s.bubbles=s.bubbles.filter(b=>b.expires>s.now);
  for(const m of Object.values(s.pending)){
    if(m.private||!['speech','reply','react'].includes(m.kind)||!m.text||s.bubbles.some(b=>b.id===m.id))continue;
    const a=s.actors[m.speakerId];if(!a?.ready||a.active?.action.kind==='walkTo')continue;
    if(s.bubbles.length>=2){s.bubbles[0].expires=Math.min(s.bubbles[0].expires,s.now+200);continue;}
    s.bubbles.push({id:m.id,speakerId:m.speakerId,header:a.name,text:m.text,born:s.now,expires:m.complete?s.now+readMs(m.text):Infinity,cut:m.cut,react:m.kind==='react'});if(m.complete)delete s.pending[m.id];
  }
  return {state:s,outputs:out};
}
