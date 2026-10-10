/**
 * v2 圆桌「水上园林茶叙榭」（第二轮，方向由用户 2026-10-09 / 2026-10-10 给定，尚未通过视觉验收）：
 * 一座围合的苏式园林水面——主榭（茶叙榭）在南岸、三面临水；北岸中景是黄石假山和山顶方亭、临水两层楼、沿墙游廊、粉墙月洞门；
 * 东面水廊通到半岛上的六角亭；西面水口一座石拱桥，水流出园成河道，河道尽头远远一座小塔（借景）。略带阴翳的傍晚，自然光为主。
 * 方块结构（structure.ts + terrain.ts）、细木作（timber.ts）、中景建筑（garden.ts）、驳岸（shore.ts）、水面（water.ts）、
 * 植物（flora.ts）、家具陈设（furnish.ts）、天和远景（scenery.ts）、地面（floor.ts）、话题匾（board.ts）在这里装成一个 Room。
 * 总平面见 site.ts，设计说明见 docs/design/ROUNDTABLE_GARDEN.md。
 */
import * as THREE from 'three';
import type {Kit} from '../../props/furniture';
import type {ActorAnchor,Room} from '../../rooms/types';
import type {Point} from '../../rooms/builders';
import {MC_SCENE_NAMES} from '../../rooms/names';
import {createV2Kit,place,type V2Kit} from '../kit';
import {makeChair} from '../../props/chairs';
import {GARDEN_PAINT} from './paint';
import {buildGarden} from './structure';
import {buildTimber,mats} from './timber';
import {buildGardenArchitecture,gardenOccluders} from './garden';
import {buildShore} from './shore';
import {gardenWater} from './water';
import {buildScenery,sunDirection,type Evening} from './scenery';
import {bambooGrove,banana,canopyTree,ferns,lotusPatch,pine,reeds,rockery,shrubs,weepingWillow} from './flora';
import {boat,bambooBlind,bonsaiStand,cord,palaceLantern,paperLantern,roundTable} from './furnish';
import {teaHallFloor} from './floor';
import {drawHallBoard} from './board';
import {hillHeight} from './terrain';
import {CANOPY,GROUND,HALL,POST_X,POST_Z,VIEW,WATER,WILLOWS} from './site';

/** 同一个道具 Kit 只配一个 v2 工具（材质缓存、统一释放）。 */
const kits=new WeakMap<Kit,V2Kit>();
const v2=(k:Kit)=>{let x=kits.get(k);if(!x){x=createV2Kit(k.owned);kits.set(k,x);}return x;};

export const RT={
  /** 圆桌半径 1.6（直径 3.2 米）、桌高 0.72；椅子中心离桌沿约 0.55 米，每席弧长约 1.7 米，八席。 */
  tableR:1.6,tableH:.72,seatGap:.55,
  /** 座位相位：默认机位（西南角）正对着两个座位之间的空当，越过空当看得到桌面和对面的人 */
  phase:THREE.MathUtils.degToRad(26.4),
  /** 每个座位一点点不同的转角和远近（弧度、米）：松一点，不像会议桌那样一个个排齐 */
  yaw:[.06,-.05,.03,-.07,.05,-.03,.07,-.04],radius:[.04,-.03,.05,0,-.04,.03,-.02,.05],
};
/** 椅垫只用一种素色（灰过的月白青），八把椅子是一套 */
export const CUSHION='#a9b2ae';
/** 略带阴翳的傍晚：太阳在西南偏西（方位角 208° 即罗盘约 242°）、仰角 14°，被薄云罩着的淡金；天边雾色偏冷的灰。 */
export const EVENING:Evening={azimuth:208,elevation:14,sun:'#ffe4c6',haze:'#c6cad0'};

