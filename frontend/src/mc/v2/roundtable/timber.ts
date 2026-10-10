/**
 * 茶叙榭的细木作与曲线部分（道具层，方块结构见 structure.ts）：
 *   梁枋与垫板、挂落（镂空花格，投影落在地上）、美人靠（鹅颈椅：座板 + 外倾的花格靠背）、
 *   船篷轩（厅内弧形的顶棚和一根根弯椽）、檐口（连檐、飞椽头、一排瓦当）、翼角（四角起翘的戗脊）、
 *   山花（粉白的山墙面 + 深色博风板 + 悬鱼）、圆光罩（东面中间一跨的圆洞花罩）、曲廊的梁枋/挂落/美人靠/轩顶、
 *   湖上六角亭、曲桥与平桥的石栏、粉墙上的月洞门和漏窗。
 * 尺寸都是米；贴图按每米 16 或 32 像素，镂空的地方用透明像素（alphaTest），阳光穿过去在地上落成花格影子。
 */
import * as THREE from 'three';
import type {V2Kit} from '../kit';
import {rng,tone} from '../pixel';
import {GARDEN} from './paint';
import {BRIDGE,CORRIDOR,HALL,PAVILION,POST_X,POST_Z,WATER,type Segment} from './site';
import {corridorPosts} from './structure';

const Wd=GARDEN.wood,T=GARDEN.tile;
export type Draw=(c:CanvasRenderingContext2D,w:number,h:number)=>void;
/** 任意尺寸的像素贴图材质（最近邻、平铺），按 key 缓存在这间房的材质表里。 */
const cache=new WeakMap<V2Kit,Map<string,THREE.MeshStandardMaterial>>();
export function pix(k:V2Kit,key:string,w:number,h:number,draw:Draw,o:{alpha?:boolean;side?:THREE.Side;rough?:number;color?:string}={}){
  let m0=cache.get(k);if(!m0){m0=new Map();cache.set(k,m0);}const hit=m0.get(key);if(hit)return hit;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;draw(c,w,h);
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  const m=new THREE.MeshStandardMaterial({map:t,roughness:o.rough??.85,metalness:0,alphaTest:o.alpha?.5:0,transparent:false,side:o.side??THREE.FrontSide,color:o.color??'#ffffff'});
  k.owned.push(t,m);m0.set(key,m);return m;
}
export const R=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,col:string)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
/** 一块贴图平面（双面），w×h 米，贴图按 px 每米平铺（tw×th 是贴图像素） */
export function panel(k:V2Kit,parent:THREE.Object3D,m:THREE.Material,w:number,h:number,tw:number,th:number,px:number,x:number,y:number,z:number,yaw=0){
  const g=new THREE.PlaneGeometry(w,h),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w*px/tw,uv.getY(i)*h*px/th);
  const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
