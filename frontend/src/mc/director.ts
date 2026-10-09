import type {AgentState,ChatMessage,DiscussionResult,EngineEvent,MindView,Participant} from '../types';
import type {Room,ActorAnchor} from './rooms/types';
import type {Point} from './rooms/builders';
import {SCALE} from './design/scale';
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
export function actionBar(s:DirectorState){return s.session==='waiting'?'说一句话，讨论就开始':s.session==='paused'?'可以先说你的想法，点「继续」接着讨论':s.session==='stopped'?'已停止':s.session==='finished'?'已结束 · 可以继续追问（点成员可以私下问）':'';}
export function lookAt(a:Actor,s:DirectorState,room:Room){const target=a.look;if(typeof target==='object'){const other=s.actors[target.agent];return other?[other.position[0],other.position[1]+SCALE.eyeStand-other.sit*SCALE.sitDrop,other.position[2]] as Point:room.judge;}const podium=room.layout.podium.position;return target==='camera'?room.judge:target==='bell'?[podium[0]+.4,podium[1]+1.03,podium[2]-.02] as Point:[podium[0],podium[1]+1.12,podium[2]] as Point;}
