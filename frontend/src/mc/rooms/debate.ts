import {Builder,type Point} from './builders';
import type {Block} from '../blockModel';
/** seat 是坐下时的身体基准点（脚底往上 0.578 才是坐姿的根），stand 是站起来时脚底的位置。 */
export interface ActorAnchor {seat:Point;stand:Point;homeYaw:number;mic:string;chair?:string}
/** 道具的摆放。尺寸单位是米，1 格 = 1 米；渲染和房间检查共用这一份。 */
export interface PropLayout {
  tables:Array<{id:string;side:'pro'|'con'|'judge';center:Point;length:number;depth:number;height:number;/** 桌沿布带朝向（弧度，0 朝 +z） */skirtYaw:number}>;
  chairs:Array<{id:string;side:'pro'|'con'|'judge';position:Point;yaw:number;/** 起身时沿身后方向滑开的距离 */slide:number;actor?:number}>;
  desk:Array<{id:string;side:'pro'|'con'|'judge';actor?:number;mic?:Point;yaw:number}>;
  podium:{position:Point;yaw:number};
  /** 北墙上的辩题板和它下面的三盏阶段灯。 */
  board:{position:Point;width:number;height:number};
  phaseLamps:Array<Point>;
}
/** fit 是全景必须横向完整装下的点（两队最外侧的人、椅子和名字牌），窗口变窄时镜头会放宽视角。 */
/** windows 是西墙（下午迎着太阳）的窗洞，中档用它们画假光柱；floor 是窗下地面的高度。 */
export interface Room {blocks:Block[];ceiling:Block[];anchors:ActorAnchor[];host:Point;camera:Point;cameraTarget:Point;fit:Point[];judge:Point;judgeTarget:Point;layout:PropLayout;banners:Array<{position:Point;side:'pro'|'con';yaw:number}>;windows:Array<{y0:number;y1:number;z0:number;z1:number;floor:number}>;/** 地面饰面，方块地面仍负责碰撞和光照。 */floor:Array<{y:number;x0:number;x1:number;z0:number;z1:number}>;/** 灯具中心与实时光源共用位置。 */lights:Array<{position:Point;length:number;intensity:number;distance:number;kind:'ceiling'|'lantern';shadow:boolean}>;/** 室内净空间；相机和行走共用，扩建时不再各自硬编码墙的位置。 */bounds:{min:Point;max:Point}}
/** 碰撞箱（带朝向的长方体：中心、半边长、绕竖轴的转角），给房间检查用：人站、坐的位置和镜头视线都不能被它们挡住。 */
export function propBoxes(room:Room):Array<{id:string;center:Point;half:Point;yaw:number}> {
  const boxes:Array<{id:string;center:Point;half:Point;yaw:number}>=[];
  for(const t of room.layout.tables)boxes.push({id:t.id,center:[t.center[0],t.center[1]+t.height/2,t.center[2]],half:[t.length/2,t.height/2,t.depth/2],yaw:t.skirtYaw});
  const p=room.layout.podium.position;boxes.push({id:'podium',center:[p[0],p[1]+.59,p[2]],half:[.3,.59,.25],yaw:room.layout.podium.yaw});
  return boxes;
}
/**
 * 辩论室（第 12.15 节，用户已确认）：不再是 22×24 的礼堂，照 2D 参照图 scene-debate.png 做的一间
 * 约 20×18 米的辩论室（12.16 二轮：用户仍觉挤，房间、桌距、座距再放宽）——没有高舞台和观众席，地面全平（脚踩 y=1）；
 * 第 12.20 节：奶油墙、琥珀木框和宽木地板；两盏主灯笼投影，顶灯辅助。
 * 两队长桌八字朝南张开，主持台、书架、绿植和队旗沿用原布局；
 * 南侧中央是门和门廊，评委席是门边一张小桌（“你”坐这里，也是自由视角的出发点）。
 * 天花板位于 y=6；默认机位在门内，所有常用视角保留实体天花板。
 * 镜像：世界坐标按 22-x、方块格子按 21-x（房间中心是 x=11）。
 */