/** 截锥（上下半径不同的棱柱），贴图像 kit.prism 一样按每米像素铺 */
export function frustum(k:V2Kit,parent:THREE.Object3D,rTop:number,rBot:number,h:number,sides:number,m:THREE.Material|THREE.Material[],x:number,y:number,z:number,rot=Math.PI/sides){
  const g=new THREE.CylinderGeometry(rTop,rBot,h,sides,1,false,rot),uv=g.getAttribute('uv'),idx=g.getIndex()!,seen=new Set<number>();
  for(const gr of g.groups)for(let i=gr.start;i<gr.start+gr.count;i++){const v=idx.getX(i);if(seen.has(v))continue;seen.add(v);if(gr.materialIndex===0)uv.setXY(v,uv.getX(v)*Math.PI*2*rBot,uv.getY(v)*Math.hypot(h,rBot-rTop));else uv.setXY(v,uv.getX(v)*2*rBot,uv.getY(v)*2*rBot);}
  g.computeVertexNormals();const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
/** 两点之间一根方料（截面 w×h），用来拼弧线、斜脊、椽子 */
export function strut(k:V2Kit,parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,w:number,h:number,m:THREE.Material){
  // 父节点不带变换（道具层的根），lookAt 看向的世界坐标就是局部坐标
  const len=a.distanceTo(b),mesh=k.box(parent,w,h,len+.01,m,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,32);mesh.lookAt(b);
  return mesh;
}

// ——贴图
/** 挂落：上沿一道横框，下面一排“万川”花格（短棂横竖交替），下沿每隔一段垂一个小尖。32×12 像素一段（1 米宽、0.36 米高）。 */
const guaLuo:Draw=(c,w,h)=>{c.clearRect(0,0,w,h);const f=Wd.base,l=Wd.light;R(c,0,0,w,2,f);R(c,0,0,w,1,l);
  for(let x=0;x<w;x+=8){R(c,x,2,1,h-4,f);R(c,x+4,2,1,5,f);R(c,x,6,5,1,f);R(c,x+4,6,1,4,f);R(c,x+4,9,4,1,f);}
  R(c,0,h-3,w,1,f);for(let x=2;x<w;x+=8){R(c,x,h-2,3,1,f);R(c,x+1,h-1,1,1,f);}};
/** 美人靠的靠背：竖棂 + 两道横档，中间一排小方格；24×12 像素一段。 */
const mrBack:Draw=(c,w,h)=>{c.clearRect(0,0,w,h);const f=Wd.base,l=Wd.light;R(c,0,0,w,2,f);R(c,0,0,w,1,l);R(c,0,h-2,w,2,f);R(c,0,6,w,1,f);for(let x=1;x<w;x+=3)R(c,x,2,1,h-4,f);};
/** 美人靠的座下裙板：实心栗木，内框一圈浅线。 */
const mrSkirt:Draw=(c,w,h)=>{R(c,0,0,w,h,Wd.dark);R(c,0,0,w,1,Wd.light);R(c,0,h-1,w,1,Wd.deep);for(let x=0;x<w;x+=16){R(c,x+2,2,12,h-4,Wd.base);R(c,x+2,2,12,1,Wd.light);}};
/**
 * 圆光罩的花格：冰裂纹（不规则的多边形格子，按种子画），64×64 像素一块（2 米），棂条 2–3 像素（6–9 厘米）宽、
 * 格子大小差不多一掌到一尺，远看是清楚的一格一格，不是一团乱线。
 */
const iceCrack:Draw=(c,w,h)=>{c.clearRect(0,0,w,h);const r=rng(301),f=Wd.base,l=Wd.light;const pts:Array<[number,number]>=[];for(let i=0;i<14;i++)pts.push([r()*w,r()*h]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=1e9,b=1e9;for(const [px,py] of pts)for(const ox of [-w,0,w])for(const oy of [-h,0,h]){const d=(x-px-ox)**2+(y-py-oy)**2;if(d<a){b=a;a=d;}else if(d<b)b=d;}const e=Math.sqrt(b)-Math.sqrt(a);if(e<2.4)R(c,x,y,1,1,e<.9?l:f);}};
/** 漏窗：方框里不同的花格（seed 不同，花样不同）：海棠、套方、六角。 */
export const louChuang=(kind:number):Draw=>(c,w,h)=>{c.clearRect(0,0,w,h);const f='#7d7a73',l='#9c988e';R(c,0,0,w,2,l);R(c,0,h-2,w,2,f);R(c,0,0,2,h,l);R(c,w-2,0,2,h,f);
  if(kind===0){for(let i=0;i<4;i++){const x=4+i*6;R(c,x,2,1,h-4,f);R(c,2,x,w-4,1,f);}for(let i=0;i<3;i++)for(let j=0;j<3;j++){const x=6+i*6,y=6+j*6;R(c,x-1,y-1,3,3,l);R(c,x,y,1,1,'rgba(0,0,0,0)');}}
  else if(kind===1){for(let s=0;s<3;s++){const a=3+s*4;R(c,a,a,w-2*a,1,f);R(c,a,h-a-1,w-2*a,1,f);R(c,a,a,1,h-2*a,f);R(c,w-a-1,a,1,h-2*a,f);}R(c,w/2-1,2,2,h-4,f);R(c,2,h/2-1,w-4,2,f);}
  else{for(let y=2;y<h-2;y+=6)for(let x=2;x<w-2;x++){const yy=y+Math.round(Math.abs(((x%8)-4))*.75);R(c,x,yy,1,1,f);}for(let x=2;x<w-2;x+=4)R(c,x,2,1,h-4,f);}};
/** 白灰：和方块粉墙同一种暖白 */
const plasterDraw:Draw=(c,w,h)=>{const P=GARDEN.plaster;R(c,0,0,w,h,P.base);for(const [x,y] of [[3,2],[11,6],[6,12],[14,13],[1,9]] as const)R(c,x*w/16,y*h/16,1,1,P.shade);R(c,10*w/16,2*h/16,1,8*h/16,tone(P.base,.985));};
const greyBrick:Draw=(c,w,h)=>{R(c,0,0,w,h,'#6f6d68');for(let y=0;y<h;y+=4)for(let x=(y/4)%2?-4:0;x<w;x+=8){R(c,x+1,y+1,7,3,(x+y)%3?'#9a978f':'#8c8981');R(c,x+1,y+1,7,1,'#aaa79f');}};
const tileRidge:Draw=(c,w,h)=>{R(c,0,0,w,h,T.base);R(c,0,0,w,1,T.shine);R(c,0,h-1,w,1,T.deep);for(let x=0;x<w;x+=4)R(c,x,1,1,h-2,T.gap);};
/** 木纹：顺着 u 的几道长纹（深一档）和一道漆光（亮一档）；vertical 换成顺着 v（柱子）；joints 每 4 像素一道板缝（顶棚的木板）。是画出来的纹，不撒随机点。 */
const woodDraw=(base:string,o:{vertical?:boolean;joints?:boolean}={}):Draw=>(c,w,h)=>{R(c,0,0,w,h,base);const line=(a:number,b:number,l:number,col:string)=>o.vertical?R(c,a*w/16,b*h/16,1,l*h/16,col):R(c,b*w/16,a*h/16,l*w/16,1,col);
  for(const [a,b,l] of [[2,1,9],[5,6,8],[9,0,6],[12,8,7],[14,3,5],[10,11,5]] as const)line(a,b,l,tone(base,.86));line(7,0,16,tone(base,1.06));
  if(o.joints)for(let y=0;y<16;y+=4)line(y,0,16,tone(base,.78));};

export const mats=(k:V2Kit)=>({
  wood:pix(k,'rt-wood',16,16,woodDraw(Wd.base)),
  woodV:pix(k,'rt-wood-v',16,16,woodDraw(Wd.base,{vertical:true})),
  woodDark:pix(k,'rt-wood-dark',16,16,woodDraw(Wd.dark)),
  ceiling:pix(k,'rt-ceiling',16,16,woodDraw('#665448',{joints:true})),
  ceilingBoth:pix(k,'rt-ceiling-2s',16,16,woodDraw('#5c4b40'),{side:THREE.DoubleSide}),
  plaster:pix(k,'rt-plaster',16,16,plasterDraw),
  brick:pix(k,'rt-brick',16,16,greyBrick),
  ridge:pix(k,'rt-ridge',16,8,tileRidge),
  tile:k.flat(T.base,{rough:.8}),tileDark:k.flat(T.deep,{rough:.8}),
  stone:pix(k,'rt-stone',16,16,(c,w,h)=>{const S=GARDEN.stone;R(c,0,0,w,h,S.base);R(c,0,0,w,1,S.light);R(c,0,h-1,w,1,S.edge);R(c,0,0,1,h,S.light);R(c,w-1,0,1,h,S.edge);for(const [x,y] of [[4,4],[10,6],[6,11],[12,12]] as const)R(c,x,y,2,1,S.dark);}),
  guaLuo:pix(k,'rt-gualuo',32,12,guaLuo,{alpha:true,side:THREE.DoubleSide}),
  mrBack:pix(k,'rt-mr-back',24,12,mrBack,{alpha:true,side:THREE.DoubleSide}),
  mrSkirt:pix(k,'rt-mr-skirt',32,8,mrSkirt),
  ice:pix(k,'rt-ice',64,64,iceCrack,{alpha:true,side:THREE.DoubleSide}),
});
export type Mats=ReturnType<typeof mats>;

/** 一跨的梁枋 + 挂落（a、b 是两根柱心，水平方向；挂落省掉的跨 noGua） */
export function bay(k:V2Kit,g:THREE.Object3D,M:Mats,ax:number,az:number,bx:number,bz:number,top:number,gua:boolean){
  const len=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bz-az,bx-ax),cx=(ax+bx)/2,cz=(az+bz)/2;
  const beam=k.box(g,len+.2,.3,.18,M.wood,cx,top-.15,cz,32);beam.rotation.y=-yaw;
  const pad=k.box(g,len,.08,.12,M.woodDark,cx,top-.34,cz,32);pad.rotation.y=-yaw;
  if(gua){const p=panel(k,g,M.guaLuo,len-.24,.36,32,12,32,cx,top-.56,cz,-yaw);p.renderOrder=0;}
  // 柱头两侧的雀替（小三角托木，两级）
  for(const s of [-1,1]){const ox=Math.cos(yaw)*(len/2-.2)*s,oz=Math.sin(yaw)*(len/2-.2)*s;for(const [l,h,dy] of [[.28,.08,-.42],[.16,.08,-.5]] as const){const q=k.box(g,l,h,.1,M.wood,cx+ox-Math.cos(yaw)*s*(.28-l)/2,top+dy,cz+oz-Math.sin(yaw)*s*(.28-l)/2,32);q.rotation.y=-yaw;}}
}
/** 美人靠（一跨）：座板、座下裙板、外倾的花格靠背和弯出去的扶手。out 是朝外的单位方向（x、z）。 */
export function meiRenKao(k:V2Kit,g:THREE.Object3D,M:Mats,ax:number,az:number,bx:number,bz:number,floor:number,out:[number,number]){
  // 局部坐标：x 顺着这一跨、z 朝外（转角 atan2(out.x, out.z) 让局部 +z 对着 out）
  const len=Math.hypot(bx-ax,bz-az)-.26,b=new THREE.Group();b.position.set((ax+bx)/2,floor,(az+bz)/2);b.rotation.y=Math.atan2(out[0],out[1]);g.add(b);
  k.box(b,len,.06,.36,M.wood,0,.45,0,32);
  panel(k,b,M.mrSkirt,len,.42,32,8,32,0,.21,.12);
  // 靠背：下段微微外倾、上段更往外仰（鹅颈），顶上一道扶手；两头一根弯出去的靠背柱
  const seg=(y0:number,z0:number,y1:number,z1:number)=>{const l=Math.hypot(y1-y0,z1-z0),p=panel(k,b,M.mrBack,len,l,24,12,32,0,(y0+y1)/2,(z0+z1)/2);p.rotation.x=Math.atan2(z1-z0,y1-y0);return p;};
  seg(.48,.17,.84,.27);seg(.84,.27,1.02,.43);
  const rail=k.box(b,len+.04,.05,.1,M.wood,0,1.04,.45,32);rail.rotation.x=.9;
  for(const s of [-1,1]){const p=k.box(b,.05,.56,.05,M.wood,s*len/2,.76,.3,32);p.rotation.x=.5;}
}
/** 船篷轩：从两根檐枋（z0、z1，高 y0）拱到中间（高 y0+rise）的弧形顶棚，顺着 x 从 x0 到 x1；弯椽每 0.5 米一根。 */
function xuanCeiling(k:V2Kit,g:THREE.Object3D,M:Mats,x0:number,x1:number,z0:number,z1:number,y0:number,rise:number,ends:boolean){
  const n=12,arc=(t:number)=>new THREE.Vector3(0,y0+rise*(1-(2*t-1)**2),z0+(z1-z0)*t);
  for(let i=0;i<n;i++){const a=arc(i/n),b=arc((i+1)/n),len=a.distanceTo(b),mid=a.clone().add(b).multiplyScalar(.5);
    const board=k.box(g,x1-x0,.03,len+.01,M.ceiling,(x0+x1)/2,mid.y+.03,mid.z,16);board.rotation.x=-Math.atan2(b.y-a.y,b.z-a.z);
    for(let x=x0+.25;x<x1;x+=.5){const r=k.box(g,.06,.06,len+.01,M.woodDark,x,mid.y-.015,mid.z,32);r.rotation.x=board.rotation.x;}}
  // 两道轩梁（弧顶两侧）和两端的弧形山板
  for(const t of [.3,.7]){const p=arc(t);k.box(g,x1-x0,.09,.1,M.wood,(x0+x1)/2,p.y-.07,p.z,32);}
  // 两端的弧形山板：木板封住（和轩顶同一种木），沿弧边一道深色压条
  if(ends)for(const x of [x0,x1]){const shape=new THREE.Shape();shape.moveTo(z0,y0);for(let i=1;i<=24;i++){const p=arc(i/24);shape.lineTo(p.z,p.y);}shape.lineTo(z0,y0);
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),M.ceilingBoth);m.rotation.y=-Math.PI/2;m.position.set(x,0,0);m.receiveShadow=true;g.add(m);
    for(let i=0;i<24;i++){const a=arc(i/24),b=arc((i+1)/24);strut(k,g,new THREE.Vector3(x,a.y-.04,a.z),new THREE.Vector3(x,b.y-.04,b.z),.1,.08,M.woodDark);}
    k.box(g,.1,.07,z1-z0,M.woodDark,x,y0+.035,(z0+z1)/2,32);}
}
/**
 * 翼角：一条戗脊从 a（屋面上）斜着落到檐角 b，过了檐角往外、往上翘出 lift（嫩戗），尖上卷一个小钩。
 * 用一串方料拼（截面 0.2），顶面是脊瓦。
 */
