/**
 * v2 圆桌会议室「湖畔木构议事厅」：把方块结构（hall.ts）、家具陈设（furnish.ts）、远景（../landscape.ts）、
 * 话题匾（board.ts）装成一个 Room。Room 的契约（八个座位锚点、话题板、镜头、碰撞、光照）见 docs/rebuild/00-contract.md。
 */
import * as THREE from 'three';
import type {Kit} from '../../props/furniture';
import type {ActorAnchor,Room} from '../../rooms/debate';
import type {Point} from '../../rooms/builders';
import {MC_SCENE_NAMES} from '../../rooms/names';
import {V2_BLOCK_PAINT} from '../blockTextures';
import {createV2Kit,place,type V2Kit} from '../kit';
import {buildLandscape} from '../landscape';
import {PAL} from '../pixel';
import {HALL,TERRAIN,buildHall} from './hall';
import {drawHallBoard} from './board';
import {chair,cord,hearthFire,octagonMat,octagonTable,paperLantern,pottedShrub,PROP_PAINT,reedBlind,teaSet} from './furnish';

/** 同一个道具 Kit 只配一个 v2 工具（材质缓存、统一释放）。 */
const kits=new WeakMap<Kit,V2Kit>();
const v2=(k:Kit)=>{let x=kits.get(k);if(!x){x=createV2Kit(k.owned);kits.set(k,x);}return x;};

export const RT={tableR:1.45,tableH:.95,seatGap:.36,
  /** 座位从正东偏 22.5° 起每 45° 一个：默认机位（西南）正对着两个座位之间的空当，看得到桌面 */
  phase:Math.PI/8};