const ANGLE=35*Math.PI/180,SEAT_SPACING=2.05,TEAM_Z=6.6,CHAIR_X=4.6,TABLE_LENGTH=6.4;
const teamYaw=(side:'pro'|'con')=>(side==='con'?-1:1)*(Math.PI/2-ANGLE);
/** 某队座位坐标系里的一点：k 是座位（1 远端、0 中间、-1 近端），forward 沿面朝方向，along 沿桌子往远端，y 是高度。 */
function teamPoint(side:'pro'|'con',k:number,forward:number,along:number,y:number):Point {
  const yaw=Math.PI/2-ANGLE,fx=Math.sin(yaw),fz=Math.cos(yaw),ax=Math.cos(yaw),az=-Math.sin(yaw),d=SEAT_SPACING*k+along;
  const x=CHAIR_X+ax*d+fx*forward,z=TEAM_Z+az*d+fz*forward;return [side==='con'?22-x:x,y,z];
}
/** 一辩坐远端（靠辩题板），三辩坐近端。 */
const SEAT_K=[1,0,-1];
export function buildDebateRoom():Room {
  const b=new Builder();
  // 地板（y=0）和门外的门廊平台。
  b.fill(0,21,0,0,0,19,'spruce_planks',{axis:'x'});
  b.fill(9,12,0,0,20,21,'spruce_planks',{axis:'x'});
  b.fill(9,12,0,0,21,21,'spruce_stairs',{facing:'north'});
  // 奶油墙面、琥珀木框；房间与桌椅布局不变。
  for(let y=1;y<=5;y++){
    const id=(y===1||y===5)?'oak_planks':'smooth_sandstone';
    b.fill(0,21,y,y,0,0,id,{axis:'x'}).fill(0,21,y,y,19,19,id,{axis:'x'}).fill(0,0,y,y,1,18,id,{axis:'z'}).fill(21,21,y,y,1,18,id,{axis:'z'});
  }
  // 木框点出墙面的边界，北墙不再整面铺深木。
  for(const x of [0,21])for(const z of [0,9,19])b.fill(x,x,1,5,z,z,'oak_planks');
  for(const x of [4,17])b.fill(x,x,1,5,0,0,'oak_planks');
  for(const x of [5,16])b.fill(x,x,1,5,19,19,'oak_planks');
  // 四周完整的屋顶围边；默认机位在门内，不再剖开屋顶。
  b.fill(0,21,6,6,0,0,'smooth_quartz').fill(0,21,6,6,19,19,'smooth_quartz').fill(0,0,6,6,1,18,'smooth_quartz').fill(21,21,6,6,1,18,'smooth_quartz');
  // 窗户：两侧墙各两扇（西墙迎着下午的太阳，光柱从这里进来）。
  const windows:Room['windows']=[];
  for(const x of [0,21])for(const z of [3,11]){b.fill(x,x,2,3,z,z+2,'glass_pane');if(!x)windows.push({y0:2,y1:4,z0:z,z1:z+3,floor:1});}
  // 南墙中央的双开门，后方中央通道贯通到讲台。
  for(const x of [10,11])for(const y of [1,2])b.put(x,y,19,'iron_door',{facing:'north',half:y===1?'lower':'upper',hinge:x===10?'left':'right'});
  // 北墙两角的书架（彩色书脊，bookshelf 混 chiseled_bookshelf），猫趴在西边这列顶上。
  for(const x0 of [1,18])for(let x=x0;x<=x0+1;x++)for(let y=1;y<=3;y++)b.put(x,y,1,(x+y)%3?'bookshelf':'chiseled_bookshelf');
  // 队旗挂北墙、辩题板两侧（左蓝右红）。
  b.put(3,4,1,'blue_wall_banner',{facing:'south'});b.put(18,4,1,'red_wall_banner',{facing:'south'});
  // 讲台两侧各一盆绿植；绿植沿墙一圈（第 12.5 节摆设密度）。
  b.put(6,1,1,'potted_azalea_bush',{});b.put(15,1,1,'potted_azalea_bush',{});
  for(const x of [1,20])for(const z of [3,9,16])b.put(x,1,z,'potted_fern',{});
  // 浅灰等候凳，家具依旧靠墙，中央过道保持畅通。
  for(const z of [12,13]){b.put(1,1,z,'quartz_stairs',{facing:'east'}).put(1,2,z,'light_gray_carpet');b.put(20,1,z,'quartz_stairs',{facing:'west'}).put(20,2,z,'light_gray_carpet');}
  for(const x of [2,3,4,17,18,19])b.put(x,1,18,'quartz_stairs',{facing:'north'}).put(x,2,18,'light_gray_carpet');
  // 海晶灯嵌在实体吊顶内，形成六条 1×3 米长灯和主持两侧两条短灯。
  // 方块发光传播和实时光源对应同一套灯位，阳光仍只作辅助。
  const ceiling=new Builder().fill(1,20,6,6,1,18,'smooth_quartz'),lights:Room['lights']=[];
  for(const x of [5,16])for(const z of [4,9,14]){
    ceiling.fill(x,x,6,6,z-1,z+1,'sea_lantern');
    lights.push({position:[x+.5,5.84,z+.5],length:3,intensity:3,distance:11,kind:'ceiling',shadow:false});
  }
  for(const x of [9,12]){
    ceiling.fill(x,x,6,6,1,2,'sea_lantern');
    lights.push({position:[x+.5,5.84,2],length:2,intensity:6,distance:10,kind:'ceiling',shadow:false});
  }
  // 两队主桌上方的铜框灯笼承担方向光与投影；其余灯只填暗部。
  for(const x of [5.5,16.5])lights.push({position:[x,4.5,6.8],length:.55,intensity:26,distance:11,kind:'lantern',shadow:true});
  const anchors:ActorAnchor[]=[];
  for(const side of ['pro','con'] as const){
    SEAT_K.forEach((k,i)=>{const z=[5,7,9][i];anchors.push({seat:teamPoint(side,k,0,0,1.5),stand:teamPoint(side,k,.18,0,1),homeYaw:teamYaw(side),mic:side+'-'+z,chair:'chair-'+side+'-'+z});});
  }
  // 主持台后移（12.16 用户反馈）：与选手桌拉开距离，门口到讲台的通道更完整。
  const host:Point=[11,1,1.55];anchors.push({seat:host,stand:host,homeYaw:0,mic:'host'});
  const layout:PropLayout={tables:[],chairs:[],desk:[],podium:{position:[11,1,2.3],yaw:0},board:{position:[11,4.65,1.07],width:13,height:2.4},phaseLamps:[[10.2,3.12,1.075],[11,3.12,1.075],[11.8,3.12,1.075]]};
  for(const side of ['pro','con'] as const){const base=side==='con'?3:0,yaw=teamYaw(side);
    // 桌子按游戏人物的比例（第 12.12 节「桌子」）：桌面高 0.95、厚 0.14、深 1，坐着时前臂正好平放。
    layout.tables.push({id:side+'-table',side,center:teamPoint(side,0,1.02,0,1),length:TABLE_LENGTH,depth:1,height:.95,skirtYaw:yaw});
    [5,7,9].forEach((z,i)=>{const actor=base+i,k=SEAT_K[i];
      layout.chairs.push({id:'chair-'+side+'-'+z,side,position:teamPoint(side,k,0,0,1),yaw,slide:.3,actor});
      layout.desk.push({id:side+'-'+z,side,actor,mic:teamPoint(side,k,.85,0,1.95),yaw});});
  }
  // 门口右侧的一张小桌和一把评委椅，把中央进门通道留出来（12.15）。
  layout.tables.push({id:'judge-table',side:'judge',center:[17.8,1,15.6],length:1.7,depth:.85,height:.95,skirtYaw:Math.PI});
  layout.chairs.push({id:'chair-judge-0',side:'judge',position:[17.8,1,16.6],yaw:Math.PI,slide:0});
  // 全景要装下的点：两队远端和近端座位身后的椅背和人（含名字牌的余量）。
  const fit:Point[]=[];for(const side of ['pro','con'] as const)for(const k of [1,-1])for(const y of [1,3.2])fit.push(teamPoint(side,k,-.35,k<0?-.25:0,y));
  return {blocks:b.connect(),ceiling:ceiling.connect(),lights,bounds:{min:[1,1,1],max:[21,6,19]},anchors,host,camera:[11,4.3,18],cameraTarget:[11,2.8,5.4],fit,judge:[17.8,2.55,16.6],judgeTarget:[11,2.5,5],layout,windows,banners:[{position:[3.5,4,1.06],side:'pro',yaw:Math.PI},{position:[18.5,4,1.06],side:'con',yaw:Math.PI}],
    floor:[{y:1.011,x0:1,x1:21,z0:1,z1:19}]};
}