export function wingCorner(k:V2Kit,g:THREE.Object3D,M:Mats,a:THREE.Vector3,b:THREE.Vector3,out:THREE.Vector3,lift:number){
  const pts:THREE.Vector3[]=[];for(let i=0;i<=6;i++)pts.push(a.clone().lerp(b,i/6));
  for(let i=1;i<=6;i++){const t=i/6;pts.push(b.clone().addScaledVector(out,.75*t).add(new THREE.Vector3(0,lift*t*t,0)));}
  for(let i=0;i<pts.length-1;i++){const w=.22-.08*Math.max(0,(i-6)/6);const s=strut(k,g,pts[i],pts[i+1],w,w*.9,M.ridge);s.castShadow=true;}
  const tip=pts[pts.length-1];k.box(g,.1,.22,.1,M.tileDark,tip.x+out.x*.04,tip.y+.12,tip.z+out.z*.04);
  // 檐角下面一根老角梁
  const under=b.clone().add(new THREE.Vector3(0,-.18,0));strut(k,g,under.clone().addScaledVector(out,-1.1),under.clone().addScaledVector(out,.45).add(new THREE.Vector3(0,.18,0)),.14,.12,M.woodDark);
}
/** 檐口一边：连檐（深色木条）、一排飞椽头（每 0.33 米）、一排瓦当（每 0.25 米）。from→to 是檐边（水平线），out 朝外，y 是檐口瓦的底面。 */
export function eaveEdge(k:V2Kit,g:THREE.Object3D,M:Mats,from:THREE.Vector3,to:THREE.Vector3,out:THREE.Vector3,y:number){
  const len=from.distanceTo(to),dir=to.clone().sub(from).normalize(),yaw=Math.atan2(dir.z,dir.x),mid=from.clone().add(to).multiplyScalar(.5);
  const fascia=k.box(g,len,.1,.06,M.woodDark,mid.x+out.x*.02,y-.03,mid.z+out.z*.02,32);fascia.rotation.y=-yaw;
  for(let s=.15;s<len;s+=.33){const p=from.clone().addScaledVector(dir,s);const r=k.box(g,.07,.07,.5,M.wood,p.x-out.x*.2,y-.12,p.z-out.z*.2,32);r.rotation.y=-yaw+Math.PI/2;}
  for(let s=.12;s<len;s+=.25){const p=from.clone().addScaledVector(dir,s);const t=k.box(g,.12,.12,.05,M.tileDark,p.x+out.x*.04,y+.07,p.z+out.z*.04);t.rotation.y=-yaw;}
}
/** 山花：x 处一面粉白的阶梯山墙（按屋面每一行的高度），上面压一道顺着坡的深色博风板，顶上一块悬鱼。face=+1 朝东、-1 朝西。 */
function gable(k:V2Kit,g:THREE.Object3D,M:Mats,x:number,face:number,rows:Array<{z:number;bottom:number;top:number}>){
  const shape=new THREE.Shape();shape.moveTo(rows[0].z,rows[0].bottom);for(const r of rows){shape.lineTo(r.z,r.top);shape.lineTo(r.z+1,r.top);}shape.lineTo(rows[rows.length-1].z+1,rows[0].bottom);shape.lineTo(rows[0].z,rows[0].bottom);
  // 形状的 x 是 z 坐标：绕 y 转 -90° 让局部 x 对着世界 +z（灰泥面双面）
  const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),M.plaster);m.rotation.y=-Math.PI/2;m.position.set(x+face*.005,0,0);m.receiveShadow=true;m.castShadow=true;g.add(m);
  // 博风板：顺着每一行瓦的中线连成一条顺滑的折线，板高 0.62，盖住阶梯状的瓦头；板上压一道细脊（垂脊）
  for(let i=0;i<rows.length-1;i++){const a=new THREE.Vector3(x+face*.07,rows[i].top+.25,rows[i].z+.5),b=new THREE.Vector3(x+face*.07,rows[i+1].top+.25,rows[i+1].z+.5);strut(k,g,a,b,.08,.62,M.woodDark);
    strut(k,g,a.clone().add(new THREE.Vector3(-face*.02,.38,0)),b.clone().add(new THREE.Vector3(-face*.02,.38,0)),.16,.13,M.ridge);}
  const top=rows.reduce((a,b)=>b.top>a.top?b:a);k.box(g,.06,.5,.24,M.woodDark,x+face*.1,top.top-.28,top.z+.5);k.box(g,.07,.14,.38,M.wood,x+face*.11,top.top-.55,top.z+.5);
}
/**
 * 圆光罩：一块镂空的冰裂纹花罩（宽 w、高 h，下沿在 floor），中间一个圆洞（像素台阶的圆，半径 r，圆心离地 cy），洞口一圈深色木框。
 * 罩面在 x 处、顺着 z。
 */
