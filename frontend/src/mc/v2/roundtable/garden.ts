/**
 * 园里的中景建筑（道具层，第二轮新加）：
 *   - 粉墙黛瓦的园墙：青砖勒脚、粉墙身、两坡小瓦顶；南墙和北墙各一个月洞门（细青石门框），几扇漏窗；
 *   - 北岸假山顶的方亭（美人靠三面、西面接上山石阶）；
 *   - 临水两层楼：下层槅扇门、腰檐，上层半窗和栏杆，歇山顶；前面临水平台和石栏；
 *   - 沿北墙的游廊（单坡顶贴着墙）；
 *   - 西面水口的石拱桥（半圆券洞，倒影里是一个整圆）。
 * 屋面都是一层层的方块瓦（voxelRoof），和主榭的方块屋顶同一种语言。这些网格不进方块碰撞，镜头碰撞箱（occluders）一起返回。
 */
import * as THREE from 'three';
import type {V2Kit} from '../kit';
import {TexBoxes,paintedMaterial,roofCurve,voxelRoof} from './mesh';
import {blend,valueNoise} from '../pixel';
import {GARDEN,GARDEN_PAINTERS as PT} from './paint';
import {R,bay,eaveEdge,frustum,louChuang,meiRenKao,panel,pix,stoneRail,wingCorner,type Draw,type Mats} from './timber';
import {ARCH,GROUND,HILL_PAVILION,LATTICE_WINDOWS,NORTH_CORRIDOR,WALLS,WATER} from './site';
import {HILL_TOP} from './terrain';

export type Occluder={id:string;center:[number,number,number];half:[number,number,number];yaw:number};
const Wd=GARDEN.wood;

/** 步步锦格子（槅扇、半窗的格心）：16×16 像素一格（0.5 米），深栗木棂条，镂空透光 */
const stepLattice:Draw=(c,w,h)=>{c.clearRect(0,0,w,h);const f=Wd.base;R(c,0,0,w,1,f);R(c,0,h-1,w,1,f);R(c,0,0,1,h,f);R(c,w-1,0,1,h,f);
  for(const y of [5,10])R(c,1,y,w-2,1,f);for(const x of [5,10])R(c,x,1,1,h-2,f);
  for(const [x0,y0] of [[1,1],[6,1],[11,1],[1,6],[6,6],[11,6],[1,11],[6,11],[11,11]] as const){if((x0+y0)%2===0){R(c,x0,y0+2,2,1,f);R(c,x0+2,y0,1,2,f);}else{R(c,x0+2,y0+2,2,1,f);R(c,x0+1,y0+2,1,2,f);}}};

/**
 * 园墙的粉墙：一张 64×64 像素的大图（每米 16 像素，4 米一铺），几乎是平的暖白——几块很淡的大片深浅（墙面刷过几遍的样子）、
 * 墙脚往上 1 米一层很淡的潮痕，没有一米一个的重复花纹（重复的小图在长墙上会排成一格一格的墙纸）。
 */
function wallPlaster(k:V2Kit){
  const key='rt-wall-plaster-64',cached=wallMats.get(k);if(cached)return cached;
  const N=64,cv=document.createElement('canvas');cv.width=cv.height=N;const c=cv.getContext('2d')!,P=GARDEN.plaster,n=valueNoise(611);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const v=n(x/9,y/9)*.6+n(x/23,y/23)*.4,damp=Math.max(0,(y-46)/18);c.fillStyle=blend(v<.28?blend(P.base,P.light,.35):P.base,P.shade,(v>.72?.22:0)+damp*.3);c.fillRect(x,N-1-y,1,1);}
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/4,1/4);
  const m=new THREE.MeshStandardMaterial({map:t,roughness:.95,metalness:0});m.name=key;k.owned.push(t,m);wallMats.set(k,m);return m;
}
const wallMats=new WeakMap<V2Kit,THREE.MeshStandardMaterial>();

interface Shared {k:V2Kit;g:THREE.Group;M:Mats;plaster:TexBoxes;brick:TexBoxes;tile:TexBoxes;stone:TexBoxes}

