import * as THREE from 'three';
import type {Point} from './builders';
import type {Block} from '../blockModel';
import type {McSceneKind} from '../../types';
import type {Look,Painter} from '../style';
import type {Kit} from '../props/furniture';
import type {BoardInfo,BoardStyle} from '../props/boards';
/** seat 是坐下时的身体基准点（脚底往上 0.578 才是坐姿的根），stand 是站起来时脚底的位置。 */
export interface ActorAnchor {seat:Point;stand:Point;homeYaw:number;mic:string;chair?:string}
/** 道具的摆放。尺寸单位是米，1 格 = 1 米；渲染和房间检查共用这一份。 */
export interface PropLayout {
  tables:Array<{id:string;side:'pro'|'con'|'judge';center:Point;length:number;depth:number;height:number;shape?:'round';/** 桌沿布带朝向（弧度，0 朝 +z） */skirtYaw:number}>;
  chairs:Array<{id:string;side:'pro'|'con'|'judge';position:Point;yaw:number;style?:'stool'|'armchair';/** 起身时沿身后方向滑开的距离 */slide:number;actor?:number}>;
  desk:Array<{id:string;side:'pro'|'con'|'judge';actor?:number;mic?:Point;yaw:number}>;
  podium:{position:Point;yaw:number};
  /** 话题板及阶段灯的布局。 */
  board:{position:Point;width:number;height:number};
  phaseLamps:Array<Point>;
}
/** fit 是全景必须完整装下的人物、椅子和名字牌，窗口变窄时镜头会放宽视角。 */
/** windows 是西墙（下午迎着太阳）的窗洞，中档用它们画假光柱；floor 是窗下地面的高度。 */
export interface Room {blocks:Block[];ceiling:Block[];anchors:ActorAnchor[];host:Point;camera:Point;cameraTarget:Point;fit:Point[];judge:Point;judgeTarget:Point;layout:PropLayout;banners:Array<{position:Point;side:'pro'|'con';yaw:number}>;windows:Array<{y0:number;y1:number;z0:number;z1:number;floor:number}>;/** 地面饰面，方块地面仍负责碰撞和光照。 */floor:Array<{y:number;x0:number;x1:number;z0:number;z1:number}>;/** 灯具中心与实时光源共用位置；color 不设时按灯的种类取默认暖光。 */lights:Array<{position:Point;length:number;intensity:number;distance:number;kind:'ceiling'|'lantern';shadow:boolean;color?:string}>;/** 室内净空间与角色行走/寻路范围；相机优先使用 flight，实体碰撞由真实模型独立判断。 */bounds:{min:Point;max:Point}}
/** 碰撞箱（带朝向的长方体：中心、半边长、绕竖轴的转角），给房间检查用：人站、坐的位置和镜头视线都不能被它们挡住。 */
export interface Room {
  kind?:McSceneKind; title?:string; outdoor?:boolean; standingSeats?:number[]; seatedSpeech?:boolean;
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
  /** 房间自定义桌子；不设就使用公共道具。 */
  makeTable?:(k:Kit,t:PropLayout['tables'][number])=>THREE.Object3D;
  /** 地面图只是叠在真实方块地面上的一层（比如细细的赛场线），透明的地方露出方块 */
  floorOverlay?:boolean;
  /** boardFrame：话题板边框，平涂颜色或 'block/xxx' 方块贴图 */
  boardStyle?:BoardStyle; boardFrame?:string;
  /** 房间自己画话题板（v2 场景用）；不设就按 boardStyle 用公共样式画 */
  drawBoard?:(c:CanvasRenderingContext2D,W:number,H:number,info:BoardInfo)=>void; boardYaw?:number; decorateBoard?:(k:Kit,sign:THREE.Object3D)=>void; animate?:(now:number)=>void; waterColor?:string;
}
export function propBoxes(room:Room):Array<{id:string;center:Point;half:Point;yaw:number}> {
  const boxes:Array<{id:string;center:Point;half:Point;yaw:number}>=[];
  for(const t of room.layout.tables){const center:Point=[t.center[0],t.center[1]+t.height/2,t.center[2]];
    // 圆桌用四个转开 45° 的长条拼成近似圆盘（最多外扩 7%），斜对角的座位不会被方形外框误判成撞桌。
    if(t.shape==='round'){const r=t.length/2,w=r*Math.sin(Math.PI/8);for(let k=0;k<4;k++)boxes.push({id:t.id+(k?'#'+k:''),center,half:[r,t.height/2,w],yaw:t.skirtYaw+k*Math.PI/4});}
    else boxes.push({id:t.id,center,half:[t.length/2,t.height/2,t.depth/2],yaw:t.skirtYaw});}
  return boxes;
}