function moonScreen(k:V2Kit,g:THREE.Object3D,M:Mats,x:number,z0:number,z1:number,floor:number,top:number,cy:number,r:number){
  const w=z1-z0,h=top-floor,shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(w,0);shape.lineTo(w,h);shape.lineTo(0,h);shape.lineTo(0,0);
  const hole=new THREE.Path(),cx=w/2,cyy=cy-floor,step=1/16,N=64;for(let i=0;i<=N;i++){const a=i/N*Math.PI*2;const px=Math.round((cx+Math.cos(a)*r)/step)*step,py=Math.round((cyy+Math.sin(a)*r)/step)*step;if(i===0)hole.moveTo(px,py);else hole.lineTo(px,py);}shape.holes.push(hole);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false,curveSegments:1}),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.5,uv.getY(i)*.5);
  const m=new THREE.Mesh(geo,[M.ice,M.woodDark]);m.rotation.y=-Math.PI/2;m.position.set(x+.03,floor,z0);m.castShadow=true;m.receiveShadow=true;g.add(m);
  // 洞口木框：一圈 48 段方料
  for(let i=0;i<48;i++){const a0=i/48*Math.PI*2,a1=(i+1)/48*Math.PI*2,p=(a:number)=>new THREE.Vector3(x,cy+Math.sin(a)*(r+.04),z0+cx+Math.cos(a)*(r+.04));strut(k,g,p(a0),p(a1),.1,.09,M.woodDark);}
  // 外框：上下左右四根
  k.box(g,.1,.1,w,M.woodDark,x,top-.05,z0+w/2,32);k.box(g,.1,.12,w,M.woodDark,x,floor+.06,z0+w/2,32);for(const zz of [z0+.05,z1-.05])k.box(g,.1,h,.1,M.woodDark,x,floor+h/2,zz,32);
}