// ——园墙
const WALL_T=.4,WALL_H=3.2,BASE_H=.5;
interface Run {id:string;along:'x'|'z';fixed:number;from:number;to:number;gates:Array<{at:number;r:number}>;windows:Array<{at:number;kind:number}>;ends?:boolean}
const RUNS:Run[]=[
  {id:'north',along:'x',fixed:WALLS.north+.3,from:WALLS.west,to:WALLS.east,gates:[{at:WALLS.gateNorth,r:1.2}],windows:[]},
  {id:'east',along:'z',fixed:WALLS.east-.3,from:WALLS.north,to:WALLS.south,gates:[],windows:[]},
  {id:'south',along:'x',fixed:WALLS.south-.3,from:WALLS.west,to:WALLS.east,gates:[{at:WALLS.gateSouth,r:1.25}],windows:[]},
  {id:'west-n',along:'z',fixed:WALLS.west+.3,from:WALLS.north,to:-6.4,gates:[],windows:[],ends:true},
  {id:'west-s',along:'z',fixed:WALLS.west+.3,from:6.4,to:WALLS.south,gates:[],windows:[],ends:true},
];
// 门洞、漏窗在 site.ts 里是世界坐标（顺着墙的那一维），这里换成墙的局部坐标（从 run.from 量起）；漏窗 2 米宽，at 是它的起点
for(const run of RUNS)run.gates=run.gates.map(g=>({...g,at:g.at-run.from}));
for(const w of LATTICE_WINDOWS){const run=RUNS.find(r=>r.id===w.wall);run?.windows.push({at:w.at+1-(run?.from??0),kind:w.kind});}

/**
 * 墙身或勒脚的平面形（墙的局部：u 顺着墙 0…L，v 是离地高度 v0…v1）。月洞门的圆（底边离地 6 厘米）切进去：
 * 墙身从下沿往上切（notch='bottom'，绕过圆顶），勒脚从上沿往下切（notch='top'，绕过圆底）；漏窗是洞（墙身才有）。
 * 圆按 1/16 米一级取像素台阶，和方块世界一样的边。
 */
