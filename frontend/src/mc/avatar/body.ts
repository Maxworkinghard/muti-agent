/**
 * 体型与轮廓系统：每个人选一种体型（8 种 Q 版 + 2 种精修）、一种头型（4 种 + 精修鹅蛋脸）、一种坐姿（3 种），不再是同一个模子换发型和衣服。
 * 体型改的是骨架本身：身高、肩宽、躯干的宽窄厚薄、胳膊和腿的粗细长短、头的大小；头型改的是头的比例、脸两侧的切角和下巴。
 * 所有体型都受同一组约束（座面 0.50、坐下脚着地、背贴靠背、小腿不碰座面前沿、胳膊不碰扶手），坐姿的腿部角度按体型解出来：
 *   - 大腿下沿贴座面：坐下根点下沉 sitDrop = (髋高 - 半腿厚) T；
 *   - 鞋底着地：髋到地面 24 + 4 = 28 T = 大腿下倾的落差 + 小腿（不含鞋）× cos(前倾角) + 鞋高，脚踝把鞋摆平；
 *   - 背贴靠背：坐下时根点前后挪 zOff，让背（含外套）离靠背前面 0.4 T；侧坐再往前 1 T，膝盖不顶座面前沿。
 * 盘腿坐脚会离地，和“坐着必须脚着地”冲突，不做。
 */
import * as THREE from 'three';
import {T,SEAT_H,HEAD,RIG} from './rig';

export type BodyType='standard'|'slim'|'cute'|'crisp'|'broad'|'longcoat'|'bulky'|'outdoor'|'elegant'|'petite';
export type HeadShape='default'|'round'|'square'|'long'|'oval';
export type SitStyle='standard'|'relaxed'|'side';

/**
 * family：chibi 是原来的 Q 版（约 3.3 头身）；refined 是 2026-10-09 起的“精致 Minecraft 动漫风”精修体型（约 3.9–4.4 头身，头不再那么大），
 * 第一轮只有冷萃、好好两个样板用，其他人物仍是 Q 版，等用户看过样板再决定是否推广。
 */
interface Preset {label:string;note:string;head:number;shape:HeadShape;torso:[number,number,number];arm:[number,number];leg:{w:number;thigh:number;shin:number};family?:'chibi'|'refined'}
/** 体型（单位 T）：头的整体缩放、默认头型、躯干宽高深、胳膊粗细和长度、腿宽、大腿、小腿（含鞋） */
export const BODY:Record<BodyType,Preset>={
  standard:{label:'标准型',note:'约 3.3 头身，肩和腰均衡',head:0.77,shape:'default',torso:[18,24,10],arm:[7,22],leg:{w:9,thigh:12,shin:28}},
  slim:{label:'纤细型',note:'肩窄、躯干薄、腿更长',head:0.74,shape:'long',torso:[14,26,7],arm:[5.5,24],leg:{w:7,thigh:13,shin:30}},
  cute:{label:'软萌型',note:'个子更矮，头相对更大，仍在 3 头身附近',head:0.78,shape:'round',torso:[17,18,11],arm:[7,18],leg:{w:9,thigh:11,shin:28}},
  crisp:{label:'利落型',note:'肩线直、腰薄、四肢偏长',head:0.74,shape:'square',torso:[16,24,8],arm:[6,23],leg:{w:8,thigh:12,shin:29}},
  broad:{label:'宽肩型',note:'肩宽、躯干厚、胳膊粗',head:0.78,shape:'square',torso:[22,22,12],arm:[8,21],leg:{w:10,thigh:12,shin:28}},
  longcoat:{label:'长外套型',note:'更高，长外套拉出竖向轮廓',head:0.76,shape:'default',torso:[16,26,9],arm:[6,24],leg:{w:8,thigh:13,shin:30}},
  bulky:{label:'厚毛衣型',note:'个子偏矮、躯干又宽又厚',head:0.82,shape:'round',torso:[21,20,13],arm:[8.5,19],leg:{w:10,thigh:11,shin:28}},
  outdoor:{label:'户外机能型',note:'结实，肩和背包比标准型更厚',head:0.76,shape:'default',torso:[19,23,11],arm:[7.5,22],leg:{w:9.5,thigh:12,shin:28}},
  // ——精修（refined）：头缩到 0.6，躯干和腿拉长，肩窄一点、四肢细一点；仍是方块拼的身体
  elegant:{label:'修长型（精修）',note:'约 4.3 头身，肩窄腰细、腿长，长外套能垂到膝下',head:0.6,shape:'oval',torso:[15,27,8],arm:[5.5,25],leg:{w:7.5,thigh:15,shin:30},family:'refined'},
  petite:{label:'小巧型（精修）',note:'约 3.9 头身，个子小、肩窄，比 Q 版的头小很多',head:0.6,shape:'oval',torso:[15,24,9],arm:[6,22],leg:{w:8,thigh:12,shin:28},family:'refined'},
};
/** 头型：在体型的头缩放上再乘一个比例（宽、高、深），脸两侧竖棱切多少（T），下巴两侧收多少（T） */
export const HEAD_SHAPES:Record<HeadShape,{label:string;m:[number,number,number];cut:number;jaw:number}>={
  default:{label:'默认',m:[1,1,1],cut:2,jaw:0},
  round:{label:'圆润',m:[1.03,1,1.02],cut:3,jaw:1.5},
  square:{label:'方正',m:[1.04,.96,1],cut:1,jaw:0},
  long:{label:'长脸',m:[.95,1.07,.98],cut:2,jaw:1},
  /** 精修的鹅蛋脸：略窄、侧棱切得多、下巴两侧收得多（动漫脸的 V 形下颌，仍是方块） */
  oval:{label:'鹅蛋脸（精修）',m:[.97,1.02,.96],cut:3,jaw:2.5},
};
export const SIT_LABEL:Record<SitStyle,string>={standard:'标准坐',relaxed:'放松坐（腿往前伸、身子后靠）',side:'双腿侧坐（膝盖并拢偏向一侧）'};