export function buildRoundtableV2():Room{
  const {x:cx,z:cz}=HALL.table;
  const anchors:ActorAnchor[]=[],chairs:Room['layout']['chairs']=[];
  for(let i=0;i<8;i++){const a=RT.phase+i*Math.PI/4,R=RT.tableR+RT.seatGap+RT.radius[i],x=cx+R*Math.cos(a),z=cz+R*Math.sin(a),yaw=Math.atan2(cx-x,cz-z)+RT.yaw[i];
    anchors.push({seat:[x,1.5,z],stand:[x,1,z],homeYaw:yaw,mic:'seat-'+i,chair:'chair-'+i});
    chairs.push({id:'chair-'+i,side:'judge',position:[x,1,z],yaw,slide:.2,actor:i});}
  /** 话题匾：挂在北面中间一跨的檐枋下，朝厅内（+z）；匾下是月台、水面和北岸假山亭 */
  const board={position:[cx,4.04,POST_Z[0]+.16] as Point,width:2.8,height:.86};
  // 人工灯只有两盏，都很暗：厅内西北角一盏宫灯（不在桌子正上方，不挡人脸）、水廊转角一盏纸灯。自然光是主光。
  const lights:Room['lights']=[
    {position:[12.2,3.75,8.6],length:.3,intensity:.8,distance:4.5,kind:'lantern',shadow:false,color:'#ffe9cc'},
    {position:[26.5,3.45,8.4],length:.3,intensity:.6,distance:4,kind:'lantern',shadow:false,color:'#ffe9cc'},
  ];
  const [camera,cameraTarget]=[VIEW.camera,VIEW.target];
  const animated:Array<(now:number)=>void>=[];
  const {builder,roofAt}=buildGarden();
  const room:Room={
    kind:'roundtable',title:MC_SCENE_NAMES.roundtable,seatedSpeech:true,material:'original',
    blocks:builder.connect(),ceiling:[],anchors,host:[cx,1,cz+3.9],camera,cameraTarget,fov:VIEW.fov,
    fit:[...anchors.map(a=>[a.seat[0],a.seat[1]+1.3,a.seat[2]] as Point),...[-1,1].map(s=>[board.position[0]+s*board.width/2,board.position[1]+board.height/2+.1,board.position[2]] as Point)],
    judge:[20.65,3.05,8.45],judgeTarget:[13.2,1.75,15.4],
    layout:{tables:[{id:'round-table',side:'judge',center:[cx,1,cz],length:RT.tableR*2,depth:RT.tableR*2,height:RT.tableH,shape:'round',skirtYaw:0}],chairs,desk:[],podium:{position:[cx,1,cz+3.9],yaw:Math.PI},board,phaseLamps:[]},
    // 地面图盖住整个厅（x 10–23、z 7–19）：柱线以内方砖、柱线一圈青石。
    banners:[],windows:[],floor:[{y:1.002,x0:10,x1:23,z0:7,z1:19}],lights,
    floorArt:(c,w,d)=>teaHallFloor(c,w,d,{edge:{x0:POST_X[0]-10+.14,x1:POST_X[3]-10-.14,z0:POST_Z[0]-7+.14,z1:POST_Z[3]-7-.14}}),
    // 网格做的屋顶和中景建筑不进方块碰撞：水廊卷棚（底面在梁枋附近，人在廊里走不会被托住）、园墙、北岸楼亭、拱桥各补一只挡镜头的箱子。
    occluders:[
      {id:'corridor-roof-a',center:[23.65,5.5,12.5],half:[1.45,.45,2.5],yaw:0},
      {id:'corridor-roof-b',center:[26.5,5.5,7.55],half:[2.5,.45,2.45],yaw:0},
      {id:'corridor-roof-c',center:[31.1,5.5,4.5],half:[2.1,.45,2.5],yaw:0},
      {id:'corridor-roof-hip-n',center:[27.05,5.5,12.5],half:[1.95,.45,2.5],yaw:0},
      {id:'corridor-roof-hip-s',center:[26.5,5.5,3.55],half:[2.5,.45,1.55],yaw:0},
      ...gardenOccluders(),
    ],
    bounds:{min:[POST_X[0]+.45,1,POST_Z[0]+.45],max:[POST_X[3]-.45,5.9,POST_Z[3]-.45]},
    // 观察镜头能飞遍园内（围墙以内），飞不出园墙
    flight:{min:[-15,1,-43],max:[51,20,26]},
    // 光：自然光为主——被薄云罩着的西南斜阳（暖、柔），天光偏冷；人工灯只有两盏很暗的；不靠泛光造氛围。
    // 太阳阴影罩住整个园子（中景的楼亭、树也投影）。
    look:{background:'#c6cad0',outdoor:true,sky:'#b4bfce',ground:'#a39b8d',ambient:1.1,
      sun:{color:EVENING.sun,intensity:3.6,azimuth:EVENING.azimuth,elevation:EVENING.elevation,shadow:.82},exposure:1.28,indirect:.38,
      haze:EVENING.haze,fog:[60,420],skyTop:'#5d7299',saturation:.96,shadowArea:{center:[18,-8],half:44},bloom:.05},
    paint:{...GARDEN_PAINT},
    boardStyle:'sign',boardFrame:'block/dark_oak_planks',
    drawBoard:drawHallBoard,
    makeChair:(k)=>makeChair(v2(k),'garden',CUSHION),
    decorateBoard:(k,sign)=>{const g=v2(k),iron=g.flat('#3a3633',{rough:.5}),drop=HALL.postTop-.3-(board.position[1]+board.height/2);
      // 两根细铁杆把匾吊在檐枋下面
      for(const s of [-1,1]){g.box(sign,.07,.12,.1,iron,s*1.15,board.height/2+.05,-.02);g.box(sign,.03,drop,.03,iron,s*1.15,board.height/2+drop/2,-.02);}},
    animate:now=>{for(const f of animated)f(now);},
    decorate:(k,root)=>{const g=v2(k),floor=GROUND,M=mats(g);
      root.add(buildScenery(g,EVENING));
      root.add(gardenWater(g,{sun:sunDirection(EVENING),sunColor:EVENING.sun,shallow:'#4f5641',deep:'#26302b',sky:'#c2cad1'}));
      buildTimber(g,root,{roofAt});
      root.add(buildGardenArchitecture(g,M));
      const shore=buildShore(g);root.add(shore.mesh);
      // ——圆桌（桌面留空）；厅内只挂一盏不亮的宫灯在西北角
      root.add(place(roundTable(g,RT.tableR,RT.tableH),cx,floor,cz));
      root.add(place(cord(g,1.3),12.2,4.15,8.6));root.add(place(palaceLantern(g,.26,.8),12.2,4.15,8.6));
      // ——东北角一个花几盆景（框住东面的水和廊），西面中间一跨放下半幅竹帘：斜阳穿过篾缝在地上、桌上落出细条纹
      root.add(place(bonsaiStand(g,.86,3),20.85,floor,8.3));
      root.add(place(bambooBlind(g,3.6,1.15),POST_X[0]-.06,HALL.postTop-.36,(POST_Z[1]+POST_Z[2])/2,Math.PI/2));
      root.add(place(bambooBlind(g,2.75,.3),POST_X[0]-.06,HALL.postTop-.36,(POST_Z[2]+POST_Z[3])/2,Math.PI/2));
      // ——水廊转角一盏纸灯（很暗）
      root.add(place(cord(g,.4),26.5,3.55,8.4));root.add(place(paperLantern(g,.24,.75),26.5,3.55,8.4));
      // ——树（位置在 site.ts）：柳只在水边，大树在院角、山后和墙根，松在假山和小岛的石头上
      for(const w of WILLOWS)root.add(weepingWillow(g,w.x,floor,w.z,w.lean,w.s,w.seed));
      // 南院西南角的大榉树：往东北探，傍晚的斜阳穿过它的树冠，在榭里落下斑驳的光
      for(const t of CANOPY)root.add(canopyTree(g,t.x,floor+hillHeight(t.x,t.z),t.z,{h:t.h,spread:t.spread,lean:t.lean,palette:t.palette,cell:t.cell},t.seed));
      for(const [x,z,s,seed] of [[9.6,-28.6,1.15,41],[17.8,-35.6,1,42],[-1.3,.3,1.1,43]] as const)root.add(pine(g,x,x<0?WATER+1.1:floor+hillHeight(x,z),z,s,seed));
      // ——竹：靠墙角、墙根，不进院子中间
      root.add(bambooGrove(g,-4.6,floor,25.6,1.4,16,4.5,6.8,51));root.add(bambooGrove(g,30.4,floor,25.8,1.3,14,4,6,52));
      // 南院：月洞门东侧墙根一小丛竹、前面一块立石（粉墙前的竹石小景），从厅里往南看不是一片白墙
      root.add(bambooGrove(g,21.4,floor,25.9,.8,9,3.6,5.4,56));
      root.add(bambooGrove(g,-10,floor,-41.8,1.6,18,5,7.5,53));root.add(bambooGrove(g,47.6,floor,-41.6,1.5,16,4.5,7,54));
      root.add(banana(g,27.6,floor,25.4,27));root.add(banana(g,27.2,floor,-27.6,28));
      // 南墙月洞门外：门里看得见的一丛竹（和 CANOPY 里那棵桂，都在园外，不进碰撞），门洞不是一块白板
      root.add(bambooGrove(g,17.6,floor,30.4,1.8,20,4.5,6.8,55));
      // ——水里的：荷只在东北的浅湾和小岛西南一片；菖蒲芦苇在水口两岸和东北湾边
      root.add(lotusPatch(g,34,-21.6,43.5,-14,34,31));root.add(lotusPatch(g,-7.4,4.6,-3,11.6,16,32));
      root.add(reeds(g,[[-12.6,4.2],[-11.4,5],[-12.4,-4.2],[-11,-5.2],[44.6,-14.6],[45.4,-12.4],[3.4,-21.4],[-7.8,13.2]],WATER,35));
      // ——湖石：南院西南角一块立峰（在大树下）、月洞门旁两块小的、小岛上一组、两层楼台角一块
      root.add(rockery(g,[[-1.6,floor,23.4,1.5],[13.2,floor,25.7,.55],[20.2,floor,25.4,.85],[-2.4,WATER-.2,-.3,1.2],[-.4,WATER-.2,1.6,.9],[-1.2,WATER-.2,-1.6,.7],[28.4,floor,-25.4,.6]],41));
      // ——灌木：假山上石崖之间的平处、山谷里一团团（不在崖边、不在石阶上），墙根几团
      const hillShrubs:Array<[number,number,number,number]>=[];{let seed=71;const rr=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        for(let i=0;i<60&&hillShrubs.length<16;i++){const x=1+rr()*25,z=-40+rr()*15,h=hillHeight(x,z);if(h<1||h>=4.5)continue;
          if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>Math.abs(hillHeight(x+dx*.9,z+dz*.9)-h)>.6))continue;if(hillShrubs.some(([sx,,sz])=>Math.hypot(sx-x,sz-z)<2.4))continue;hillShrubs.push([x,floor+h,z,.55+rr()*.5]);}}
      root.add(shrubs(g,[...hillShrubs,[-8,floor,-40,1.2],[-13.2,floor,-25,1],[-12.6,floor,-36.5,1.1],[44,floor,24.6,.9],[2,floor,25.6,.8],[40.6,floor,-40.4,1]],61));
      root.add(ferns(g,shore.crevices.filter((_c,i,a)=>i%Math.max(1,Math.ceil(a.length/40))===0).map(c=>({x:c.x,y:floor-.05,z:c.z,out:c.out})),62));
      root.add(place(boat(g),17.4,WATER,-.45,.12));
      root.traverse(o=>{const f=o.userData.animate as ((now:number)=>void)|undefined;if(f)animated.push(f);});
    },
  };
  return room;
}