function wallShape(L:number,v0:number,v1:number,gates:Run['gates'],windows:Run['windows'],notch:'bottom'|'top'){
  const s=new THREE.Shape(),arc=(cx:number,cy:number,r:number,from:number,to:number)=>{const N=56;for(let i=1;i<N;i++){const a=from+(to-from)*i/N;s.lineTo(Math.round((cx+Math.cos(a)*r)*16)/16,Math.round((cy+Math.sin(a)*r)*16)/16);}};
  const sorted=[...gates].sort((a,b)=>a.at-b.at),cut=(gt:Run['gates'][number],v:number)=>{const cy=gt.r+.06,dy=v-cy;return {cy,dy,hw:Math.sqrt(Math.max(0,gt.r*gt.r-dy*dy))};};
  s.moveTo(0,v0);
  // 下沿从左往右：墙身在每个门洞处往上绕过圆顶（角度从左下 180°+ 递减到右下）
  for(const gt of notch==='bottom'?sorted:[]){const {cy,dy,hw}=cut(gt,v0);if(hw<=0)continue;s.lineTo(gt.at-hw,v0);const a0=Math.PI-Math.asin(dy/gt.r),a1=Math.asin(dy/gt.r);arc(gt.at,cy,gt.r,a0,a1+(a1>a0?-Math.PI*2:0));s.lineTo(gt.at+hw,v0);}
  s.lineTo(L,v0);s.lineTo(L,v1);
  // 上沿从右往左：勒脚在每个门洞处往下绕过圆底
  for(const gt of notch==='top'?[...sorted].reverse():[]){const {cy,dy,hw}=cut(gt,v1);if(hw<=0)continue;s.lineTo(gt.at+hw,v1);const a0=Math.asin(dy/gt.r),a1=Math.PI-Math.asin(dy/gt.r);arc(gt.at,cy,gt.r,a0,a1-Math.PI*2);s.lineTo(gt.at-hw,v1);}
  s.lineTo(0,v1);s.lineTo(0,v0);
  for(const w of notch==='bottom'?windows:[]){const cy=WINDOW_V,y0=cy-.55,y1=cy+.55;const hole=new THREE.Path();hole.moveTo(w.at-.8,y0);hole.lineTo(w.at+.8,y0);hole.lineTo(w.at+.8,y1);hole.lineTo(w.at-.8,y1);hole.lineTo(w.at-.8,y0);s.holes.push(hole);}
  return s;
}
/** 漏窗中心离地高度 */
const WINDOW_V=1.65;
function wallRun(S:Shared,run:Run){
  const {k,g,M}=S,L=run.to-run.from,local=new THREE.Group();g.add(local);
  // 局部坐标：x 顺着墙、y 向上、z 是墙厚方向（墙心在 z=0）
  if(run.along==='x')local.position.set(run.from,GROUND,run.fixed);else{local.position.set(run.fixed,GROUND,run.from);local.rotation.y=-Math.PI/2;}
  const plaster=wallPlaster(k),brick=paintedMaterial(k,'rt-wall-brick',PT.greyBrick);
  const body=new THREE.ExtrudeGeometry(wallShape(L,BASE_H,WALL_H,run.gates,run.windows,'bottom'),{depth:WALL_T,bevelEnabled:false,curveSegments:1});
  const bodyMesh=new THREE.Mesh(body,plaster);bodyMesh.position.z=-WALL_T/2;bodyMesh.castShadow=bodyMesh.receiveShadow=true;local.add(bodyMesh);
  const base=new THREE.ExtrudeGeometry(wallShape(L,0,BASE_H,run.gates,[],'top'),{depth:WALL_T+.04,bevelEnabled:false,curveSegments:1});
  const baseMesh=new THREE.Mesh(base,new THREE.MeshStandardMaterial({map:brick.map,roughness:.95,metalness:0}));baseMesh.position.z=-(WALL_T+.04)/2;baseMesh.castShadow=baseMesh.receiveShadow=true;local.add(baseMesh);k.owned.push(baseMesh.material as THREE.Material);
  // 瓦顶：两坡，一层层的方块瓦，中间一道脊；墙身顶下一道深色压檐线
  const tile=new TexBoxes(),tileMat=paintedMaterial(k,'rt-tile',PT.tileV);
  voxelRoof(tile,0,L,-.5,.5,(_x,z)=>WALL_H+.06+.4*Math.pow(1-Math.abs(z)/.5,.85),{cell:.125,step:.0625,thick:.12});
  for(let x=0;x<L;x+=.5)tile.add(x+.25,WALL_H+.53,0,.5,.14,.2,0,new THREE.Color(.62,.64,.68),['bottom']);
  local.add(tile.mesh(tileMat,'wall-tile-'+run.id));
  for(const z of [-WALL_T/2-.006,WALL_T/2+.006]){const band=k.box(local,L,.08,.012,M.tileDark,L/2,WALL_H-.04,z,16);band.castShadow=false;}
  // 月洞门：两面各一圈细青石门框
  for(const gt of run.gates)for(const z of [-WALL_T/2-.015,WALL_T/2+.015]){const ring=new THREE.Shape(),cy=gt.r+.06;ring.absarc(gt.at,cy,gt.r+.1,0,Math.PI*2,false);const inner=new THREE.Path();inner.absarc(gt.at,cy,gt.r,0,Math.PI*2,true);ring.holes.push(inner);
    const rg=new THREE.Mesh(new THREE.ExtrudeGeometry(ring,{depth:.03,bevelEnabled:false,curveSegments:40}),M.stone);rg.position.z=z-.015;rg.receiveShadow=true;local.add(rg);
    k.box(local,gt.r*1.2,.06,WALL_T+.06,M.stone,gt.at,.03,0,16);}
  // 漏窗：花格 + 青砖框（两面）
  run.windows.forEach((w,i)=>{const m=pix(k,'rt-louchuang-'+w.kind,32,32,louChuang(w.kind),{alpha:true,side:THREE.DoubleSide});const p=panel(k,local,m,1.6,1.1,32,32,20,w.at,WINDOW_V,0);p.name='lou-'+run.id+'-'+i;
    for(const z of [-WALL_T/2-.02,WALL_T/2+.02]){k.box(local,1.84,.12,.05,M.brick,w.at,WINDOW_V+.61,z,16);k.box(local,1.84,.12,.05,M.brick,w.at,WINDOW_V-.61,z,16);for(const s of [-1,1])k.box(local,.12,1.1,.05,M.brick,w.at+s*.86,WINDOW_V,z,16);}});
  // 墙头收住（西墙在河道两岸断开）：一根稍粗的墙垛，顶上一个小瓦帽
  if(run.ends)for(const at of [run.along==='z'&&run.to<0?L:0]){k.box(local,.6,WALL_H+.1,.6,M.plaster,at,(WALL_H+.1)/2,0,16);k.box(local,.66,BASE_H,.66,M.brick,at,BASE_H/2,0,16);k.box(local,.78,.16,.78,M.tileDark,at,WALL_H+.18,0,16);}
}

