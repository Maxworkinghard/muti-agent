import type {Zone} from '../design/space';
import {Builder,type Point} from './builders';
import {SLOT} from './studio';
import {at,blockArmchair,blockBench,bunting} from '../props/furniture';
import type {Block} from '../blockModel';
import type {McSceneKind} from '../../types';
import * as THREE from 'three';
import type {Look,Painter} from '../style';
import type {Kit} from '../props/furniture';
import type {BoardStyle} from '../props/boards';
/** seat 是坐下时的身体基准点（脚底往上 0.578 才是坐姿的根），stand 是站起来时脚底的位置。 */
export interface ActorAnchor {seat:Point;stand:Point;homeYaw:number;mic:string;chair?:string}
/** 道具的摆放。尺寸单位是米，1 格 = 1 米；渲染和房间检查共用这一份。 */
export interface PropLayout {
  tables:Array<{id:string;side:'pro'|'con'|'judge';center:Point;length:number;depth:number;height:number;shape?:'round';/** 桌沿布带朝向（弧度，0 朝 +z） */skirtYaw:number}>;
  chairs:Array<{id:string;side:'pro'|'con'|'judge';position:Point;yaw:number;style?:'stool'|'armchair';/** 起身时沿身后方向滑开的距离 */slide:number;actor?:number}>;
  desk:Array<{id:string;side:'pro'|'con'|'judge';actor?:number;mic?:Point;yaw:number}>;
  podium:{position:Point;yaw:number};
  /** 北墙上的辩题板和它下面的三盏阶段灯。 */
  board:{position:Point;width:number;height:number};
  phaseLamps:Array<Point>;
}
/** fit 是全景必须横向完整装下的点（两队最外侧的人、椅子和名字牌），窗口变窄时镜头会放宽视角。 */
/** windows 是西墙（下午迎着太阳）的窗洞，中档用它们画假光柱；floor 是窗下地面的高度。 */
export interface Room {blocks:Block[];ceiling:Block[];anchors:ActorAnchor[];host:Point;camera:Point;cameraTarget:Point;fit:Point[];judge:Point;judgeTarget:Point;layout:PropLayout;banners:Array<{position:Point;side:'pro'|'con';yaw:number}>;windows:Array<{y0:number;y1:number;z0:number;z1:number;floor:number}>;/** 地面饰面，方块地面仍负责碰撞和光照。 */floor:Array<{y:number;x0:number;x1:number;z0:number;z1:number}>;/** 灯具中心与实时光源共用位置；color 不设时按灯的种类取默认暖光。 */lights:Array<{position:Point;length:number;intensity:number;distance:number;kind:'ceiling'|'lantern';shadow:boolean;color?:string}>;/** 室内净空间；相机和行走共用，扩建时不再各自硬编码墙的位置。 */bounds:{min:Point;max:Point}}
/** 碰撞箱（带朝向的长方体：中心、半边长、绕竖轴的转角），给房间检查用：人站、坐的位置和镜头视线都不能被它们挡住。 */
export interface Room {
  kind?:McSceneKind; title?:string; outdoor?:boolean; standingSeats?:number[]; seatedSpeech?:boolean;
  /** 办公室的走动：每个人被拜访时来人站的位置、会议椅、站会圈，会议椅坐满后多出来的人从 overflow 起往东一字站开。 */
  work?:{visits:Point[];meeting:ActorAnchor[];huddle:{center:Point;rx:number;rz:number};overflow?:Point};
  /** 新画风：光线、按色板重画的方块贴图（贴图名 → 画法）、地面图（每米 16 像素，画在 floor 那块饰面上） */
  look?:Look; paint?:Record<string,Painter>; floorArt?:(c:CanvasRenderingContext2D,w:number,d:number)=>void;
  /** 剖面俯视时藏起来的方块：朝镜头的那面墙。默认机位在屋外高处，从这里往里看。 */
  cutaway?:Block[];
  /** 全景的基础竖直视角（度）；剖面俯视的机位离得远，用窄一点的视角减少透视变形。 */
  fov?:number;
  /** 正面机位（像播客间、辩论节目那样从南面看进去）：全景直接看向 cameraTarget，不按 fit 点上下居中，构图由房间自己定。 */
  frontal?:boolean;
  /** 这间房要用的方块贴图（original 原版加叠加材质包、hd、style）；页面另外指定时以页面为准 */
  material?:'original'|'hd'|'style';
  /** 自由视角能飞的范围：剖面俯视的房间比房间大，能在屋顶上方和四周飞（墙照样挡）。不设就是房间本身。 */
  flight?:{min:Point;max:Point};
  /** 新画风的物件：静态家具、椅子造型、话题板样式与边框、额外的逐帧动画（只在浏览器里调用）。 */
  decorate?:(k:Kit,root:THREE.Object3D)=>void; makeChair?:(k:Kit,c:PropLayout['chairs'][number])=>THREE.Group;
  /** 辩论室的桌子换成房间自己做的（贴方块贴图的队桌）；不设就用道具里自带的 */
  makeTable?:(k:Kit,t:PropLayout['tables'][number])=>THREE.Object3D;
  /** 地面图只是叠在真实方块地面上的一层（比如细细的赛场线），透明的地方露出方块 */
  floorOverlay?:boolean;
  /** boardFrame：话题板边框，平涂颜色或 'block/xxx' 方块贴图 */
  boardStyle?:BoardStyle; boardFrame?:string; boardYaw?:number; decorateBoard?:(k:Kit,sign:THREE.Object3D)=>void; animate?:(now:number)=>void; waterColor?:string;
}
export function propBoxes(room:Room):Array<{id:string;center:Point;half:Point;yaw:number}> {
  const boxes:Array<{id:string;center:Point;half:Point;yaw:number}>=[];
  for(const t of room.layout.tables){const center:Point=[t.center[0],t.center[1]+t.height/2,t.center[2]];
    // 圆桌用四个转开 45° 的长条拼成近似圆盘（最多外扩 7%），斜对角的座位不会被方形外框误判成撞桌。
    if(t.shape==='round'){const r=t.length/2,w=r*Math.sin(Math.PI/8);for(let k=0;k<4;k++)boxes.push({id:t.id+(k?'#'+k:''),center,half:[r,t.height/2,w],yaw:t.skirtYaw+k*Math.PI/4});}
    else boxes.push({id:t.id,center,half:[t.length/2,t.height/2,t.depth/2],yaw:t.skirtYaw});}
  if(!room.kind||room.kind==='debate'||room.kind==='classroom'){const p=room.layout.podium.position;boxes.push({id:'podium',center:[p[0],p[1]+.59,p[2]],half:[.3,.59,.25],yaw:room.layout.podium.yaw});}
  return boxes;
}
/**
 * 辩论室：照 scene-debate.png——湖绿色地面上一圈淡黄赛场线，深灰柱子分开墙面，北墙中间金框辩题板、
 * 左右蓝红两面队旗，两角书架；两队长桌八字朝南张开（正方蓝桌、反方红桌），主持台站在一块木地台上，
 * 两侧墙边和南面是长凳，绿植沿墙摆；南面中间是入口台阶，评委席是门边一张小桌（“你”坐这里，也是自由视角的出发点）。
 * 墙面是木护墙板加桃色条纹墙纸，北墙挂一串队色三角旗，侧窗挂两队颜色的窗帘，两张队桌上方各一盏吊灯；
 * 默认机位像电视辩论节目，从南面稍高处正对着看进去，屋顶挡住太阳，阳光只从西窗斜照进来。
 * 约 20×18 米，地面全平（脚踩 y=1）。墙高 4 格，天花板在 5 格；屋顶和南墙在默认视角里藏起来。
 * 镜像：世界坐标按 22-x、方块格子按 21-x（房间中心是 x=11）。
 */