/** 曲廊：每段两侧的梁枋 + 挂落，外侧美人靠，顶上一道矮矮的轩；转角那一跨用平顶。 */
function corridor(k:V2Kit,g:THREE.Object3D,M:Mats,floor:number,top:number){
  const posts=corridorPosts(CORRIDOR),has=(x:number,z:number)=>posts.some(([a,b])=>a===x&&b===z);
  const seg=(s:Segment)=>{const lines=s.along==='x'?[s.z0,s.z1]:[s.x0,s.x1];
    for(const l of lines){const ps=posts.filter(([x,z])=>s.along==='x'?z===l&&x>=s.x0&&x<=s.x1:x===l&&z>=s.z0&&z<=s.z1).sort((a,b)=>s.along==='x'?a[0]-b[0]:a[1]-b[1]);
      if(s.along==='x'&&s.x0===CORRIDOR[0].x0)ps.unshift([HALL.postX[3],l]);
      for(let i=0;i<ps.length-1;i++){const [ax,az]=ps[i],[bx,bz]=ps[i+1];bay(k,g,M,ax+.5,az+.5,bx+.5,bz+.5,top,true);}}};
  CORRIDOR.forEach(seg);
  // 美人靠：每段两侧都临水；转角处让开通道（A 北侧到 B 西侧的内角、B 东侧到 C 南侧的内角断开）
  const rails:Array<[[number,number],[number,number],[number,number]]>=[
    [[21.6,11.5],[25.5,11.5],[0,-1]],[[21.6,13.5],[27.5,13.5],[0,1]],[[27.5,13.5],[27.5,5.5],[1,0]],[[25.5,11.5],[25.5,3.5],[-1,0]],[[25.5,3.5],[32.5,3.5],[0,-1]],[[27.5,5.5],[32.5,5.5],[0,1]]];
  void has;
  for(const [[ax,az],[bx,bz],out] of rails)meiRenKao(k,g,M,ax,az,bx,bz,floor,out);
  // 轩顶：A 段（x 21.6→25.5）、B 段（z 5.5→11.5）、C 段（x 27.5→32.5）；两个转角跨平顶
  const lid=(x0:number,x1:number,z0:number,z1:number)=>k.box(g,x1-x0,.04,z1-z0,M.ceiling,(x0+x1)/2,top+.42,(z0+z1)/2,16);
  const arcX=(x0:number,x1:number,zc:number)=>xuanCeiling(k,g,M,x0,x1,zc-1,zc+1,top,.42,false);
  arcX(21.6,25.5,12.5);arcX(27.5,32.6,4.5);
  const b=new THREE.Group();b.rotation.y=Math.PI/2;b.position.set(26.5,0,0);g.add(b);xuanCeiling(k,b,M,-11.5,-5.5,-1,1,top,.42,false);
  lid(25.5,27.5,11.5,13.5);lid(25.5,27.5,3.5,5.5);
  // 卷棚瓦盖在轩顶上面，脊低于主榭东檐底面，西端伸进檐口底下，不再用半砖往主屋顶上叠。
  corridorVault(k,g,M,top);
}