// ——北岸假山顶的方亭
function hillPavilion(S:Shared){
  const {k,g,M}=S,{x,z,half}=HILL_PAVILION,floor=GROUND+HILL_TOP+.24,top=floor+2.8,c=half-.12;
  S.stone.add(x,GROUND+HILL_TOP+.12,z,half*2+.6,.24,half*2+.6,0,new THREE.Color(1,1,1),['bottom']);
  const corners:Array<[number,number]>=[[x-c,z-c],[x+c,z-c],[x+c,z+c],[x-c,z+c]];
  for(const [px,pz] of corners){k.box(g,.2,top-floor,.2,M.woodV,px,(floor+top)/2,pz,32);k.prism(g,.15,.12,8,M.stone,px,floor+.06,pz);}
  for(let i=0;i<4;i++){const [ax,az]=corners[i],[bx,bz]=corners[(i+1)%4];bay(k,g,M,ax,az,bx,bz,top,true);
    // 美人靠：北、东、南三面；西面接上山的石阶
    const mx=(ax+bx)/2-x,mz=(az+bz)/2-z,l=Math.hypot(mx,mz);if(i!==3)meiRenKao(k,g,M,ax,az,bx,bz,floor,[mx/l,mz/l]);}
  // 四角攒尖：一层层的方块瓦，近檐口缓、近顶陡；宝顶；四条起翘的戗脊
  const e=half+.85,eave=top+.12;
  voxelRoof(S.tile,x-e,x+e,z-e,z+e,(px,pz)=>{const t=Math.min(e-Math.abs(px-x),e-Math.abs(pz-z))/e;return eave+1.75*roofCurve(t);},{cell:.2,step:.1,thick:.18});
  let y=eave+1.78;for(const [rr,h] of [[.24,.16],[.17,.26],[.22,.12],[.09,.3]] as const){frustum(k,g,rr*.9,rr,h,8,[M.tileDark,M.tileDark,M.tileDark],x,y+h/2,z);y+=h;}
  for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]] as const){const out=new THREE.Vector3(sx,0,sz).normalize();wingCorner(k,g,M,new THREE.Vector3(x+sx*(e-1.15),eave+.72,z+sz*(e-1.15)),new THREE.Vector3(x+sx*e,eave+.18,z+sz*e),out,.55);}
  k.box(g,half*2+.5,.04,half*2+.5,M.ceiling,x,top+.06,z,16);
}

