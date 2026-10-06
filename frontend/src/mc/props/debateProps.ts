import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import {createMaterials,type PropMaterials} from './materials';
import {mesh,rbox,mergeStatic,teamColor} from './geometry';
export {mergeStatic} from './geometry';
import {createTable} from './table';
import {createChair} from './chair';
import {createMic} from './mic';
import {createPodium} from './podium';
import {createBell} from './bell';
import {createBoard} from './board';
import {createTableDecor,createWallArt} from './decor';
/**
 * 台上的物件：像素风的暖木桌椅和绿植书堆（配色对齐 2D 场景），交互器件全是我的世界原味——
 * 桌上扳拉杆开麦、红石灯亮，主持按讲台按钮换阶段、拍桌铃、翻讲稿（第 0.2 节：先表达信息，物理上说得通）。
 */
export interface PropCast {id:string;anchor:number;side:'pro'|'con'|'host';name:string;identity:string}
export interface PropState {now:number;mics:Record<string,boolean>;stages:boolean[];stage:number;bellAt:number;pageAt:number;buttonAt:number;/** 每个座位（按 anchor 序号）此刻坐着的程度，1 是坐稳 */sit:Record<number,number>;theme:string;label:string;round:number;total:number;proNames:string[];conNames:string[];result:{pro?:number;con?:number;winner:'pro'|'con'|'tie'}|null;reduced:boolean}
export interface Fixture {id:string;actor:number;mount:THREE.Vector3;target:THREE.Vector3;on:boolean;since:number;level:number}
export interface PropContacts {mics:Map<string,THREE.Object3D>;nextRound:THREE.Object3D;bell:THREE.Object3D;script:THREE.Object3D}
export interface DebateProps {contacts:PropContacts;root:THREE.Group;fixtures:Fixture[];beamScale:number;update(s:PropState):void;setEnvironment(map:THREE.Texture|null,intensity?:number):void;setReflections(enabled:boolean):void;createBook(assets?:{itemAtlas:{width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>};itemTexture:THREE.Texture}):THREE.Group;dispose():void}
export interface AtlasLike {width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>}
export interface DebateProps {contacts:PropContacts;root:THREE.Group;fixtures:Fixture[];beamScale:number;update(s:PropState):void;setEnvironment(map:THREE.Texture|null,intensity?:number):void;setReflections(enabled:boolean):void;createBook(assets?:{itemAtlas:AtlasLike;itemTexture:THREE.Texture}):THREE.Group;dispose():void}
export function createDebateProps(room:Room,cast:PropCast[],items?:{itemAtlas:AtlasLike;itemTexture:THREE.Texture;atlas:AtlasLike;atlasTexture:THREE.Texture;textures:Map<string,THREE.Texture>}):DebateProps {
  // 方块贴图在图集里：给单个方块形状的道具（红石灯）把 UV 映射到指定贴图块上。
  const tileBox=items?(geo:THREE.BufferGeometry,tile:string):THREE.BufferGeometry=>{
    const t=items.atlas.textures[tile];if(!t)return geo;
    const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,(t.x+uv.getX(i)*t.width)/items.atlas.width,1-(t.y+(1-uv.getY(i))*t.height)/items.atlas.height);
    return geo;}:((geo:THREE.BufferGeometry)=>geo);
  const root=new THREE.Group();root.name='debate-props';
  const m=createMaterials(),owned:Array<THREE.Material|THREE.Texture>=[];
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  const layout=room.layout,byAnchor=new Map(cast.map(p=>[p.anchor,p]));
  // 青绿格纹的地垫：2D 场景的地板色，铺在舞台和观众席上，方块地面仍在下面管光照。
  if(room.floor.length){
    const tile=document.createElement('canvas');tile.width=tile.height=64;const tc=tile.getContext('2d')!;
    tc.fillStyle='#74b29b';tc.fillRect(0,0,32,32);tc.fillStyle='#67a489';tc.fillRect(32,0,32,32);tc.fillRect(0,32,32,32);tc.fillStyle='#74b29b';tc.fillRect(32,32,32,32);
    tc.fillStyle='#c5d08a';tc.fillRect(0,0,64,2);tc.fillRect(0,0,2,64);
    const tex=keep(new THREE.CanvasTexture(tile));tex.magFilter=THREE.NearestFilter;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;
    const mat=keep(new THREE.MeshStandardMaterial({map:tex,roughness:.95}));
    for(const f of room.floor){const w=f.x1-f.x0,d=f.z1-f.z0;tex.repeat.set(w,d);const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);
      const quad=mesh(g,mat,(f.x0+f.x1)/2,f.y,(f.z0+f.z1)/2,false);quad.name='floor-cloth';root.add(quad);}
    // 讲台脚下的圆形描线标记（第 12.5 节）：浅黄圆环 + 一横，画在地垫上，把讲台圈在中间（对齐 2D 参照）。
    const mark=document.createElement('canvas');mark.width=mark.height=256;const mc=mark.getContext('2d')!;
    mc.strokeStyle='#c5d08a';mc.lineWidth=7;mc.beginPath();mc.arc(128,128,86,0,Math.PI*2);mc.stroke();
    mc.fillStyle='#c5d08a';mc.fillRect(112,236,32,8);
    const markTex=keep(new THREE.CanvasTexture(mark));markTex.magFilter=THREE.NearestFilter;markTex.colorSpace=THREE.SRGBColorSpace;
    const ring=new THREE.PlaneGeometry(2.2,2.2);ring.rotateX(-Math.PI/2);
    const pod=layout.podium.position;
    root.add(mesh(ring,keep(new THREE.MeshStandardMaterial({map:markTex,transparent:true,roughness:.95})),pod[0],pod[1]+.016,pod[2],false));
    // 浅黄描线把辩论区围出来（第 12.5 节，对齐 2D 参照里那一圈黄线）：贴着书架和讲台后面，围到两队桌子外沿。
    const lineMat=keep(new THREE.MeshStandardMaterial({color:'#c5d08a',roughness:.95}));
    // 描线框包住两队桌子（12.16 二轮房间放宽后同步重算），前后留一点余量。
    const seats=layout.chairs.filter(c=>c.side==='pro'||c.side==='con');
    const xs=seats.map(c=>c.position[0]),zs=seats.map(c=>c.position[2]);
    const margin=layout.tables.find(t=>t.side==='pro')!.length/2+.9;
    const [bx0,bx1]=[Math.min(...xs)-margin,Math.max(...xs)+margin];
    const [bz0,bz1]=[room.bounds.min[2]+.3,Math.max(...zs)+1.4];
    for(const [w,d,x,z] of [[.14,bz1-bz0,bx0,(bz0+bz1)/2],[.14,bz1-bz0,bx1,(bz0+bz1)/2],[bx1-bx0,.14,(bx0+bx1)/2,bz0],[bx1-bx0,.14,(bx0+bx1)/2,bz1]] as const){
      const strip=new THREE.PlaneGeometry(w,d);strip.rotateX(-Math.PI/2);root.add(mesh(strip,lineMat,x,pod[1]+.013,z,false));}
  }
  // 桌子和椅子。
  for(const t of layout.tables)root.add(createTable(t,m));
  const chairs:Array<{group:THREE.Group;home:THREE.Vector3;back:THREE.Vector3;slide:number;actor?:number}>=[],dynamic=new Set<THREE.Object3D>();
  for(const c of layout.chairs){
    const g=createChair(c,m);root.add(g);
    chairs.push({group:g,home:g.position.clone(),back:new THREE.Vector3(-Math.sin(c.yaw),0,-Math.cos(c.yaw)),slide:c.slide,actor:c.actor});
    if(c.actor!==undefined)dynamic.add(g);
  }
  // 每个座位正前方：一支拉杆加一盏红石灯，扳拉杆开麦。
  const mics=new Map<string,{index:number;stick:THREE.Object3D;on:boolean;level:number}>();
  const tileRect=(key:string)=>{const t=items!.atlas.textures[key];return new THREE.Vector4(t.x/items!.atlas.width,1-(t.y+t.height)/items!.atlas.height,t.width/items!.atlas.width,t.height/items!.atlas.height);};
  const gameLamp=items?m.indicator(items.atlasTexture,tileRect('block/redstone_lamp'),tileRect('block/redstone_lamp_on')):m.glow('#ffb05c',2.6);
  const addMic=(id:string,parent:THREE.Object3D,pos:THREE.Vector3,yaw:number,index:number)=>{
    const unit=createMic(m,gameLamp,tileBox,index);unit.group.name='mic-'+id;unit.group.position.copy(pos);unit.group.rotation.y=yaw;parent.add(unit.group);
    dynamic.add(unit.stick);mics.set(id,{index,stick:unit.stick,on:false,level:0});
  };
  for(const d of layout.desk)if(d.mic&&d.actor!==undefined)addMic(d.id,root,new THREE.Vector3(...d.mic),d.yaw+Math.PI,d.actor);
  // 桌上的小摆设：书、绿植、蜡烛；北墙两幅金框风景画挂在书架上方。
  for(const t of layout.tables){const end=t.length/2-.55;const decor=createTableDecor(m,t.side==='judge'?'judge':t.side,end);
    // 摆件放在桌面上：y 要加桌面高度（第 12.12 节第 4 条，底面贴着桌面）。
    decor.position.set(t.center[0],t.center[1]+t.height,t.center[2]);decor.rotation.y=t.skirtYaw;root.add(decor);}
  for(const [x,name] of [[room.bounds.min[0]+1.95,'sunset'],[room.bounds.max[0]-1.95,'sea']] as const){const texture=items?.textures.get('painting/'+name+'.png');if(texture){const art=createWallArt(m,texture);art.position.set(x,4.75,1.06);root.add(art);}}
  // 讲台：按钮、翻页、主持的开麦灯、桌铃。
  const hostGlow=m.glow('#ff5a33',2.6);
  const {podium,podiumButton,flip,flipPage,shelf,hostLamp}=createPodium(layout,m,keep,dynamic,hostGlow);root.add(podium);
  const {bell,dome,plunger}=createBell(m);bell.name='desk-bell';shelf.add(bell);dynamic.add(bell);
  // 辩题板和墙上的三盏阶段灯。
  const {board,drawBoard}=createBoard(layout,m,keep);root.add(board);
  layout.phaseLamps.forEach((p,i)=>{const geometry=tileBox(new THREE.BoxGeometry(.5,.5,.14),'block/redstone_lamp');geometry.setAttribute('propGlow',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(7+i),1));const lamp=mesh(geometry,gameLamp,...p,false);lamp.rotation.y=Math.PI;root.add(lamp);});
  // 合并不会动的零件；会滑动的椅子在自己的组里再合并一次。
  mergeStatic(root,dynamic,m.flatBatch);for(const c of chairs)if(c.actor!==undefined)mergeStatic(c.group,new Set(),m.flatBatch);
  const bookMaterials=new Map<string,THREE.MeshStandardMaterial>();
  const bookMaterial=(name:string,make:()=>THREE.MeshStandardMaterial)=>{let mat=bookMaterials.get(name);if(!mat){mat=make();bookMaterials.set(name,mat);owned.push(mat);}return mat;};
  let lastNow=-1;
  const contacts:PropContacts={mics:new Map([...mics].map(([id,mic])=>[id,mic.stick])),nextRound:podiumButton,bell:plunger,script:flipPage};
  const props:DebateProps={contacts,root,fixtures:[],beamScale:0,
    update(s){
      const dt=lastNow<0?16.67:Math.max(0,s.now-lastNow);lastNow=s.now;const blend=s.reduced?1:1-Math.exp(-dt/55);
      for(const [id,mic] of mics){const on=!!s.mics[id];mic.level+=((on?1:0)-mic.level)*blend;m.levels.value[mic.index]=mic.level;
        stickRotation(mic.stick,mic.level);}
      m.levels.value[6]+=((s.mics['host']?1:0)-m.levels.value[6])*blend;
      for(const c of chairs){if(c.actor===undefined)continue;const sit=s.sit[c.actor]??1;c.group.position.copy(c.home).addScaledVector(c.back,c.slide*(1-sit));}
      const pressed=s.now-s.buttonAt;podiumButton.position.y=.039-(pressed>=0&&pressed<250?.012*Math.sin(pressed/250*Math.PI):0);
      const rung=s.now-s.bellAt;const ring=rung>=0&&rung<320;plunger.position.y=.056-(ring?.006*Math.sin(Math.min(1,rung/120)*Math.PI):0);dome.scale.setScalar(ring&&!s.reduced?1+.014*Math.sin(rung/9)*(1-rung/320):1);
      const turn=s.now-s.pageAt;flip.visible=turn>=0&&turn<520;if(flip.visible)flip.rotation.z=Math.PI*Math.min(1,turn/500);
      for(let i=0;i<3;i++)m.levels.value[7+i]+=((s.stages[i]?1:0)-m.levels.value[7+i])*blend;
      drawBoard(s);
    },
    setEnvironment(map,intensity=.9){m.env(map,intensity);},
    setReflections(){/* 像素风全是平色材质，没有透射面需要切换 */},
    createBook(assets){return createHandBook(items??assets,bookMaterial);},
    dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});for(const x of [...m.owned,...owned])x.dispose();}};
  // 拉杆从朝人一侧（0.62）扳到另一侧（-0.62），跟着亮度走，动作像游戏里的一样干脆。
  function stickRotation(stick:THREE.Object3D,level:number){stick.rotation.x=.62-1.24*level;}
  return props;
}
/** 辩手手里的书与笔：物品贴图交叉面片（游戏拿平面物品的样子），笔单独取出在思考时使用。 */
function createHandBook(assets?:{itemAtlas:{width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>};itemTexture:THREE.Texture},shared=(name:string,make:()=>THREE.MeshStandardMaterial)=>make()):THREE.Group {
  const g=new THREE.Group();
  const tile=assets?.itemAtlas.textures['item/writable_book'];
  if(assets&&tile){
    const uv=(geo:THREE.BufferGeometry)=>{const uvA=geo.getAttribute('uv');for(let i=0;i<uvA.count;i++)uvA.setXY(i,(tile.x+uvA.getX(i)*tile.width)/assets.itemAtlas.width,1-(tile.y+(1-uvA.getY(i))*tile.height)/assets.itemAtlas.height);return geo;};
    const mat=shared('item:'+assets.itemTexture.uuid,()=>new THREE.MeshStandardMaterial({map:assets.itemTexture,alphaTest:.1,side:THREE.DoubleSide,roughness:.9}));
    for(const ry of [0,Math.PI/2]){const quad=mesh(uv(new THREE.PlaneGeometry(.24,.24)),mat,0,.12,0,false);quad.rotation.y=ry;quad.castShadow=false;g.add(quad);}
  }else{
    g.add(mesh(rbox(.2,.03,.26,.004),shared('cover',()=>new THREE.MeshStandardMaterial({color:'#6b4a37',roughness:.9})),0,.02,0,false));
    g.add(mesh(rbox(.17,.012,.23,.004),shared('paper',()=>new THREE.MeshStandardMaterial({color:'#f6f2e8',roughness:.9})),0,.045,0,false));
  }
  const pen=new THREE.Group();pen.name='pen';pen.userData.pen=true;
  pen.add(mesh(new THREE.CylinderGeometry(.006,.006,.13,8),shared('pen',()=>new THREE.MeshStandardMaterial({color:'#3d3a42',roughness:.8})),0,0,0,false));
  g.add(pen);
  g.userData.pen=pen;
  return g;
}