/**
 * 曲廊屋面：三段直廊各一条卷棚（抛物线垄瓦），两个转角用同高的四坡小顶接上。
 * 檐口贴着梁枋（top），脊只高出约 0.8 米，整片都低于主榭东檐的底面（y=5），从厅侧看是钻进檐底，不是撞上屋面。
 */
function corridorVault(k:V2Kit,g:THREE.Object3D,M:Mats,y0:number){
  const rise=.78;
  const barrel=(along:'x'|'z',a0:number,a1:number,c:number,half:number)=>{
    const span=a1-a0,host=new THREE.Group();
    if(along==='x')host.position.set((a0+a1)/2,0,c);
    else{host.position.set(c,0,(a0+a1)/2);host.rotation.y=Math.PI/2;}
    g.add(host);
    const n=9;
    for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,yAt=(t:number)=>y0+rise*(1-(2*t-1)**2);
      const s0=-half+2*half*t0,s1=-half+2*half*t1,len=Math.hypot(s1-s0,yAt(t1)-yAt(t0));
      const board=k.box(host,span,.14,len+.05,M.ridge,0,(yAt(t0)+yAt(t1))/2+.02,(s0+s1)/2,16);
      board.rotation.x=-Math.atan2(yAt(t1)-yAt(t0),s1-s0);}
  };
  const hip=(x0:number,x1:number,z0:number,z1:number)=>{
    const nx=7,nz=7,dx=(x1-x0)/nx,dz=(z1-z0)/nz;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const fx=(i+.5)/nx,fz=(j+.5)/nz,edge=Math.min(fx,1-fx,fz,1-fz)*2;
      k.box(g,dx+.05,.14,dz+.05,M.ridge,x0+(i+.5)*dx,y0+rise*Math.sin(edge*Math.PI/2)+.02,z0+(j+.5)*dz,16);}
  };
  const ev=(x0:number,z0:number,x1:number,z1:number,ox:number,oz:number)=>eaveEdge(k,g,M,new THREE.Vector3(x0,0,z0),new THREE.Vector3(x1,0,z1),new THREE.Vector3(ox,0,oz),y0);
  // 直段：出厅向东（钻进主榭东檐）、折向北、再向东到亭前。转角两块四坡顶把直段接上。
  barrel('x',22.15,25.05,12.5,2.5);
  barrel('z',5.05,10,26.5,2.5);
  barrel('x',29,33.2,4.5,2.5);
  hip(25.05,29,10,15);hip(24,29,2,5.05);
  ev(22.15,10,24,10,0,-1);ev(22.15,15,29,15,0,1);
  ev(24,2,24,10,-1,0);ev(29,5.05,29,15,1,0);
  ev(24,2,33.2,2,0,-1);ev(29,7,33.2,7,0,1);ev(33.2,2,33.2,7,1,0);
}