export interface Body {
  type:BodyType;shape:HeadShape;family:'chibi'|'refined';
  head:{scale:[number,number,number];cut:number;jaw:number};
  torso:{w:number;h:number;d:number};
  arm:{w:number;h:number;d:number;x:number;drop:number};
  leg:{w:number;d:number;thigh:number;shin:number;shoe:number;x:number};
  hipY:number;neckY:number;
  /** 头顶（不含头发）离脚底，T */headTop:number;
  /** 站立眼高、坐姿眼高（座位锚点以上）、坐下根点下沉、名字牌在眼睛上方多高、手心（胳膊骨骼空间），米 */
  eyeStand:number;eyeSit:number;sitDrop:number;labelAbove:number;handReach:number;
}
export function makeBody(type:BodyType,shape?:HeadShape):Body{
  const p=BODY[type],hs=HEAD_SHAPES[shape??p.shape],[tw,th,td]=p.torso,[aw,ah]=p.arm;
  const scale:[number,number,number]=[p.head*hs.m[0],p.head*hs.m[1],p.head*hs.m[2]];
  const leg={w:p.leg.w,d:RIG.leg.d,thigh:p.leg.thigh,shin:p.leg.shin,shoe:RIG.leg.shoe,x:p.leg.w/2};
  const hipY=leg.thigh+leg.shin,neckY=hipY+th,eye=RIG.eyeY*scale[1];
  const eyeStand=(neckY+eye)*T,sitDrop=(hipY-leg.d/2)*T;
  return {type,shape:shape??p.shape,family:p.family??'chibi',head:{scale,cut:hs.cut,jaw:hs.jaw},torso:{w:tw,h:th,d:td},
    arm:{w:aw,h:ah,d:aw,x:tw/2+aw/2,drop:2},leg,hipY,neckY,headTop:neckY+HEAD.h*scale[1],
    eyeStand,eyeSit:eyeStand-sitDrop,sitDrop,labelAbove:((HEAD.h-RIG.eyeY)*scale[1]+16)*T,handReach:-(ah-2)*T};
}

