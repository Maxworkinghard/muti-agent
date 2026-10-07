import type {AgentState,ChatMessage,DiscussionResult,EngineEvent,MindView,Participant} from '../types';
import {readMs} from '../data/stageRules';
import type {Room,ActorAnchor} from './rooms/debate';
import type {Point} from './rooms/builders';
export type Session='waiting'|'running'|'paused'|'finished'|'stopped';
export type Target='camera'|'bell'|'lectern'|{agent:string};
/** mic：按自己话筒底座的按钮；nextRound：主持按讲台上的「下一轮」；tapBell：拍讲台上的桌铃；flipScript：翻一页讲稿。 */
interface BoardFrame {round:number;label:string;theme:string}
export type Action= {kind:'standUp'|'sitDown'|'flipScript'|'swing'|'cheer'|'clap'}|{kind:'tapBell';board?:BoardFrame}|{kind:'walk';to:'stand'|'seat'}|{kind:'walkTo';point:Point}|{kind:'face';target:Target}|{kind:'mic';on:boolean}|{kind:'nextRound';stage:number;board?:BoardFrame}|{kind:'crouch';times:number}|{kind:'wait';ms:number}|{kind:'signal';gate:'round'|'speech';key:string;serial?:number};
export interface Active {action:Action;start:number;duration:number;from:Point;fromSit:number;fromYaw:number;applied?:boolean}
export interface Actor {id:string;name:string;side:string;anchor:ActorAnchor;position:Point;sit:number;look:Target;lookUntil:number;yaw:number;status:AgentState;desired:AgentState;actionText:string;queue:Action[];active:Active|null;ready:boolean;speechSerial:number;preparedSerial:number;cut:boolean;error:string|null;errorAt:number;mind?:MindView;nextParticle:number}
export interface Bubble {id:string;speakerId:string;header:string;text:string;born:number;expires:number;cut?:boolean;react?:boolean}
export interface ChatLine {id:string;text:string;color:string;private?:boolean;born:number}
export interface DirectorState {boardRound:number;boardLabel:string;boardTheme:string;now:number;session:Session;actors:Record<string,Actor>;round:number;label:string;roundReady:boolean;/** 辩题屏上已经到过的阶段（立论、交锋、总结） */stages:boolean[];stage:number;/** 话筒开关，键是 anchor.mic */mics:Record<string,boolean>;pair:string[];pending:Record<string,ChatMessage & {complete?:boolean;speechSerial?:number}>;bubbles:Bubble[];chat:ChatLine[];title:{text:string;sub:string;color:string;born:number}|null;toast:number|null;focus:string|null;globalError:string|null;theme:string;result:DiscussionResult|null;resultStage:number;executed:number;enqueued:number;reduced:boolean;bellAt:number;pageAt:number;buttonAt:number;boardResult:boolean;/** 正在发言的人和开始时间：其他人按各自的延迟错开转头（第 12.12 节） */lookSpeaker:string|null;lookSpeakerAt:number}
export type Input=EngineEvent|{type:'session';state:Session}|{type:'focus';id:string|null}|{type:'clear_error';agentId?:string}|{type:'complete';id:string};
export interface Outputs {sounds:Array<{event:string;actor?:string}>;particles:Array<{actor:string;kind:'angry'|'glint'|'water'|'smoke'|'firework'}>;signals:Array<{gate:'round'|'speech';key:string}>;actions:Array<{actor:string;kind:string;at:number}>}
export const teamColor=(side:string)=>side==='pro'?'#5555FF':side==='con'?'#FF5555':'#FFAA00';
export function createDirector(cast:Participant[],room:Room,theme:string,reduced=false):DirectorState {
  const actors:Record<string,Actor>={};for(const p of cast){const anchor=room.anchors[p.seatIndex]??room.anchors[6];actors[p.agentId]={id:p.agentId,name:p.persona.name,side:p.side??'host',anchor,position:[...anchor.seat],sit:p.side==='host'?0:1,look:'camera',lookUntil:0,yaw:anchor.homeYaw,status:'idle',desired:'idle',actionText:'就座',queue:[],active:null,ready:false,speechSerial:0,preparedSerial:0,cut:false,error:null,errorAt:0,nextParticle:0};}
  return {boardRound:0,boardLabel:'等待开场',boardTheme:theme,now:0,session:'waiting',actors,round:0,label:'准备中',roundReady:true,stages:[false,false,false],stage:-1,mics:{},pair:[],pending:{},bubbles:[],chat:[],title:null,toast:null,focus:null,globalError:null,theme,result:null,resultStage:-1,executed:0,enqueued:0,reduced,bellAt:-9999,pageAt:-9999,buttonAt:-9999,boardResult:false,lookSpeaker:null,lookSpeakerAt:-99999};
}
const distance=(a:Point,b:Point)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const lerp=(a:Point,b:Point,t:number)=>a.map((n,i)=>n+(b[i]-n)*t) as Point;
const ease=(n:number)=>n*n*(3-2*n);
const angular=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
function phase(label:string){return /立论/.test(label)?0:/交锋|质询/.test(label)?1:2;}
function targetPoint(target:Target,a:Actor,s:DirectorState,room:Room):Point {if(typeof target==='object'){const other=s.actors[target.agent];return other?[other.position[0],other.position[1]+1.62-other.sit*.578,other.position[2]]:room.judge;}const podium=room.layout.podium.position;return target==='camera'?room.judge:target==='bell'?[podium[0]+.4,podium[1]+1.03,podium[2]-.02]:[podium[0],podium[1]+1.12,podium[2]];}
function destination(a:Actor,action:Extract<Action,{kind:'walk'}>):Point{return action.to==='stand'?a.anchor.stand:a.anchor.seat;}
function duration(a:Actor,action:Action,room:Room,reduced:boolean){if(action.kind==='signal')return 0;if(action.kind==='wait')return action.ms;if(reduced)return 0;return action.kind==='walk'?Math.max(180,distance(a.position,destination(a,action))/2.2*1000):action.kind==='crouch'?action.times*500:action.kind==='cheer'?1600:action.kind==='clap'?1400:action.kind==='flipScript'?500:300;}
/** No timer, DOM, renderer or wall-clock reads. Caller owns the pausable stage clock. */
export function step(previous:DirectorState,now:number,inputs:Input[],room:Room):{state:DirectorState;outputs:Outputs}{
  const s:DirectorState={...previous,actors:Object.fromEntries(Object.entries(previous.actors).map(([id,a])=>[id,{...a,position:[...a.position] as Point,queue:[...a.queue],active:a.active?{...a.active}:null}])),stages:[...previous.stages],mics:{...previous.mics},pair:[...previous.pair],pending:Object.fromEntries(Object.entries(previous.pending).map(([id,m])=>[id,{...m}])),bubbles:previous.bubbles.map(b=>({...b})),chat:previous.chat.map(c=>({...c}))};
  const outputs:Outputs={sounds:[],particles:[],signals:[],actions:[]};
  const frozen=s.session==='paused'||s.session==='stopped'||!!s.globalError;
  s.now=frozen?previous.now:now;
  const queue=(a:Actor|undefined,...actions:Action[])=>{if(!a)return;a.queue.push(...actions);s.enqueued+=actions.length;};
  const host=Object.values(s.actors).find(a=>a.side==='host');
  const chat=(id:string,text:string,color='#AAAAAA',privateLine=false)=>{if(!s.chat.some(c=>c.id===id))s.chat.push({id,text,color,private:privateLine,born:s.now});s.chat=s.chat.slice(-6);};
  const finishMessage=(id:string)=>{const m=s.pending[id];if(!m)return;const a=s.actors[m.speakerId],name=a?.name??(m.speakerId==='user'?'你':'系统');const text=m.private?(m.speakerId==='user'?`你悄悄对 ${s.actors[m.targetId??'']?.name??'成员'} 说：${m.text}`:`${name} 悄悄对你说：${m.text}`):`<${name}> ${m.text}${m.cut?'——':''}`;
    chat(m.id,text,m.private?'#AAAAAA':m.kind==='notice'?'#FFFF55':m.kind==='system'?'#AAAAAA':m.speakerId==='user'?'#FFFFFF':teamColor(a?.side??''),!!m.private);
    const b=s.bubbles.find(b=>b.id===id);if(b)b.expires=s.now+(m.cut?300:m.kind==='react'?1500:readMs(m.text));if(b||m.private||['user','notice','system'].includes(m.kind))delete s.pending[id];else m.complete=true;};
  const settle=(a:Actor)=>{queue(a,{kind:'mic',on:false});if(a.side!=='host'&&!s.pair.includes(a.id))queue(a,{kind:'walk',to:'seat'},{kind:'sitDown'});};
  for(const input of inputs){
    if(input.type==='session'){s.session=input.state;continue;}
    if(input.type==='round'){
      for(const a of Object.values(s.actors)){if(s.pair.includes(a.id))queue(a,{kind:'walk',to:'seat'},{kind:'sitDown'});a.ready=false;}s.pair=[];
      s.round=input.round;s.label=input.label;s.roundReady=!host;
      s.title={text:'第 '+input.round+' 轮',sub:input.label,color:'#FFFFFF',born:s.now};chat('round-'+input.round,'— 第 '+input.round+' 轮 · '+input.label+' —');
      // 主持站在讲台后不用走动：按「下一轮」切换辩题屏的阶段条，再拍一下桌铃。
      if(host){const p=phase(input.label),board={round:input.round,label:input.label,theme:s.theme};queue(host,{kind:'face',target:'lectern'});if(s.stage!==p)queue(host,{kind:'nextRound',stage:p,board});queue(host,{kind:'face',target:'bell'},{kind:'tapBell',board},{kind:'face',target:'camera'},{kind:'signal',gate:'round',key:String(input.round)});}else outputs.signals.push({gate:'round',key:String(input.round)});
    }else if(input.type==='status'){
      const a=s.actors[input.agentId];if(!a)continue;
      const was=a.desired;a.desired=input.state;a.actionText=input.action;
      if(a.error){a.error=null;if(a.active)a.active.start+=s.now-a.errorAt;chat('recover-'+a.id+'-'+s.now,a.name+' 重新加入了','#FFFF55');}
      if(input.state==='speaking'){
        // 记下发言人和开始时间：其他人按各自的延迟错开转头看他（第 12.12 节第 1 条）。
        s.lookSpeaker=a.id;s.lookSpeakerAt=s.now;
        a.ready=false;a.speechSerial++;a.cut=false;
        if(/私下/.test(input.action)){a.ready=true;a.preparedSerial=a.speechSerial;a.status='speaking';a.look='camera';outputs.signals.push({gate:'speech',key:a.id});}
        else if(a.side==='host')queue(a,{kind:'face',target:'lectern'},{kind:'flipScript'},{kind:'mic',on:true},{kind:'signal',gate:'speech',key:a.id,serial:a.speechSerial});
        else {if(a.sit>.1)queue(a,{kind:'standUp'},{kind:'walk',to:'stand'});queue(a,{kind:'mic',on:true},{kind:'signal',gate:'speech',key:a.id,serial:a.speechSerial});}
      }else if(input.state==='idle'&&was==='speaking'){for(const m of Object.values(s.pending))if(m.speakerId===a.id)finishMessage(m.id);if(s.lookSpeaker===a.id)s.lookSpeaker=null;queue(a,{kind:'wait',ms:Math.max(0,...s.bubbles.filter(b=>b.speakerId===a.id).map(b=>Number.isFinite(b.expires)?b.expires-s.now:readMs(b.text)),...Object.values(s.pending).filter(m=>m.speakerId===a.id&&!m.private).map(m=>readMs(m.text)))});settle(a);}
      else if(input.state!=='done')a.status=input.state;
    }else if(input.type==='message'){
      const m={...input.message},a=s.actors[m.speakerId];
      for(const p of Object.values(s.pending))if(p.speakerId===m.speakerId&&p.id!==m.id)finishMessage(p.id);
      s.pending[m.id]=m;if(a)s.pending[m.id].speechSerial=a.speechSerial;
      if(m.kind==='user'){
        const lookers=m.private?[s.actors[m.targetId??'']].filter(Boolean):Object.values(s.actors);
        for(const actor of lookers){actor.look='camera';actor.lookUntil=s.now+2000;if(m.private)queue(actor,{kind:'swing'});}finishMessage(m.id);
      }else if(m.private){if(a){a.look='camera';a.lookUntil=s.now+2000;}if(m.text)finishMessage(m.id);}
      else if(m.kind==='notice'||m.kind==='system'){finishMessage(m.id);}
      else if(a){
        const cross=/交锋|质询/.test(m.tag??s.label)&&!!m.targetId&&m.kind==='speech';
        if(cross){const pair=[a.id,m.targetId!];if(s.pair.some(id=>!pair.includes(id)))for(const id of s.pair.filter(id=>!pair.includes(id))){const prev=s.actors[id];queue(prev,{kind:'walk',to:'seat'},{kind:'sitDown'});}s.pair=pair;const other=s.actors[m.targetId!];if(other){if(other.sit>.1)queue(other,{kind:'standUp'},{kind:'walk',to:'stand'});queue(other,{kind:'face',target:{agent:a.id}});}queue(a,{kind:'face',target:{agent:m.targetId!}});}
        else a.look='camera';
        if(m.kind==='react'){a.ready=true;queue(a,{kind:'swing'});}
        // When remounting a finished session, text can precede a status snapshot.
        if(a.desired!=='speaking'&&m.text&&s.session==='finished')a.ready=true;
      }
    }else if(input.type==='message_update'){const m=s.pending[input.id];if(m){m.text=input.text;m.cut=input.cut??m.cut;}const b=s.bubbles.find(b=>b.id===input.id);if(b){b.text=input.text;b.cut=input.cut??b.cut;if(input.cut)b.expires=s.now+300;}if(input.cut){if(m&&s.actors[m.speakerId])s.actors[m.speakerId].cut=true;else if(b&&s.actors[b.speakerId])s.actors[b.speakerId].cut=true;finishMessage(input.id);}}
    else if(input.type==='complete')finishMessage(input.id);
    else if(input.type==='mind'){const a=s.actors[input.agentId];if(a)a.mind=input.mind;}
    else if(input.type==='focus')s.focus=input.id;
    else if(input.type==='theme'){s.theme=input.title;chat('theme-'+s.now,'辩题：'+input.title);}
    else if(input.type==='error'){
      if(input.agentId){const a=s.actors[input.agentId];if(a){a.error=input.message;a.errorAt=s.now;chat(input.id,a.name+' 掉线了：'+input.message+'（在右侧可以重试）','#FFFF55');}}
      else s.globalError=input.message;
    }else if(input.type==='clear_error'){
      if(input.agentId){const a=s.actors[input.agentId];if(a?.error){a.error=null;if(a.active)a.active.start+=s.now-a.errorAt;chat('recover-'+a.id+'-'+s.now,a.name+' 重新加入了','#FFFF55');}}else s.globalError=null;
    }else if(input.type==='result'){
      s.result=input.result;s.resultStage=0;s.pair=[];for(const m of Object.values(s.pending))finishMessage(m.id);
      if(host)queue(host,{kind:'face',target:'bell'},{kind:'tapBell'});
      s.title=null;s.lookSpeaker=null;
    }
  }
  if(s.session==='paused'||s.session==='stopped'||s.globalError)return {state:s,outputs};
  for(const a of Object.values(s.actors)){
    if(a.error)continue;
    let guard=0;
    while(guard++<128){
      if(!a.active){const action=a.queue.shift();if(!action)break;a.active={action,start:s.now,duration:duration(a,action,room,s.reduced),from:[...a.position],fromSit:a.sit,fromYaw:a.yaw};outputs.actions.push({actor:a.id,kind:action.kind,at:s.now});if(a.side!=='host'&&(action.kind==='standUp'||action.kind==='sitDown'))outputs.sounds.push({event:'prop.chair.slide',actor:a.id});}
      const active=a.active,act=active.action,t=active.duration?Math.min(1,(s.now-active.start)/active.duration):1;
      // 手到达按钮/铃时才开关；门禁仍等整段动作结束，文字不会先于动作出现。
      if(!active.applied&&t>=(act.kind==='flipScript'?.1:.65)&&['mic','nextRound','tapBell','flipScript'].includes(act.kind)){
        active.applied=true;
        if(act.kind==='mic'){s.mics[a.anchor.mic]=act.on;if(!act.on)a.status='idle';else if(s.resultStage<0)a.status='speaking';outputs.sounds.push({event:'prop.mic.button',actor:a.id});}
        else if(act.kind==='nextRound'){s.stage=act.stage;for(let i=0;i<=act.stage;i++)s.stages[i]=true;s.buttonAt=s.now;outputs.sounds.push({event:'prop.podium.button',actor:a.id});}
        else if(act.kind==='tapBell'){s.bellAt=s.now;outputs.sounds.push({event:'prop.desk.bell',actor:a.id});}
        else if(act.kind==='flipScript'){s.pageAt=s.now;outputs.sounds.push({event:'item.book.page_turn',actor:a.id});}
        if((act.kind==='nextRound'||act.kind==='tapBell')&&act.board){s.boardRound=act.board.round;s.boardLabel=act.board.label;s.boardTheme=act.board.theme;}
      }
      if(act.kind==='standUp')a.sit=active.fromSit*(1-ease(t));else if(act.kind==='sitDown')a.sit=active.fromSit+(1-active.fromSit)*ease(t);
      else if(act.kind==='walk'){
        a.position=lerp(active.from,destination(a,act),ease(t));
      }else if(act.kind==='face'){a.look=act.target;const p=targetPoint(act.target,a,s,room),targetYaw=Math.atan2(p[0]-a.position[0],p[2]-a.position[2]);a.yaw=active.fromYaw+angular(active.fromYaw,targetYaw)*ease(t);}
      if(t<1)break;
      a.active=null;s.executed++;
      if(act.kind==='walk')outputs.sounds.push({event:'block.wood.step',actor:a.id});
      else if(act.kind==='signal'){if(act.gate==='speech'){a.ready=true;a.preparedSerial=Math.max(a.preparedSerial,act.serial??a.speechSerial);a.status='speaking';}else s.roundReady=true;outputs.signals.push({gate:act.gate,key:act.key});}
      // Subsequent actions start at the end of the last action, even for large time steps.
      const next=a.queue.shift();if(next){const end=active.start+active.duration;a.active={action:next,start:end,duration:duration(a,next,room,s.reduced),from:[...a.position],fromSit:a.sit,fromYaw:a.yaw};outputs.actions.push({actor:a.id,kind:next.kind,at:end});if(a.side!=='host'&&(next.kind==='standUp'||next.kind==='sitDown'))outputs.sounds.push({event:'prop.chair.slide',actor:a.id});}else break;
    }
    if(!a.active&&s.now>a.lookUntil&&a.desired!=='speaking'){
      // 注视（第 12.12 节第 1 条、12.6「不齐刷刷」「注意力会漂」）：有人说话时，其他人按各自的延迟
      // （0.3～3 秒）陆续转头，约五分之一的人继续做自己的事不转头；看 2～6 秒又会移开，回到各看各的；
      // 交锋的两人一直互相盯着。没人说话时各看各的——主持看镜头宣布，辩手轮流看讲台、队友、对面和桌铃。
      const speaker=s.lookSpeaker&&s.lookSpeaker!==a.id?s.actors[s.lookSpeaker]:null;
      const ids=Object.keys(s.actors),slot=Math.floor(s.now/1000/5.5+a.id.length*1.7)%4;
      const mate=ids.find(i=>i!==a.id&&s.actors[i].side===a.side),opponent=ids.find(i=>s.actors[i].side!==a.side&&s.actors[i].side!=='host');
      const wander:Target=a.side==='host'?'camera':slot===0?'lectern':slot===1&&mate?{agent:mate}:slot===2&&opponent?{agent:opponent}:'bell';
      if(speaker&&s.pair.includes(a.id))a.look={agent:speaker.id};
      else if(speaker){
        const h=a.id.length*173+((s.lookSpeakerAt|0)%400);
        if(h%5!==4){const delay=300+h%2700,hold=2000+(h*7)%4000;a.look=s.now>=s.lookSpeakerAt+delay&&s.now<s.lookSpeakerAt+delay+hold?{agent:speaker.id}:wander;}
        else a.look=wander;
      }
      else a.look=wander;
    }
    if(!s.reduced&&!a.error&&(a.desired==='speaking'||s.pair.includes(a.id))&&s.now>=a.nextParticle){a.nextParticle=s.now+2500;for(const m of a.mind?.mood??[])if(m.value>=(m.key==='信心'?7:6))outputs.particles.push({actor:a.id,kind:m.key==='火气'?'angry':m.key==='压力'?'water':m.key==='信心'?'glint':'smoke'});}
  }
  s.bubbles=s.bubbles.filter(b=>b.expires>s.now);
  for(const m of Object.values(s.pending)){
    if(m.private||!['speech','reply','react'].includes(m.kind)||!m.text||s.bubbles.some(b=>b.id===m.id))continue;
    const a=s.actors[m.speakerId];if(!a?.ready||(m.speechSerial??0)>a.preparedSerial||!s.roundReady||a.active?.action.kind==='face')continue;
    if(s.bubbles.length===2){s.bubbles[0].expires=Math.min(s.bubbles[0].expires,s.now+200);continue;}
    const target=m.targetId?m.targetId==='user'?'你':s.actors[m.targetId]?.name:undefined,tag=m.tag?.split('·').at(-1)?.trim();
    s.bubbles.push({id:m.id,speakerId:m.speakerId,header:a.name+(target?' → '+target:'')+(tag?' · '+tag:''),text:m.text,born:s.now,expires:m.cut?s.now+300:m.complete?s.now+readMs(m.text):Infinity,cut:m.cut,react:m.kind==='react'});
    if(m.kind==='react'||m.complete)finishMessage(m.id);
  }
  if(s.resultStage===0&&(!host||!host.active&&!host.queue.length)){
    s.resultStage=1;
    for(const a of Object.values(s.actors))queue(a,{kind:'mic',on:false});
  }else if(s.resultStage===1&&Object.values(s.actors).every(a=>!a.active&&!a.queue.length)){
    s.resultStage=2;
    // 赛后双方起立鼓掌致意，再各自归位；没有胜负、分数或获胜庆祝。
    for(const a of Object.values(s.actors)){
      if(a.side==='host'){queue(a,{kind:'face',target:'camera'},{kind:'clap'});continue;}
      queue(a,{kind:'standUp'},{kind:'walk',to:'stand'},{kind:'face',target:'camera'},{kind:'clap'},{kind:'walk',to:'seat'},{kind:'sitDown'});
    }
  }else if(s.resultStage===2&&Object.values(s.actors).every(a=>!a.active&&!a.queue.length)){
    s.resultStage=3;s.boardResult=true;s.toast=s.now;outputs.sounds.push({event:'ui.toast.challenge_complete'});
    s.title={text:'本场辩论结束',sub:'讨论总结已生成',color:'#FFFFFF',born:s.now};
  }
  return {state:s,outputs};
}
export function actionBar(s:DirectorState){return s.session==='waiting'?'说一句话，辩论就开始':s.session==='paused'?'可以先说你的想法，点「继续」接着讨论':s.session==='stopped'?'已停止':s.session==='finished'?'已结束 · 可以继续追问（点成员可以私下问）':'';}
export function lookAt(a:Actor,s:DirectorState,room:Room){return targetPoint(a.look,a,s,room);}