/**
 * 辩论室的分区。墙的外框（x 0–21，z 0–19）同时是行走测试的契约：
 * 北墙挡住从 z=2 往北的人，西墙挡住 x=1.4，(8,10) 这一格必须是空的通道。
 * 改尺寸之前要一起改 scripts/check-mc-physics.mjs 里的这些探针。
 */
export const DEBATE_ZONES:Zone[]=[
  {id:'host',role:'focus',min:[8,1],max:[14,3.2],note:'主持台和辩题板，在北墙正中。'},
  {id:'pro',role:'work',min:[2,4.2],max:[9,9.4],note:'正方，桌子朝南偏开，和反方相对。'},
  {id:'con',role:'work',min:[13,4.2],max:[20,9.4],note:'反方，与正方镜像。'},
  {id:'aisle',role:'circulation',min:[9,9],max:[13,19],note:'从南门到主持台的通道，不放座位。'},
  {id:'court',role:'stage',min:[1,1],max:[21,12],note:'湖绿色赛场。'},
  {id:'audience',role:'audience',min:[1,12],max:[21,18],note:'南侧观众席，正方蓝、反方红，中间留门。'},
];
const ANGLE=35*Math.PI/180,SEAT_SPACING=2.05,TEAM_Z=6.6,CHAIR_X=4.6,TABLE_LENGTH=6.4;
/** 观众席从地面图的这一行（米，从北墙内侧算）开始往南。 */
const AUDIENCE_Z=10.6;
const teamYaw=(side:'pro'|'con')=>(side==='con'?-1:1)*(Math.PI/2-ANGLE);
/** 某队座位坐标系里的一点：k 是座位（1 远端、0 中间、-1 近端），forward 沿面朝方向，along 沿桌子往远端，y 是高度。 */
function teamPoint(side:'pro'|'con',k:number,forward:number,along:number,y:number):Point {
  const yaw=Math.PI/2-ANGLE,fx=Math.sin(yaw),fz=Math.cos(yaw),ax=Math.cos(yaw),az=-Math.sin(yaw),d=SEAT_SPACING*k+along;
  const x=CHAIR_X+ax*d+fx*forward,z=TEAM_Z+az*d+fz*forward;return [side==='con'?22-x:x,y,z];
}
/** 一辩坐远端（靠辩题板），三辩坐近端。 */
const SEAT_K=[1,0,-1];
/** 辩论室色板（从 scene-debate.png 取色）。队色也给桌椅、旗子和辩题板用。 */
/** 辩论室的配色：队色（彩旗、长凳、队桌用原版的蓝、红羊毛）和赛场线。 */
const DEBATE_COLORS={court:'#f5d76e',pro:'#3c44aa',con:'#b02e26',gold:'#fed83d',white:'#f9fffe'};
/** 辩论室用的真实方块：湖绿氧化铜赛场、橡木观众席、云杉木主持台和护墙板、白石英墙、深板岩柱子、深色橡木横梁。 */
const DEBATE_BLOCKS={court:'oxidized_copper',audience:'oak_planks',stage:'spruce_planks',base:'spruce_planks',wall:'smooth_quartz',top:'stripped_dark_oak_log',pillar:'polished_deepslate',ceiling:'smooth_quartz',glass:'glass_pane'};
export function buildDebateRoom():Room {
  const C=DEBATE_COLORS,B=DEBATE_BLOCKS,b=new Builder(),cut=new Builder(),top=new Builder();
  // 地板（y=0）：北边是赛场，南边观众席铺橡木，主持人脚下一条云杉木地台；门外的门廊平台和台阶。
  for(let x=0;x<=21;x++)for(let z=0;z<=19;z++)b.put(x,0,z,z>=12?B.audience:z===1&&x>=8&&x<=13?B.stage:B.court);
  b.fill(9,12,0,0,20,21,B.audience);b.fill(9,12,0,0,21,21,'spruce_stairs',{facing:'north'});
  // 墙：第 1 格云杉木护墙板、2～3 格白墙、第 4 格深色横梁；南墙（朝镜头）只留护墙板那一层。
  const wallAt=(x:number,z:number)=>{const alongX=z===0||z===19;for(let y=1;y<=4;y++){const id=y===1?B.base:y===4?B.top:B.wall,props:Record<string,string>=y===4?{axis:alongX?'x':'z'}:{};if(z===19&&y>1)cut.put(x,y,z,id,props);else b.put(x,y,z,id,props);}};
  for(let x=0;x<=21;x++){wallAt(x,0);wallAt(x,19);}for(let z=1;z<=18;z++){wallAt(0,z);wallAt(21,z);}
  // 深色柱子点出墙面的段落（二维原图里的深色立柱）。
  const pillar=(x:number,z:number)=>{for(let y=1;y<=4;y++)(z===19&&y>1?cut:b).put(x,y,z,B.pillar);};
  for(const x of [0,21])for(const z of [0,9,19])pillar(x,z);for(const x of [4,17])pillar(x,0);for(const x of [5,16])pillar(x,19);
  // 窗户：两侧墙各两扇。
  for(const x of [0,21])for(const z of [3,11])b.fill(x,x,2,3,z,z+2,B.glass);
  // 南墙中央的入口：护墙板和上面几格都空出来，门廊台阶通到屋里。
  for(const x of [10,11]){b.cells.delete(`${x},1,19`);for(let y=2;y<=4;y++)cut.cells.delete(`${x},${y},19`);cut.put(x,4,19,B.top,{axis:'x'});}
  // 北墙两角的书架，猫趴在西边这列顶上。
  for(const x0 of [1,18])for(let x=x0;x<=x0+1;x++)for(let y=1;y<=3;y++)b.put(x,y,1,'bookshelf');
  // 两张队桌上方、两侧墙边各吊一盏灯笼（挂在天花板上）；沿墙摆盆栽（左右对称）。
  for(const [x,z] of [[5,7],[16,7],[1,9],[20,9]] as const)b.put(x,4,z,'lantern',{hanging:'true'});
  for(const [x,z,id] of [[6,1,'potted_azalea_bush'],[15,1,'potted_azalea_bush'],[1,3,'potted_fern'],[20,3,'potted_fern'],[1,8,'potted_flowering_azalea_bush'],[20,8,'potted_flowering_azalea_bush'],[1,17,'potted_bamboo'],[20,17,'potted_bamboo']] as const)b.put(x,1,z,id);
  top.fill(0,21,5,5,0,19,B.ceiling);
  // 看不见的补光（左右对称），给游戏光照网格用。
  for(const x of [2,6,10,11,15,19])for(const z of [2,6,10,14,18])b.put(x,4,z,SLOT.light);
  const anchors:ActorAnchor[]=[];
  for(const side of ['pro','con'] as const){
    SEAT_K.forEach((k,i)=>{const z=[5,7,9][i];anchors.push({seat:teamPoint(side,k,0,0,1.5),stand:teamPoint(side,k,.18,0,1),homeYaw:teamYaw(side),mic:side+'-'+z,chair:'chair-'+side+'-'+z});});
  }
  // 主持台在辩题板前，和选手桌拉开距离，门口到讲台的通道完整。
  const host:Point=[11,1,1.55];anchors.push({seat:host,stand:host,homeYaw:0,mic:'host'});
  const layout:PropLayout={tables:[],chairs:[],desk:[],podium:{position:[11,1,2.3],yaw:0},board:{position:[11,3.0,1.07],width:5.2,height:1.25},phaseLamps:[[10.2,2.1,1.075],[11,2.1,1.075],[11.8,2.1,1.075]]};
  for(const side of ['pro','con'] as const){const base=side==='con'?3:0,yaw=teamYaw(side);
    // 桌子按游戏人物的比例：桌面高 0.95、厚 0.14、深 1，坐着时前臂正好平放。
    layout.tables.push({id:side+'-table',side,center:teamPoint(side,0,1.02,0,1),length:TABLE_LENGTH,depth:1,height:.95,skirtYaw:yaw});
    [5,7,9].forEach((z,i)=>{const actor=base+i,k=SEAT_K[i];
      layout.chairs.push({id:'chair-'+side+'-'+z,side,position:teamPoint(side,k,0,0,1),yaw,slide:.3,actor});
      layout.desk.push({id:side+'-'+z,side,actor,mic:teamPoint(side,k,.85,0,1.95),yaw});});
  }
  // 门口右侧的一张小桌和一把评委椅，把中央进门通道留出来。
  layout.tables.push({id:'judge-table',side:'judge',center:[17.8,1,15.6],length:1.7,depth:.85,height:.95,skirtYaw:Math.PI});
  layout.chairs.push({id:'chair-judge-0',side:'judge',position:[17.8,1,16.6],yaw:Math.PI,slide:0});
  // 全景要装下的点：两队远端和近端座位身后的椅背和人（含名字牌的余量）、辩题板上沿，再从北墙墙沿取到赛场南边。
  const fit:Point[]=[];for(const side of ['pro','con'] as const)for(const k of [1,-1])for(const y of [1,3.2])fit.push(teamPoint(side,k,-.35,k<0?-.25:0,y));
  fit.push([8.4,3.75,1.07],[13.6,3.75,1.07],[11,4.9,1],[11,1,12.6]);
  // 灯笼的光：两张队桌上方、两侧墙边，再给主持台前补一盏。
  const lights:Room['lights']=[...([[5.5,7.5],[16.5,7.5]] as const).map(([x,z])=>({position:[x,3.85,z] as Point,length:.4,intensity:2.6,distance:9,kind:'lantern' as const,shadow:false})),
    ...([[1.5,9.5],[20.5,9.5]] as const).map(([x,z])=>({position:[x,3.85,z] as Point,length:.2,intensity:1.2,distance:6,kind:'lantern' as const,shadow:false})),
    {position:[11,3.6,3.4],length:.3,intensity:1.4,distance:6,kind:'lantern',shadow:false}];
  const room:Room={kind:'debate',title:'辩论室',material:'original',blocks:b.connect(),cutaway:cut.connect(),ceiling:top.connect(),lights,bounds:{min:[1,1,1],max:[21,5,19]},anchors,host,camera:[11,10,30],cameraTarget:[11,1.6,7],fov:24,frontal:true,fit,judge:[17.8,2.55,16.6],judgeTarget:[11,2.2,5],layout,windows:[],
    banners:[{position:[3.5,3.95,1.06],side:'pro',yaw:Math.PI},{position:[18.5,3.95,1.06],side:'con',yaw:Math.PI}],floor:[{y:1.011,x0:1,x1:21,z0:1,z1:19}],
    look:{background:'#bfe3ff',sky:'#fff6e8',ground:'#9cc4b0',ambient:1,sun:{color:'#ffe2b8',intensity:3.2,azimuth:165,elevation:30,shadow:.92},exposure:1.1,indirect:.18,roof:true},
    // 地面只叠一层细细的赛场线（淡黄）和主持台前的半圆，方块地面照常露出来。
    floorOverlay:true,
    floorArt:(c,w)=>{c.fillStyle=C.court;const L=1.5*16,R=(w-1.5)*16,T=1.5*16,Bt=(AUDIENCE_Z-.8)*16;c.fillRect(L,T,R-L,2);c.fillRect(L,T,2,Bt-T);c.fillRect(R-2,T,2,Bt-T);c.fillRect(L,Bt,R-L,2);
      c.strokeStyle=C.court;c.lineWidth=2;c.beginPath();c.arc(10*16,1.6*16,1.1*16,0,Math.PI);c.stroke();},
    boardStyle:'frame'};
  room.flight={min:[-7,1,-6],max:[29,24,33]};
  const wool=(side:string)=>side==='pro'?'blue_wool':side==='con'?'red_wool':'white_wool';
  // 队桌：桌面铺队色羊毛，两端云杉木方台，原木桌腿；正面一块同色挡板写队名（像素字）。
  room.makeTable=(k,t)=>{const g=new THREE.Group(),L=t.length,D=t.depth,H=t.height,cloth=wool(t.side);
    k.block(g,L+.08,.1,D+.08,{side:'block/'+(t.side==='judge'?'oak_planks':cloth)},0,H-.05,0);
    for(const s of [-1,1]){if(t.side!=='judge')k.block(g,.56,.16,D+.14,{side:'block/spruce_planks'},s*(L/2-.24),H-.02,0);k.block(g,.12,H-.1,D-.12,{side:'block/stripped_spruce_log',top:'block/stripped_spruce_log_top'},s*(L/2-.24),(H-.1)/2,0);}
    k.block(g,L-.48,.07,.1,{side:'block/spruce_planks'},0,.55,D*.25);
    if(t.side!=='judge'){k.block(g,L-.16,.42,.06,{side:'block/'+cloth},0,H-.33,D/2-.03);
      const label=k.pixels(128,24,c=>{c.fillStyle='#fffdf6';c.font='bold 18px "Microsoft YaHei","PingFang SC",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(t.side==='pro'?'正方':'反方',64,13);},{transparent:true});
      const p=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.3),label);p.position.set(0,H-.33,D/2+.004);g.add(p);}
    return g;};
  room.makeChair=(k,c)=>blockArmchair(k,wool(c.side),'spruce_planks');
  room.decorate=(k,root)=>{
    // 北墙一串队色三角旗。
    root.add(bunting(k,[1.6,4.32,1.12],[20.4,4.32,1.12],26,.32,[C.pro,C.gold,C.con,C.white]));
    // 两侧墙边和南墙内侧的长凳，观众席两排长凳朝北（左边正方蓝座、右边反方红座），中间留出从门口进来的过道；评委桌在右后方。
    for(const [x,z,yaw,len,side] of [[1.45,15.6,Math.PI/2,2.4,'pro'],[20.55,15.6,-Math.PI/2,2.4,'con'],[3.6,18.4,Math.PI,2.8,'pro'],[18.4,18.4,Math.PI,2.8,'con']] as const)root.add(at(blockBench(k,len,wool(side),'spruce_planks'),x,1,z,yaw));
    for(const z of [13,14.75])for(const [x,side] of [[4.3,'pro'],[7.6,'pro'],[14.4,'con'],[17.7,'con']] as const){if(z>14&&x>17)continue;root.add(at(blockBench(k,3,wool(side),'spruce_planks'),x,1,z,Math.PI));}
    // 侧墙两窗之间挂原版的画。
    k.painting(root,'sunset',1.6,.8,1.04,2.9,7,Math.PI/2);k.painting(root,'sea',1.6,.8,20.96,2.9,7,-Math.PI/2);
  };
  return room;
}