/** 坐姿：大腿的俯仰 / 偏转 / 外撇、膝、踝的转角（弧度），坐下时根点往前挪多少（T） */
export interface SitPose {thigh:number;yaw:number;splay:number;knee:number;ankle:number;zOff:number}
/** 椅子族的公共尺寸（props/chairs.ts 用同一份）：座面前沿、靠背前面、扶手内侧、靠背顶（米） */
export const SEAT={front:.095,back:-.125,armIn:.43,backTop:SEAT_H+.25,halfWidth:.23} as const;
/** 背（含外套）离躯干中心多远：外层衣服（开衫、西装、夹克、长外套、马甲、拉链衫、棒球服）多 1 T */
export const backDepth=(b:Body,outer:boolean)=>b.torso.d/2+(outer?1:0);
const H_SEAT=SEAT_H/T+RIG.leg.d/2;   // 坐下时髋轴离地 28 T
/**
 * 解一个体型 + 坐姿的腿部角度：鞋底正好落在地面、背贴靠背；再按小腿方盒的角点检查不碰座面前沿，碰到就把人往前挪。
 * 返回的角度直接给 player.ts 的 legPose 用（大腿骨按 YXZ 顺序转：先外撇、再俯仰、最后整条腿偏转）。
 */
export function sitPose(b:Body,style:SitStyle,outer:boolean):SitPose{
  const {thigh,shin,shoe}=b.leg,low=shin-shoe,need=H_SEAT-shoe;
  const bStd=Math.acos(Math.min(1,need/low));
  let a=0,bb=bStd;
  if(style==='relaxed'){bb=Math.max(bStd+.12,.3);a=Math.asin(Math.max(0,Math.min(.25,(need-low*Math.cos(bb))/thigh)));bb=Math.acos(Math.min(1,(need-thigh*Math.sin(a))/low));}
  const yaw=style==='side'?.22:0,splay=style==='side'?.03:.08;
  let zOff=SEAT.back/T+backDepth(b,outer)+.4+(style==='side'?1:0);
  const pose=():SitPose=>({thigh:-(Math.PI/2-a),yaw,splay,knee:Math.PI/2-a-bb,ankle:bb,zOff});
  for(let i=0;i<40&&seatClearance(b,pose()).front<.3;i++)zOff+=.25;
  return pose();
}
const tmp=new THREE.Vector3();
/** 腿上一点（大腿 / 小腿 / 鞋局部 T）在“坐下的根点”坐标里的位置（T，y 从地面算） */
export function legPoint(b:Body,p:SitPose,side:-1|1,part:'thigh'|'shin'|'shoe',local:[number,number,number]):THREE.Vector3{
  const hip=new THREE.Matrix4().makeTranslation(side*b.leg.x,H_SEAT,p.zOff);
  const thighM=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.thigh,p.yaw,side*p.splay,'YXZ'));
  let m=hip.multiply(thighM);
  if(part!=='thigh'){m=m.multiply(new THREE.Matrix4().makeTranslation(0,-b.leg.thigh,0)).multiply(new THREE.Matrix4().makeRotationX(p.knee));
    if(part==='shoe')m=m.multiply(new THREE.Matrix4().makeTranslation(0,-(b.leg.shin-b.leg.shoe),0)).multiply(new THREE.Matrix4().makeRotationX(p.ankle));}
  return tmp.set(...local).applyMatrix4(m).clone();
}
/** 坐姿间隙（T）：小腿在座面高度以下那段离座面前沿多远（座面宽度以内）、鞋底离地多少、鞋跟最靠后的 z */
export function seatClearance(b:Body,p:SitPose){
  const hw=b.leg.w/2-.15,low=b.leg.shin-b.leg.shoe,frontT=SEAT.front/T,seatTop=H_SEAT-RIG.leg.d/2,halfW=SEAT.halfWidth/T;
  let front=99,sole=99,heel=99;
  for(const side of [-1,1] as const){
    for(const x of [-hw,hw])for(const z of [-hw,hw])for(const y of [0,-1,-2,-3,-4,-low]){const q=legPoint(b,p,side,'shin',[x,y,z]);if(q.y<=seatTop+.3&&Math.abs(q.x)<=halfW)front=Math.min(front,q.z-frontT);}
    for(const x of [-hw-.4,hw+.4])for(const z of [-b.leg.w/2,7]){const q=legPoint(b,p,side,'shoe',[x,-b.leg.shoe,z]);sole=Math.min(sole,Math.abs(q.y));if(z<0)heel=Math.min(heel,q.z);}
  }
  return {front,sole,heel};
}
