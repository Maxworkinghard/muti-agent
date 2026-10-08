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
import {HALL,TERRAIN,buildHall} from './hall';
import {drawHallBoard} from './board';
import {blossomSpray,teaStation,cord,hearthFire,octagonTable,paperLantern,pottedShrub,PROP_PAINT,reedBlind,teaSet} from './furnish';
import {makeChair,SOFT_FABRIC} from '../../props/chairs';
import {plankHall} from '../../props/floors';

/** 同一个道具 Kit 只配一个 v2 工具（材质缓存、统一释放）。 */
const kits=new WeakMap<Kit,V2Kit>();
const v2=(k:Kit)=>{let x=kits.get(k);if(!x){x=createV2Kit(k.owned);kits.set(k,x);}return x;};

export const RT={
  /** 桌面外接圆半径 2.05（直径 4.1 米）、座位圈半径 2.60：每人约 2.0 米弧长。桌高仍是 0.95。 */
  tableR:2.05,tableH:.95,seatGap:.55,
  /** 座位从正东偏 30° 起每 45° 一个：默认机位（西南角）正对着两个座位之间的空当，看得到桌面 */
  phase:Math.PI/6};

export function buildRoundtableV2():Room{
  const {x:cx,z:cz}=HALL.table,R=RT.tableR+RT.seatGap;
  const anchors:ActorAnchor[]=[],chairs:Room['layout']['chairs']=[];
  for(let i=0;i<8;i++){const a=RT.phase+i*Math.PI/4,x=cx+R*Math.cos(a),z=cz+R*Math.sin(a),yaw=Math.atan2(cx-x,cz-z);
    anchors.push({seat:[x,1.5,z],stand:[x,1,z],homeYaw:yaw,mic:'seat-'+i,chair:'chair-'+i});
    chairs.push({id:'chair-'+i,side:'judge',position:[x,1,z],yaw,slide:.2,actor:i});}
  /** 匾挂在北口抬高的那根梁下，比原先高 0.2 米；匾下和匾上都还看得到湖与山 */
  const board={position:[cx,4.6,5.08] as Point,width:3,height:1};
  const lights:Room['lights']=[
    // 暖光只照亮自己周围一圈：桌上一池、壁炉前一池，衰减得快，和窗外的冷天光形成对比。
    {position:[cx,3.95,cz],length:.4,intensity:5,distance:7,kind:'lantern',shadow:false,color:'#ffcf8a'},
    {position:[18.6,1.55,10],length:.3,intensity:8,distance:8,kind:'lantern',shadow:true,color:'#ff9a4a'},
    {position:[6.5,3.05,1.5],length:.3,intensity:.8,distance:5,kind:'lantern',shadow:false,color:'#ffd49a'},
    {position:[19.5,3.05,1.5],length:.3,intensity:.8,distance:5,kind:'lantern',shadow:false,color:'#ffd49a'},
  ];
  /** 默认机位：西南角、略高于站立人眼，离桌子 7 米；左边是北口外的湖和山，右边是桌子和壁炉 */
  const camera:Point=[7.7,3.05,14.5],cameraTarget:Point=[14.6,2.0,5.4];
  let fire:THREE.Group|null=null;
  const room:Room={
    kind:'roundtable',title:MC_SCENE_NAMES.roundtable,seatedSpeech:true,material:'original',
    blocks:buildHall().connect(),ceiling:[],anchors,host:[cx,1,cz+3.2],camera,cameraTarget,fov:50,
    fit:[...anchors.map(a=>[a.seat[0],a.seat[1]+1.3,a.seat[2]] as Point),...[-1,1].map(s=>[board.position[0]+s*board.width/2,board.position[1]+board.height/2+.1,board.position[2]] as Point)],
    judge:[17.4,2.7,13.9],judgeTarget:[12.6,1.9,8.8],
    layout:{tables:[{id:'round-table',side:'judge',center:[cx,1,cz],length:RT.tableR*2,depth:RT.tableR*2,height:RT.tableH,shape:'round',skirtYaw:0}],chairs,desk:[],podium:{position:[cx,1,cz+3.2],yaw:Math.PI},board,phaseLamps:[]},
    // 地面：厅内 x 7–19、z 5–15 盖一张 16 像素/米的浅木地板（深橡木包边，壁炉前的石炉床对着方块世界 x 17–18、z 8–11），
    // 桌下一块八角地毯（中心就是桌子 13,10，相对这张地面是 6,5）。方块地面照旧负责走路、碰撞和光照。
    banners:[],windows:[],floor:[{y:1.002,x0:7,x1:19,z0:5,z1:15}],lights,
    floorArt:(c,w,d)=>plankHall(c,w,d,{border:8,hearth:{x0:10,x1:12,z0:3,z1:7},rug:{cx:6,cz:5,r:2.45}}),
    bounds:{min:[6.05,1,1.05],max:[19.95,5.95,15.95]},
    flight:{min:[-4,1,-6],max:[30,16,24]},
    // 光：低角度的西南斜阳更强、天光和环境光更弱——室内深处暗下来，地上的柱影和帘影更清楚，灯和炉火的暖光池才看得见。
    look:{background:'#c3d7ea',outdoor:true,sky:'#b9d2ee',ground:'#8f8676',ambient:.7,
      sun:{color:'#ffe6c4',intensity:4.4,azimuth:205,elevation:17,shadow:.95},exposure:1.1,indirect:.28,
      haze:'#c3d7ea',fog:[80,420],skyTop:'#3f7fd0',saturation:1},
    paint:{...V2_BLOCK_PAINT},
    boardStyle:'sign',boardFrame:'block/dark_oak_planks',
    drawBoard:drawHallBoard,
    // 共用椅子族的会议木椅：座面 0.50、自然木框、低饱和布垫（每个座位一种颜色）
    makeChair:(k,c)=>makeChair(v2(k),'meeting',SOFT_FABRIC[(c.actor??0)%SOFT_FABRIC.length]),
    decorateBoard:(k,sign)=>{const g=v2(k),iron=g.mat('iron',PROP_PAINT.iron),drop=HALL.beamY+1-(board.position[1]+board.height/2);
      // 两根铁吊杆把匾挂在抬高的梁下。
      for(const s of [-1,1]){g.box(sign,.08,.16,.12,iron,s*1.25,board.height/2+.06,-.02);g.box(sign,.035,drop,.035,iron,s*1.25,board.height/2+drop/2,-.02);}},
    animate:now=>{(fire?.userData.flicker as ((n:number)=>void)|undefined)?.(now);},
    decorate:(k,root)=>{const g=v2(k);
      root.add(buildLandscape(g,{water:-.35,shore:0,farShore:-110,mountains:-200,west:-70,east:100,ground:0,seed:7,hole:TERRAIN,center:[cx,cz]}));
      // 柱础：每根柱子脚下一块石头。
      const stone=g.mat('stone',V2_BLOCK_PAINT['block/stone_bricks']);
      for(const x of HALL.cols.x)for(const z of [4,15])g.box(root,.86,.18,.86,stone,x+.5,1.09,z+.5);
      for(const z of [7,12])for(const x of [6,19])g.box(root,.86,.18,.86,stone,x+.5,1.09,z+.5);
      // 檩条：顺屋脊方向，贴着望板底面；藻井那段断开。
      const beam=g.mat('purlin',V2_BLOCK_PAINT['block/stripped_dark_oak_log']);
      const purlin=(x:number,z0:number,z1:number)=>{const top=HALL.underside(Math.floor(x));g.box(root,.34,.34,z1-z0,beam,x,top-.17,(z0+z1)/2);};
      for(const x of [8.5,17.5])purlin(x,3,17);
      for(const x of [10.5,15.5])for(const [z0,z1] of [[3,7],[13,17]])purlin(x,z0,z1);
      for(const [z0,z1] of [[3,7],[13,17]]){const top=HALL.underside(12);g.box(root,.4,.4,z1-z0,beam,13,top-.2,(z0+z1)/2);}
      // 北山墙的童柱：梁上一根短柱顶住脊檩，从厅里看出去，山花被它分成两扇三角窗。
      g.box(root,.32,HALL.underside(12)-7,.32,beam,13,(HALL.underside(12)+7)/2,4.5);
      // 会议圈：八角桌、茶具。地毯画在地面贴图上，不再铺一块草编席。
      root.add(place(octagonTable(g,RT.tableR,RT.tableH),cx,1,cz));
      root.add(teaSet(g,anchors.map(a=>[a.seat[0],a.seat[2]] as [number,number]),cx,cz,1+RT.tableH,RT.tableR));
      // 壁炉：火、壁炉台和台上两三件小东西。
      fire=hearthFire(g);root.add(place(fire,19,1,10));
      const mantel=g.mat('frame-planks',V2_BLOCK_PAINT['block/dark_oak_planks']);g.box(root,.42,.16,4.3,mantel,17.85,3.08,10);
      g.box(root,.18,.26,.18,g.mat('ceramic',PROP_PAINT.ceramic),17.8,3.29,8.6);g.box(root,.14,.2,.14,g.mat('teapot',PROP_PAINT.teapot),17.8,3.26,8.95);
      root.add(place(pottedShrub(g,.55,true,true,5),17.82,3.16,11.35));
      // 灯：桌子上方的大纸灯从天窗楼顶垂下来，前廊两个外角各一盏小灯。
      const top=HALL.caisson.top;root.add(place(cord(g,top-4.55),cx,4.55,cz));root.add(place(paperLantern(g,.56,.8),cx,4.55,cz));
      // 前廊是露天平台：两角各一根木灯柱，顶上一盏小纸灯。
      for(const x of [6.5,19.5]){g.box(root,.16,1.8,.16,beam,x,1.9,1.5);g.box(root,.5,.08,.12,beam,x,2.84,1.5);root.add(place(paperLantern(g,.3,.7),x,2.88+.42,1.5));}
      // 植物：西栏上两盆、前廊两角、书架边一大盆，节奏不对称。
      root.add(place(pottedShrub(g,.7,false,false,11),6.5,1.5,8.6));
      root.add(place(pottedShrub(g,.8,false,true,12),6.5,1.5,13.6));
      root.add(place(pottedShrub(g,1.2,true,false,13),7.3,1,2.0));
      root.add(place(pottedShrub(g,1.1,true,true,14),18.2,1,2.2));
      root.add(place(pottedShrub(g,1.3,false,false,15),18.1,1,14.1));
      // 西南一跨放下半幅芦苇帘：低角度的阳光穿过帘缝，在地上落成条纹。
      root.add(place(reedBlind(g,2.6,1.6),6.5,5,14.0,Math.PI/2));
      // 山墙封檐板：南北两端顺着屋面坡度各两块深色板，盖住台阶瓦和两层屋面之间的空隙；东西檐口一根檐檩。
      const verge=g.mat('verge',V2_BLOCK_PAINT['block/dark_oak_planks']),slope=Math.atan(.5),len=9*Math.hypot(1,.5);
      for(const z of [2.94,17.06])for(const s of [-1,1]){const m=g.box(root,len,.9,.12,verge,13+s*4.5,9.55-2.25-.45,z);m.rotation.z=-s*slope;}
      for(const x of [3.98,22.02])g.box(root,.28,1.04,14.1,beam,x,4.5,10);
      // 前景框景：默认机位左上方，从西侧那根檩条（x=8.5）上垂下两枝樱花。
      root.add(place(blossomSpray(g,1.6,1.15,21),8.5,5.66,10.7,Math.PI/2));root.add(place(blossomSpray(g,1.0,.85,22),8.5,5.66,9.5,Math.PI/2+.5));
      // 前景左下：西侧中间一跨、半高石栏里面的茶台（矮几、炭炉、铁壶、两个坐垫），让镜头前不是一整片空地板。
      root.add(place(teaStation(g),8.9,1,9.5,Math.PI));
      // 西侧入口（北边一跨）外的三块踏步石。
      const step=g.mat('cobble',V2_BLOCK_PAINT['block/cobblestone']);for(const [x,z] of [[4.2,5.6],[3.1,5.1],[2.0,5.8]] as const)g.box(root,.8,.08,.7,step,x,.04,z);
    },
  };
  return room;
}