// ——临水两层楼（柱网：下层、上层同一套）
const LOU_FRAME={px:[29.2,32.07,34.93,37.8],pz:[-32.6,-29.5,-26.4]};
function lou(S:Shared){
  const {k,g,M}=S,{px,pz}=LOU_FRAME,x0=px[0],x1=px[3],z0=pz[0],z1=pz[2],cx=(x0+x1)/2,cz=(z0+z1)/2;
  const f0=GROUND,t0=GROUND+3.3,f1=t0+.2,t1=f1+2.75;
  const lattice=pix(k,'rt-step-lattice',16,16,stepLattice,{alpha:true,side:THREE.DoubleSide});
  // 柱：下层、上层同一根柱网；外圈 10 根
  const ring:Array<[number,number]>=[];for(const x of px)for(const z of pz)if(x===x0||x===x1||z===z0||z===z1)ring.push([x,z]);
  for(const [x,z] of ring){k.box(g,.24,t1-f0,.24,M.woodV,x,(f0+t1)/2,z,32);k.prism(g,.17,.14,8,M.stone,x,f0+.07,z);}
  // 下层：后墙（粉墙）、两侧粉墙开漏窗、前面一排槅扇门（每跨四扇，上格心下裙板）
  const wallBox=(ax:number,az:number,bx:number,bz:number,y0:number,y1:number)=>{const along=Math.abs(bx-ax)>Math.abs(bz-az),len=Math.hypot(bx-ax,bz-az)-.24;S.plaster.add((ax+bx)/2,(y0+y1)/2,(az+bz)/2,along?len:.16,y1-y0,along?.16:len,0,new THREE.Color(1,1,1),[]);
    S.brick.add((ax+bx)/2,y0+.22,(az+bz)/2,along?len:.2,.44,along?.2:len,0,new THREE.Color(1,1,1),['top']);};
  for(let i=0;i<3;i++){wallBox(px[i],z0,px[i+1],z0,f0,t0);bay(k,g,M,px[i],z0,px[i+1],z0,t0,false);}
  for(const x of [x0,x1])for(let j=0;j<2;j++){wallBox(x,pz[j],x,pz[j+1],f0,t0);bay(k,g,M,x,pz[j],x,pz[j+1],t0,false);
    const m=pix(k,'rt-louchuang-'+((j+1)%3),32,32,louChuang((j+1)%3),{alpha:true,side:THREE.DoubleSide});const w=panel(k,g,m,1.1,.8,32,32,20,x+(x===x0?-.09:.09),f0+1.75,(pz[j]+pz[j+1])/2,Math.PI/2);w.name='lou-window';}
  for(let i=0;i<3;i++){const a=px[i]+.12,b=px[i+1]-.12,w=(b-a)/4;bay(k,g,M,px[i],z1,px[i+1],z1,t0,false);
    for(let j=0;j<4;j++){const cxp=a+w*(j+.5),open=i===1&&(j===1||j===2);if(open)continue;
      panel(k,g,lattice,w-.04,1.75,16,16,32,cxp,f0+.85+1.75/2+.1,z1);k.box(g,w-.02,.85,.05,M.woodDark,cxp,f0+.85/2+.05,z1,32);k.box(g,.04,2.75,.06,M.wood,a+w*j,f0+1.4,z1,32);}
    panel(k,g,lattice,b-a,.3,16,16,32,(a+b)/2,t0-.44,z1);}
  // 楼板和腰檐：楼板一圈深色木边；腰檐一圈方块瓦往外挑 0.9 米
  k.box(g,x1-x0+.3,.2,z1-z0+.3,M.woodDark,cx,t0+.1,cz,16);
  voxelRoof(S.tile,x0-1.05,x1+1.05,z0-1.05,z1+1.05,(x,z)=>{const dx=Math.max(x0-x,x-x1,0),dz=Math.max(z0-z,z-z1,0),d=Math.max(dx,dz);if(d<.12)return null;return t0+.68-.52*Math.pow(Math.min(1,d/1.05),.9);},{cell:.2,step:.08,thick:.14});
  // 上层：前面一道栏杆板、上面半窗（步步锦）；后面和两侧粉墙，各开一扇小漏窗
  for(let i=0;i<3;i++){const a=px[i]+.12,b=px[i+1]-.12;bay(k,g,M,px[i],z1,px[i+1],z1,t1,false);
    k.box(g,b-a,.62,.06,M.woodDark,(a+b)/2,f1+.31,z1+.02,32);k.box(g,b-a+.1,.06,.12,M.wood,(a+b)/2,f1+.64,z1+.02,32);
    panel(k,g,lattice,b-a,1.55,16,16,32,(a+b)/2,f1+.7+1.55/2,z1-.03);
    wallBox(px[i],z0,px[i+1],z0,f1,t1);bay(k,g,M,px[i],z0,px[i+1],z0,t1,false);}
  for(const x of [x0,x1])for(let j=0;j<2;j++){wallBox(x,pz[j],x,pz[j+1],f1,t1);bay(k,g,M,x,pz[j],x,pz[j+1],t1,false);}
  // 歇山顶：前后两坡到脊，两头先是披檐、到六成高处收成粉白山花
  const ex=(x1-x0)/2+1.05,ez=(z1-z0)/2+1.05,eave=t1+.1,rise=2.05,gableT=.58,gx=ex-gableT*ez;
  voxelRoof(S.tile,cx-ex,cx+ex,cz-ez,cz+ez,(x,z)=>{const tz=(ez-Math.abs(z-cz))/ez,tx=(ex-Math.abs(x-cx))/ez;const t=tx<gableT?Math.min(tz,tx):tz;return eave+rise*roofCurve(t);},{cell:.2,step:.1,thick:.2});
  for(const s of [-1,1]){const shape=new THREE.Shape(),hz=ez*(1-gableT),yb=eave+rise*roofCurve(gableT);shape.moveTo(-hz,yb);for(let i=0;i<=16;i++){const zz=-hz+2*hz*i/16,t=(ez-Math.abs(zz))/ez;shape.lineTo(zz,eave+rise*roofCurve(t)-.08);}shape.lineTo(hz,yb);
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),M.plaster);m.rotation.y=Math.PI/2*s;m.position.set(cx+s*(gx+.02),0,cz);m.castShadow=true;m.receiveShadow=true;g.add(m);}
  const rl=2*gx+.2;k.box(g,rl,.2,.26,M.tileDark,cx,eave+rise+.1,cz,16);for(const s of [-1,1])k.box(g,.3,.32,.3,M.tileDark,cx+s*rl/2,eave+rise+.16,cz,16);
  for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]] as const){const out=new THREE.Vector3(sx,0,sz).normalize(),ccx=cx+sx*ex,ccz=cz+sz*ez;wingCorner(k,g,M,new THREE.Vector3(ccx-out.x*1.3,eave+.62,ccz-out.z*1.3),new THREE.Vector3(ccx,eave+.16,ccz),out,.62);}
  for(const [ax,az,bx,bz,ox2,oz2] of [[cx-ex,cz+ez,cx+ex,cz+ez,0,1],[cx-ex,cz-ez,cx+ex,cz-ez,0,-1]] as const)eaveEdge(k,g,M,new THREE.Vector3(ax,0,az),new THREE.Vector3(bx,0,bz),new THREE.Vector3(ox2,0,oz2),eave);
  // 临水平台的石栏（平台在 LOU.terrace，岸线 z=−24）
  stoneRail(k,g,M,x0-.9,-24.2,x1+.9,-24.2,GROUND,.5);
}