/** 湖上六角亭：青石台基、六根细柱、梁枋挂落、五面美人靠（朝西那一面接曲廊）、六角攒尖顶（四级往里收、越往上越陡）、宝顶、六条起翘的戗脊。 */
function pavilion(k:V2Kit,g:THREE.Object3D,M:Mats){
  // 角点在 30°+60°·i（从 +x 往 +z 量），正西一面对着曲廊；CylinderGeometry 的顶点按 (sin θ, cos θ) 排，θ 起点取 0 正好落在同一组角上
  const {x,z,r,base}=PAVILION,floor=1,top=4.2,ang=(i:number)=>Math.PI/6+i*Math.PI/3;
  frustum(k,g,base,base+.15,1-WATER+.3,6,[M.stone,M.stone,M.stone],x,(1+WATER-.3)/2,z,0);
  const corners=Array.from({length:6},(_,i)=>[x+Math.cos(ang(i))*r,z+Math.sin(ang(i))*r] as [number,number]);
  for(const [px,pz] of corners)k.box(g,.22,top-floor,.22,M.woodV,px,(floor+top)/2,pz,32);
  for(let i=0;i<6;i++){const [ax,az]=corners[i],[bx,bz]=corners[(i+1)%6];bay(k,g,M,ax,az,bx,bz,top,true);
    const mx=(ax+bx)/2-x,mz=(az+bz)/2-z,l=Math.hypot(mx,mz);if(i!==2&&i!==5)meiRenKao(k,g,M,ax,az,bx,bz,floor,[mx/l,mz/l]);}
  const tiers:Array<[number,number,number]>=[[3.5,2.95,.42],[2.95,2.05,.55],[2.05,1.1,.7],[1.1,.32,.85]];let y=top+.02;
  for(const [rb,rt,h] of tiers){frustum(k,g,rt,rb,h,6,[M.tile,M.tile,M.tileDark],x,y+h/2,z,0);y+=h;}
  for(const [rr,h] of [[.32,.18],[.22,.3],[.3,.16],[.12,.32]] as const){frustum(k,g,rr*.9,rr,h,8,[M.tileDark,M.tileDark,M.tileDark],x,y+h/2,z);y+=h;}
  for(let i=0;i<6;i++){const dir=new THREE.Vector3(Math.cos(ang(i)),0,Math.sin(ang(i)));
    wingCorner(k,g,M,new THREE.Vector3(x,top+1.12,z).addScaledVector(dir,1.95),new THREE.Vector3(x,top+.5,z).addScaledVector(dir,3.6),dir,.7);}
  frustum(k,g,r+.6,r+.6,.04,6,M.ceiling,x,top+.03,z,0);
}

