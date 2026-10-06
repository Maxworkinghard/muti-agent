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
export interface Room {blocks:Block[];ceiling:Block[];anchors:ActorAnchor[];host:Point;camera:Point;cameraTarget:Point;fit:Point[];judge:Point;judgeTarget:Point;layout:PropLayout;banners:Array<{position:Point;side:'pro'|'con';yaw:number}>;windows:Array<{y0:number;y1:number;z0:number;z1:number;floor:number}>;/** 青绿格纹地垫：铺在方块地面上面一层，颜色对齐 2D 场景（方块地面仍然管光照）。 */floor:Array<{y:number;x0:number;x1:number;z0:number;z1:number}>;/** 室内净空间；相机和行走共用，扩建时不再各自硬编码墙的位置。 */bounds:{min:Point;max:Point}}
/** 碰撞箱（带朝向的长方体：中心、半边长、绕竖轴的转角），给房间检查用：人站、坐的位置和镜头视线都不能被它们挡住。 */
export function propBoxes(room:Room):Array<{id:string;center:Point;half:Point;yaw:number}> {
  const boxes:Array<{id:string;center:Point;half:Point;yaw:number}>=[];
  for(const t of room.layout.tables)boxes.push({id:t.id,center:[t.center[0],t.center[1]+t.height/2,t.center[2]],half:[t.length/2,t.height/2,t.depth/2],yaw:t.skirtYaw});
  const p=room.layout.podium.position;boxes.push({id:'podium',center:[p[0],p[1]+.59,p[2]],half:[.3,.59,.25],yaw:room.layout.podium.yaw});
  return boxes;
}
/**
 * 辩论室（第 12.15 节，用户已确认）：不再是 22×24 的礼堂，照 2D 参照图 scene-debate.png 做的一间
 * 约 16×15 米的辩论室（12.16）——没有高舞台和观众席，地面全平（脚踩 y=1）；
 * 北墙正中大辩题板、两侧队旗（左蓝右红）、再往外风景画和彩色书架；两张队色长桌八字朝南张开；
 * 中央讲台带话筒、脚下一圈圆形描线、两侧各一盆绿植；侧墙开西窗（下午的太阳）、红长凳和壁灯；
 * 南侧中央是门和门廊，评委席是门边一张小桌（“你”坐这里，也是自由视角的出发点）。
 * 天花板位于 y=6；默认机位在门内，所有常用视角保留实体天花板。
 * 镜像：世界坐标按 18-x、方块格子按 17-x（房间中心是 x=9）。
 */