// ——沿北墙的游廊（单坡顶贴着墙，前面一排细柱和挂落）
function northCorridor(S:Shared){
  const {k,g,M}=S,{x0,x1}=NORTH_CORRIDOR,zf=-41.6,zw=WALLS.north+.5,top=GROUND+2.55;
  const xs:number[]=[];for(let x=x0+.5;x<=x1+.51;x+=3)xs.push(x);
  for(const x of xs){k.box(g,.18,top-GROUND,.18,M.woodV,x,(GROUND+top)/2,zf,32);k.prism(g,.13,.1,8,M.stone,x,GROUND+.05,zf);}
  for(let i=0;i<xs.length-1;i++)bay(k,g,M,xs[i],zf,xs[i+1],zf,top,true);
  const front=zf+.75,depth=front-zw;
  voxelRoof(S.tile,x0,x1+1,zw,front,(_x,z)=>top+.12+.62*roofCurve((front-z)/depth),{cell:.25,step:.08,thick:.16});
  eaveEdge(k,g,M,new THREE.Vector3(x0,0,front),new THREE.Vector3(x1+1,0,front),new THREE.Vector3(0,0,1),top+.12);
}

// ——西面水口的石拱桥
function archBridge(S:Shared){
  const {k,g,M}=S,{x,z0,z1,width,crown}=ARCH,zc=(z0+z1)/2,L=z1-z0,Ra=2.25,cell=.25,hw=width/2;
  const deck=(z:number)=>{const u=(z-zc)/(L/2);return GROUND+(crown-GROUND)*Math.pow(Math.max(0,1-u*u),.72);};
  for(let z=z0;z<z1-1e-6;z+=cell){const zz=z+cell/2,top=Math.round(deck(zz)*8)/8,dz=zz-zc,bottom=Math.abs(dz)<Ra?WATER-.05+Math.sqrt(Ra*Ra-dz*dz):WATER-.6;
    S.stone.add(x,(top+bottom)/2,zz,width,top-bottom,cell,0,new THREE.Color(1,1,1),Math.abs(dz)<Ra?[]:['bottom']);
    // 两侧栏板：低矮的青石板，每隔一段一根望柱高出一点
    const post=Math.round((zz-z0)/cell)%5===0;
    for(const s of [-1,1])S.stone.add(x+s*(hw-.09),top+(post?.34:.27),zz,.16,post?.68:.54,cell,0,new THREE.Color(.9,.9,.9),['bottom']);}
  // 券洞一圈券石（深一点的线），倒影里正好接成一个整圆
  for(const s of [-1,1]){const ring=new THREE.Shape();ring.absarc(0,WATER-.05,Ra+.18,0,Math.PI,false);ring.lineTo(-Ra,WATER-.05);ring.absarc(0,WATER-.05,Ra,Math.PI,0,true);ring.lineTo(Ra+.18,WATER-.05);
    const m=new THREE.Mesh(new THREE.ShapeGeometry(ring,24),M.stone);m.rotation.y=Math.PI/2;m.position.set(x+s*(hw+.012),0,zc);if(s<0)m.rotation.y=-Math.PI/2;m.receiveShadow=true;g.add(m);}
}