export function buildRoundtableV2():Room{
  const {x:cx,z:cz}=HALL.table,R=RT.tableR+RT.seatGap;
  const anchors:ActorAnchor[]=[],chairs:Room['layout']['chairs']=[];
  for(let i=0;i<8;i++){const a=RT.phase+i*Math.PI/4,x=cx+R*Math.cos(a),z=cz+R*Math.sin(a),yaw=Math.atan2(cx-x,cz-z);
    anchors.push({seat:[x,1.5,z],stand:[x,1,z],homeYaw:yaw,mic:'seat-'+i,chair:'chair-'+i});
    chairs.push({id:'chair-'+i,side:'judge',position:[x,1,z],yaw,slide:.2,actor:i});}
  const board={position:[cx,4.4,5.08] as Point,width:3,height:1};
  const lights:Room['lights']=[
    {position:[cx,3.95,cz],length:.4,intensity:1.6,distance:8,kind:'lantern',shadow:false,color:'#ffd49a'},
    {position:[18.75,1.55,10],length:.3,intensity:2.6,distance:9,kind:'lantern',shadow:true,color:'#ff9c52'},
    {position:[6.5,4.1,2.5],length:.3,intensity:.8,distance:5,kind:'lantern',shadow:false,color:'#ffd49a'},
    {position:[19.5,4.1,2.5],length:.3,intensity:.8,distance:5,kind:'lantern',shadow:false,color:'#ffd49a'},
  ];
  const camera:Point=[7.0,4.3,14.6],cameraTarget:Point=[14.2,1.9,7.0];
  let fire:THREE.Group|null=null;
  const room:Room={
    kind:'roundtable',title:MC_SCENE_NAMES.roundtable,seatedSpeech:true,material:'original',
    blocks:buildHall().connect(),ceiling:[],anchors,host:[cx,1,cz+2.6],camera,cameraTarget,fov:52,
    fit:[...anchors.map(a=>[a.seat[0],a.seat[1]+1.3,a.seat[2]] as Point),...[-1,1].map(s=>[board.position[0]+s*board.width/2,board.position[1]+board.height/2+.1,board.position[2]] as Point)],
    judge:[17.4,2.7,13.9],judgeTarget:[12.6,1.9,8.8],
    layout:{tables:[{id:'round-table',side:'judge',center:[cx,1,cz],length:RT.tableR*2,depth:RT.tableR*2,height:RT.tableH,shape:'round',skirtYaw:0}],chairs,desk:[],podium:{position:[cx,1,cz+3.2],yaw:Math.PI},board,phaseLamps:[]},
    banners:[],windows:[],floor:[],lights,
    bounds:{min:[6.05,1,1.05],max:[19.95,5.95,15.95]},
    flight:{min:[-4,1,-6],max:[30,16,24]},
    look:{background:'#d2e1ee',outdoor:true,sky:'#c9dcf0',ground:'#a59c88',ambient:1.05,
      sun:{color:'#ffe9cf',intensity:3.4,azimuth:200,elevation:22,shadow:.9},exposure:1.12,indirect:.3,
      haze:'#d4e2ee',fog:[90,460],skyTop:'#5b93d3',saturation:1},
    paint:{...V2_BLOCK_PAINT},
    boardStyle:'sign',boardFrame:'block/dark_oak_planks',
    drawBoard:drawHallBoard,
    makeChair:(k,c)=>chair(v2(k),PAL.fabric[(c.actor??0)%PAL.fabric.length]),
    decorateBoard:(k,sign)=>{const g=v2(k),iron=g.mat('iron',PROP_PAINT.iron);for(const s of [-1,1]){g.box(sign,.08,.16,.12,iron,s*1.25,board.height/2+.1,-.02);}},
    animate:now=>{(fire?.userData.flicker as ((n:number)=>void)|undefined)?.(now);},
    decorate:(k,root)=>{const g=v2(k);
      root.add(buildLandscape(g,{water:-.35,shore:0,farShore:-110,mountains:-175,west:-70,east:100,ground:0,seed:7,hole:TERRAIN,peakScale:.5}));
      // 柱础：每根柱子脚下一块石头。
      const stone=g.mat('stone',V2_BLOCK_PAINT['block/stone_bricks']);
      for(const x of HALL.cols.x)for(const z of [4,15])g.box(root,.86,.18,.86,stone,x+.5,1.09,z+.5);
      for(const z of [7,12])for(const x of [6,19])g.box(root,.86,.18,.86,stone,x+.5,1.09,z+.5);
      for(const x of [6,19])g.box(root,.86,.18,.86,stone,x+.5,1.09,1.5);
      // 檩条：顺屋脊方向，贴着望板底面；藻井那段断开。
      const beam=g.mat('purlin',V2_BLOCK_PAINT['block/stripped_dark_oak_log']);
      const purlin=(x:number,z0:number,z1:number)=>{const top=HALL.underside(Math.floor(x));g.box(root,.34,.34,z1-z0,beam,x,top-.17,(z0+z1)/2);};
      for(const x of [8.5,17.5])purlin(x,1,17);
      for(const x of [10.5,15.5])for(const [z0,z1] of [[1,7],[13,17]])purlin(x,z0,z1);
      for(const [z0,z1] of [[1,7],[13,17]]){const top=HALL.underside(12);g.box(root,.4,.4,z1-z0,beam,13,top-.2,(z0+z1)/2);}
      // 会议圈：草编席、八角桌、茶具。
      root.add(place(octagonMat(g,2.95),cx,1,cz));
      root.add(place(octagonTable(g,RT.tableR,RT.tableH),cx,1,cz));
      root.add(teaSet(g,anchors.map(a=>[a.seat[0],a.seat[2]] as [number,number]),cx,cz,1+RT.tableH));
      // 壁炉：火、壁炉台和台上两三件小东西。
      fire=hearthFire(g);root.add(place(fire,19,1,10));
      const mantel=g.mat('frame-planks',V2_BLOCK_PAINT['block/dark_oak_planks']);g.box(root,.42,.16,4.3,mantel,17.85,3.08,10);
      g.box(root,.18,.26,.18,g.mat('ceramic',PROP_PAINT.ceramic),17.8,3.29,8.6);g.box(root,.14,.2,.14,g.mat('teapot',PROP_PAINT.teapot),17.8,3.26,8.95);
      root.add(place(pottedShrub(g,.55,true,true,5),17.82,3.16,11.35));
      // 灯：桌子上方的大纸灯从天窗楼顶垂下来，前廊两个外角各一盏小灯。
      const top=HALL.caisson.top;root.add(place(cord(g,top-4.55),cx,4.55,cz));root.add(place(paperLantern(g,.56,.8),cx,4.55,cz));
      for(const x of [6.5,19.5]){root.add(place(cord(g,.35),x,4.65,2.5));root.add(place(paperLantern(g,.3,.7),x,4.65,2.5));}
      // 植物：西栏上两盆、前廊两角、书架边一大盆，节奏不对称。
      root.add(place(pottedShrub(g,.7,false,false,11),6.5,1.5,5.4));
      root.add(place(pottedShrub(g,.8,false,true,12),6.5,1.5,13.6));
      root.add(place(pottedShrub(g,1.2,true,false,13),7.3,1,2.0));
      root.add(place(pottedShrub(g,1.1,true,true,14),18.2,1,2.2));
      root.add(place(pottedShrub(g,1.3,false,false,15),18.1,1,14.1));
      // 西南一跨放下半幅芦苇帘：低角度的阳光穿过帘缝，在地上落成条纹。
      root.add(place(reedBlind(g,2.6,1.6),6.5,5,14.0,Math.PI/2));
      // 山墙封檐板：南北两端顺着屋面坡度各两块深色板，盖住台阶瓦和两层屋面之间的空隙；东西檐口一根檐檩。
      const verge=g.mat('verge',V2_BLOCK_PAINT['block/dark_oak_planks']),slope=Math.atan(.5),len=9*Math.hypot(1,.5);
      for(const z of [.94,17.06])for(const s of [-1,1]){const m=g.box(root,len,.9,.12,verge,13+s*4.5,9.55-2.25-.45,z);m.rotation.z=-s*slope;}
      for(const x of [4.2,21.8])g.box(root,.4,.6,16,beam,x,4.72,9);
      // 西侧入口外的三块踏步石。
      const step=g.mat('cobble',V2_BLOCK_PAINT['block/cobblestone']);for(const [x,z] of [[4.2,10.1],[3.1,9.6],[2.0,10.3]] as const)g.box(root,.8,.08,.7,step,x,.04,z);
    },
  };
  return room;
}