const ANGLE=35*Math.PI/180,SEAT_SPACING=1.7,TEAM_Z=6.1,CHAIR_X=4.2,TABLE_LENGTH=5.6;
const teamYaw=(side:'pro'|'con')=>(side==='con'?-1:1)*(Math.PI/2-ANGLE);
/** 某队座位坐标系里的一点：k 是座位（1 远端、0 中间、-1 近端），forward 沿面朝方向，along 沿桌子往远端，y 是高度。 */
function teamPoint(side:'pro'|'con',k:number,forward:number,along:number,y:number):Point {
  const yaw=Math.PI/2-ANGLE,fx=Math.sin(yaw),fz=Math.cos(yaw),ax=Math.cos(yaw),az=-Math.sin(yaw),d=SEAT_SPACING*k+along;
  const x=CHAIR_X+ax*d+fx*forward,z=TEAM_Z+az*d+fz*forward;return [side==='con'?18-x:x,y,z];
}
/** 一辩坐远端（靠辩题板），三辩坐近端。 */
const SEAT_K=[1,0,-1];
export function buildDebateRoom():Room {
  const b=new Builder();
  // 地板（y=0）和门外的门廊平台。
  b.fill(0,17,0,0,0,16,'birch_planks');
  b.fill(7,10,0,0,17,18,'spruce_planks');
  b.fill(7,10,0,0,18,18,'spruce_stairs',{facing:'north'});
  // 墙三段（第 12.5 节）：y=1 石板灰墙裙，y=2–4 奶油墙面，y=5 顶木。
  for(let y=1;y<=5;y++){
    const id=y===1?'gray_concrete':y<5?'smooth_sandstone':'spruce_log';
    b.fill(0,17,y,y,0,0,id,{axis:'x'}).fill(0,17,y,y,16,16,id,{axis:'x'}).fill(0,0,y,y,1,15,id,{axis:'z'}).fill(17,17,y,y,1,15,id,{axis:'z'});
  }
  // 石板灰柱：四角和墙的中段（参照图里的竖灰条）。
  for(const x of [0,17])for(const z of [0,7,16])b.fill(x,x,1,5,z,z,'gray_concrete');
  for(const z of [0,16])for(const x of [4,13])b.fill(x,x,1,5,z,z,'gray_concrete');
  // 四周完整的屋顶围边；默认机位在门内，不再剖开屋顶。
  b.fill(0,17,6,6,0,0,'spruce_planks').fill(0,17,6,6,16,16,'spruce_planks').fill(0,0,6,6,1,15,'spruce_planks').fill(17,17,6,6,1,15,'spruce_planks');
  // 窗户：两侧墙各两扇（西墙迎着下午的太阳，光柱从这里进来）。
  const windows:Room['windows']=[];
  for(const x of [0,17])for(const z of [3,10]){b.fill(x,x,2,3,z,z+2,'glass_pane');if(!x)windows.push({y0:2,y1:4,z0:z,z1:z+3,floor:1});}
  // 南墙中央的双开门，后方中央通道贯通到讲台。
  for(const x of [8,9])for(const y of [1,2])b.put(x,y,16,'spruce_door',{facing:'north',half:y===1?'lower':'upper',hinge:x===8?'left':'right'});
  // 北墙两角的书架（彩色书脊，bookshelf 混 chiseled_bookshelf），猫趴在西边这列顶上。
  for(const x0 of [1,14])for(let x=x0;x<=x0+1;x++)for(let y=1;y<=3;y++)b.put(x,y,1,(x+y)%3?'bookshelf':'chiseled_bookshelf');
  // 队旗挂北墙、辩题板两侧（左蓝右红）。
  b.put(3,4,1,'blue_wall_banner',{facing:'south'});b.put(14,4,1,'red_wall_banner',{facing:'south'});
  // 讲台两侧各一盆绿植；绿植沿墙一圈（第 12.5 节摆设密度）。
  b.put(6,1,1,'potted_azalea_bush',{});b.put(11,1,1,'potted_azalea_bush',{});
  for(const x of [1,16])for(const z of [3,8,14])b.put(x,1,z,'potted_fern',{});
  // 红长凳（楼梯 + 红地毯）：两侧墙靠南各一排，南墙门口两边各一排（第 12.15 节）。
  for(const z of [10,11]){b.put(1,1,z,'spruce_stairs',{facing:'east'}).put(1,2,z,'red_carpet');b.put(16,1,z,'spruce_stairs',{facing:'west'}).put(16,2,z,'red_carpet');}
  for(const x of [2,3,4,13,14,15]){b.put(x,1,15,'spruce_stairs',{facing:'north'}).put(x,2,15,'red_carpet');}
  // 壁灯：侧墙栅栏挑灯、辩题板两边各一盏、南墙长凳上方各一盏（暖光成排，不挂画面上沿禁区，12.12 第 7 条）。
  for(const x of [1,16])for(const z of [6,12])b.put(x,3,z,'spruce_fence').put(x,2,z,'lantern',{hanging:'true'});
  for(const x of [3,14])b.put(x,3,1,'spruce_fence').put(x,2,1,'lantern',{hanging:'true'});
  for(const x of [5,12])b.put(x,3,15,'spruce_fence').put(x,2,15,'lantern',{hanging:'true'});
  // 两队桌后的落地灯笼（给座位补光）。
  for(const x of [1,16])b.put(x,1,9,'lantern');
  const anchors:ActorAnchor[]=[];
  for(const side of ['pro','con'] as const){
    SEAT_K.forEach((k,i)=>{const z=[5,7,9][i];anchors.push({seat:teamPoint(side,k,0,0,1.5),stand:teamPoint(side,k,.18,0,1),homeYaw:teamYaw(side),mic:side+'-'+z,chair:'chair-'+side+'-'+z});});
  }
  // 主持台后移（12.16 用户反馈）：与选手桌拉开距离，门口到讲台的通道更完整。
  const host:Point=[9,1,2.05];anchors.push({seat:host,stand:host,homeYaw:0,mic:'host'});
  const layout:PropLayout={tables:[],chairs:[],desk:[],podium:{position:[9,1,2.7],yaw:0},board:{position:[9,4.65,1.07],width:8.8,height:2.4},phaseLamps:[[8.25,3.12,1.075],[9,3.12,1.075],[9.75,3.12,1.075]]};
  for(const side of ['pro','con'] as const){const base=side==='con'?3:0,yaw=teamYaw(side);
    // 桌子按游戏人物的比例（第 12.12 节「桌子」）：桌面高 0.95、厚 0.14、深 1，坐着时前臂正好平放。
    layout.tables.push({id:side+'-table',side,center:teamPoint(side,0,1.02,0,1),length:TABLE_LENGTH,depth:1,height:.95,skirtYaw:yaw});
    [5,7,9].forEach((z,i)=>{const actor=base+i,k=SEAT_K[i];
      layout.chairs.push({id:'chair-'+side+'-'+z,side,position:teamPoint(side,k,0,0,1),yaw,slide:.3,actor});
      layout.desk.push({id:side+'-'+z,side,actor,mic:teamPoint(side,k,.85,0,1.95),yaw});});
  }
  // 门口右侧的一张小桌和一把评委椅，把中央进门通道留出来（12.15）。
  layout.tables.push({id:'judge-table',side:'judge',center:[14.2,1,12.2],length:1.7,depth:.85,height:.95,skirtYaw:Math.PI});
  layout.chairs.push({id:'chair-judge-0',side:'judge',position:[14.2,1,13.2],yaw:Math.PI,slide:0});
  // 全景要装下的点：两队远端和近端座位身后的椅背和人（含名字牌的余量）。
  const fit:Point[]=[];for(const side of ['pro','con'] as const)for(const k of [1,-1])for(const y of [1,3.2])fit.push(teamPoint(side,k,-.35,k<0?-.25:0,y));
  return {blocks:b.connect(),ceiling:new Builder().fill(1,16,6,6,1,15,'birch_planks').connect(),bounds:{min:[1,1,1],max:[17,6,16]},anchors,host,camera:[9,4.1,15.2],cameraTarget:[9,2.8,5.6],fit,judge:[14.2,2.55,13.2],judgeTarget:[9,2.5,5.5],layout,windows,banners:[{position:[3.5,4,1.06],side:'pro',yaw:Math.PI},{position:[14.5,4,1.06],side:'con',yaw:Math.PI}],
    floor:[{y:1.011,x0:1,x1:17,z0:1,z1:16}]};
}