export function buildGardenArchitecture(k:V2Kit,M:Mats):THREE.Group{
  const g=new THREE.Group();g.name='garden-architecture';
  const S:Shared={k,g,M,plaster:new TexBoxes(),brick:new TexBoxes(),tile:new TexBoxes(),stone:new TexBoxes()};
  for(const run of RUNS)wallRun(S,run);
  hillPavilion(S);lou(S);northCorridor(S);archBridge(S);
  const mat=(key:string,p:typeof PT.plaster)=>paintedMaterial(k,key,p);
  if(!S.plaster.empty)g.add(S.plaster.mesh(mat('rt-wall-plaster',PT.plaster),'garden-plaster'));
  if(!S.brick.empty)g.add(S.brick.mesh(mat('rt-wall-brick',PT.greyBrick),'garden-brick'));
  if(!S.tile.empty)g.add(S.tile.mesh(mat('rt-tile',PT.tileV),'garden-roofs'));
  if(!S.stone.empty)g.add(S.stone.mesh(mat('rt-green-stone',PT.greenStone),'garden-stone'));
  return g;
}

/**
 * 中景建筑的镜头碰撞箱（不画出来，给 RoomPhysics 和观察镜头用；房间构建时就要有，不能等道具层）。
 * 园墙每段一个长箱子（月洞门不开洞：镜头不从门里穿过去）；方亭、两层楼、北廊顶、拱桥各一个。
 */
export function gardenOccluders():Occluder[]{
  const out:Occluder[]=[];
  for(const run of RUNS){const L=run.to-run.from,mid=run.from+L/2,y=GROUND+(WALL_H+.5)/2,h=(WALL_H+.5)/2;out.push({id:'wall-'+run.id,center:run.along==='x'?[mid,y,run.fixed]:[run.fixed,y,mid],half:run.along==='x'?[L/2,h,.3]:[.3,h,L/2],yaw:0});}
  const {x,z,half}=HILL_PAVILION,floor=GROUND+HILL_TOP+.24,e=half+.85;out.push({id:'hill-pavilion',center:[x,floor+2.2,z],half:[e,2.2,e],yaw:0});
  const {px,pz}=LOU_FRAME,top=GROUND+3.3+.2+2.75+2.05;out.push({id:'lou',center:[(px[0]+px[3])/2,(GROUND+top)/2,(pz[0]+pz[2])/2],half:[(px[3]-px[0])/2+.45,(top-GROUND)/2,(pz[2]-pz[0])/2+.45],yaw:0});
  const {x0,x1}=NORTH_CORRIDOR,zw=WALLS.north+.5,front=-41.6+.75;out.push({id:'north-corridor',center:[(x0+x1+1)/2,GROUND+2.95,(zw+front)/2],half:[(x1+1-x0)/2,.45,(front-zw)/2],yaw:0});
  const zc=(ARCH.z0+ARCH.z1)/2;out.push({id:'arch-bridge',center:[ARCH.x,(GROUND+ARCH.crown)/2,zc],half:[ARCH.width/2,(ARCH.crown-GROUND)/2+.3,(ARCH.z1-ARCH.z0)/2-1],yaw:0});
  return out;
}