/** 石栏：柱子每 1.5 米一根，上下两道条石。from→to 一条直线，h 栏高。 */
export function stoneRail(k:V2Kit,g:THREE.Object3D,M:Mats,ax:number,az:number,bx:number,bz:number,y:number,h:number){
  const len=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(bz-az,bx-ax),n=Math.max(1,Math.round(len/1.5));
  for(let i=0;i<=n;i++){const t=i/n;k.box(g,.16,h+.06,.16,M.stone,ax+(bx-ax)*t,y+(h+.06)/2,az+(bz-az)*t,16);}
  for(const [yy,th] of [[y+h-.06,.12],[y+.12,.08]] as const){const b=k.box(g,len,th,.12,M.stone,(ax+bx)/2,yy,(az+bz)/2,16);b.rotation.y=-yaw;}
}
export interface TimberOptions {/** 屋面行高：主榭每一行（z）的瓦底高度，给山花用 */roofAt:(x:number,z:number)=>{h:number}}
export function buildTimber(k:V2Kit,root:THREE.Object3D,o:TimberOptions){
  const g=new THREE.Group();g.name='garden-timber';root.add(g);const M=mats(k);
  const floor=1,top=HALL.postTop,[x0,x1]=[POST_X[0],POST_X[3]],[z0,z1]=[POST_Z[0],POST_Z[3]];
  // ——主榭四周的梁枋、挂落（北面中间一跨挂匾、东面中间一跨是圆光罩，不挂挂落）
  // 南面是槅扇门（门顶到枋下），不挂挂落
  for(let i=0;i<3;i++){bay(k,g,M,POST_X[i],z0,POST_X[i+1],z0,top,i!==1);bay(k,g,M,POST_X[i],z1,POST_X[i+1],z1,top,false);
    bay(k,g,M,x0,POST_Z[i],x0,POST_Z[i+1],top,true);bay(k,g,M,x1,POST_Z[i],x1,POST_Z[i+1],top,i!==1);}
  // 柱础：每根柱脚一块青石鼓墩
  for(const x of HALL.postX)for(const z of HALL.postZ)if(x===HALL.postX[0]||x===HALL.postX[3]||z===HALL.postZ[0]||z===HALL.postZ[3])k.prism(g,.2,.16,8,M.stone,x+.5,floor+.08,z+.5);
  // ——美人靠：北面两侧跨、西面三跨、东面南北两跨
  meiRenKao(k,g,M,POST_X[0],z0,POST_X[1],z0,floor,[0,-1]);meiRenKao(k,g,M,POST_X[2],z0,POST_X[3],z0,floor,[0,-1]);
  for(let i=0;i<3;i++)meiRenKao(k,g,M,x0,POST_Z[i],x0,POST_Z[i+1],floor,[-1,0]);
  meiRenKao(k,g,M,x1,POST_Z[0],x1,POST_Z[1],floor,[1,0]);meiRenKao(k,g,M,x1,POST_Z[2],x1,POST_Z[3],floor,[1,0]);
  // ——圆光罩：东面中间一跨，通曲廊
  moonScreen(k,g,M,x1,POST_Z[1]+.13,POST_Z[2]-.13,floor,top-.32,floor+1.62,1.38);
  // ——船篷轩：北檐枋到南檐枋拱起 1.4 米；四周檐枋上面一圈垫板封住屋面下的空隙
  xuanCeiling(k,g,M,x0,x1,z0,z1,top,1.4,true);
  for(const z of [z0,z1])k.box(g,x1-x0,.5,.04,M.plaster,(x0+x1)/2,top+.25,z,16);
  // 檐下平顶：檐口那一圈瓦的里沿到檐枋之间（0.41 米宽），封住屋面底下的空腔
  for(const zz of [z0-.295,z1+.295])k.box(g,HALL.x1+1-HALL.x0,.02,.41,M.ceiling,(HALL.x0+HALL.x1+1)/2,top-.01,zz,16);
  for(const xx of [x0-.295,x1+.295])k.box(g,.41,.02,z1-z0+.8,M.ceiling,xx,top-.01,(z0+z1)/2,16);
  // ——檐口：四边连檐、飞椽、瓦当；四角翼角起翘
  const E={x0:HALL.x0,x1:HALL.x1+1,z0:HALL.z0,z1:HALL.z1+1},eave=HALL.eave;
  eaveEdge(k,g,M,new THREE.Vector3(E.x0,0,E.z0),new THREE.Vector3(E.x1,0,E.z0),new THREE.Vector3(0,0,-1),eave);
  eaveEdge(k,g,M,new THREE.Vector3(E.x0,0,E.z1),new THREE.Vector3(E.x1,0,E.z1),new THREE.Vector3(0,0,1),eave);
  eaveEdge(k,g,M,new THREE.Vector3(E.x0,0,E.z0),new THREE.Vector3(E.x0,0,E.z1),new THREE.Vector3(-1,0,0),eave);
  eaveEdge(k,g,M,new THREE.Vector3(E.x1,0,E.z0),new THREE.Vector3(E.x1,0,E.z1),new THREE.Vector3(1,0,0),eave);
  for(const [cx,cz] of [[E.x0,E.z0],[E.x1,E.z0],[E.x0,E.z1],[E.x1,E.z1]] as const){const out=new THREE.Vector3(cx===E.x0?-1:1,0,cz===E.z0?-1:1).normalize();
    wingCorner(k,g,M,new THREE.Vector3(cx-out.x*1.5,eave+1.08,cz-out.z*1.5),new THREE.Vector3(cx,eave+.62,cz),out,.9);}
  // ——山花：东西两面（歇山收山一格），按屋面每一行的瓦底高度画阶梯山墙
  const rows=(x:number)=>{const out:Array<{z:number;bottom:number;top:number}>=[];for(let z=HALL.z0+1;z<HALL.z1;z++)out.push({z,bottom:eave+.5,top:o.roofAt(x,z).h});return out;};
  gable(k,g,M,HALL.x0+HALL.gable,-1,rows(HALL.x0+HALL.gable));gable(k,g,M,HALL.x1+1-HALL.gable,1,rows(HALL.x1-HALL.gable));
  // ——曲廊、六角亭
  corridor(k,g,M,floor,4);pavilion(k,g,M);
  // ——曲桥的石栏（只在外侧连续，转折处的内侧让开通道）
  const [b0,b1,b2]=BRIDGE;
  for(const [ax,az,bx,bz] of [[b1.x0,b0.z1+.9,b0.x1+1,b0.z1+.9],[b0.x0,b0.z0+.1,b0.x1+1,b0.z0+.1],[b1.x0+.1,b2.z1+1,b1.x0+.1,b1.z1+1],[b1.x1+.9,b1.z0,b1.x1+.9,b0.z0],[b2.x0,b2.z0+.1,b1.x1+1,b2.z0+.1],[b2.x0,b2.z1+.9,b2.x1+1,b2.z1+.9]] as const)stoneRail(k,g,M,ax,az,bx,bz,.5,.42);
  return g;
}
