/**
 * 远景：湖面（带倒影）、对岸的林带、两侧的山坡、雪山和体块云。都是 v2 自己生成的几何体，
 * 方块语言（按格子起伏的台地、方块树冠），颜色靠顶点色。对岸分四层：砂石岸和低矮灌丛 → 连续的针叶林线 → 丘陵 →
 * 带雪顶的山；越远的层顶点色越往天边的雾蓝混（空气透视），再叠场景雾。天空是 v2 自己画的像素天穹（蓝天渐变 + 地平线积云 + 高空卷云）。
 * 尺寸单位米；相机远裁剪面是 300 米，所有东西都放在 300 米以内。
 */
import * as THREE from 'three';
import {ColorBoxes,type V2Kit} from './kit';
import {PAL,pick,rng,tone} from './pixel';
import {V2_BLOCK_PAINT} from './blockTextures';

export interface LakeSetting {
  /** 水面高度 */water:number;
  /** 近岸线（水面从这里往 -z 铺） */shore:number;
  /** 对岸起点 z、雪山带 z */farShore:number;mountains:number;
  /** 湖的左右岸（x） */west:number;east:number;
  /** 近处草地高度（顶面） */ground:number;
  /** 近处用方块铺的地形范围（这里不铺平面草地） */hole?:{x0:number;x1:number;z0:number;z1:number};
  /** 雪山高度倍数 */peakScale?:number;
  /** 天穹中心（房间中心的 x、z） */center?:[number,number];
  seed:number;
}
const C=(hex:string)=>new THREE.Color(hex);
/** 平滑的值噪声（格点随机 + 双线性），用来定台地高度。 */
function valueNoise(seed:number){const cache=new Map<string,number>();const at=(i:number,j:number)=>{const k=i+','+j;let v=cache.get(k);if(v===undefined){v=rng((i*73856093)^(j*19349663)^seed)();cache.set(k,v);}return v;};
  return (x:number,z:number)=>{const i=Math.floor(x),j=Math.floor(z),fx=x-i,fz=z-j,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);const a=at(i,j),b=at(i+1,j),c=at(i,j+1),d=at(i+1,j+1);return a+(b-a)*sx+(c-a)*sz+(a-b-c+d)*sx*sz;};}

/** 一棵方块树：树干 + 两三层错开的方块树冠。kind 决定颜色和形状。 */
function tree(b:ColorBoxes,x:number,y:number,z:number,s:number,kind:'oak'|'spruce'|'birch'|'cherry',r:()=>number){
  const trunk=kind==='birch'?C('#d9d3c4'):kind==='cherry'?C('#4a2a2c'):C('#4a3626'),tw=Math.max(.6,s*.18);
  const th=kind==='spruce'?s*.5:s*.7;b.add(x-tw/2,y,z-tw/2,x+tw/2,y+th,z+tw/2,trunk,trunk.clone().multiplyScalar(.8));
  const pal=kind==='cherry'?[PAL.cherry.base,PAL.cherry.light,PAL.cherry.dark]:kind==='spruce'?[PAL.spruceLeaf.base,PAL.spruceLeaf.light,PAL.spruceLeaf.dark]:kind==='birch'?['#7aa24a','#90b85a','#628a3c']:[PAL.leaf.base,PAL.leaf.light,PAL.leaf.dark];
  const top=(i:number)=>C(pal[i%3]),side=(i:number)=>C(pal[(i+2)%3]).multiplyScalar(.82);
  if(kind==='spruce'){let w=s*.75,yy=y+s*.3;for(let i=0;i<4;i++){const h=s*.32;b.add(x-w/2,yy,z-w/2,x+w/2,yy+h,z+w/2,top(i),side(i));yy+=h*.8;w*=.7;}return;}
  const w=s*(.9+r()*.3);b.add(x-w/2,y+th*.75,z-w/2,x+w/2,y+th*.75+s*.55,z+w/2,top(0),side(0));
  const w2=w*.7,ox=(r()-.5)*s*.3,oz=(r()-.5)*s*.3;b.add(x+ox-w2/2,y+th*.75+s*.45,z+oz-w2/2,x+ox+w2/2,y+th*.75+s*.85,z+oz+w2/2,top(1),side(1));
  if(r()<.6){const w3=w*.5,o3=(r()-.5)*s*.6;b.add(x+o3-w3/2,y+th*.6,z-o3-w3/2,x+o3+w3/2,y+th*.6+s*.4,z-o3+w3/2,top(2),side(2));}
}

/**
 * v2 天穹（像素画，1 像素约 0.35°）：天顶深蓝 → 中空天蓝 → 地平线浅雾蓝的渐变；地平线上方 2°～16° 一圈方块积云
 * （平底、亮顶、灰蓝阴影面），高空 20°～55° 几道拉长的卷云。整圈都画，所以朝哪儿看都有云。不受雾影响。
 * 贴图 u 方向：u=0.75 朝北（-z），u≈0.64 是默认机位的视线方向（东北）。
 */
function v2Sky(k:V2Kit,seed:number):THREE.Mesh{
  const W=1024,H=512,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;
  const stops:Array<[number,string]>=[[-90,'#b4c8db'],[0,'#cadcec'],[2,'#bfd6ec'],[6,'#a6c8eb'],[14,'#7fb0e4'],[30,'#5893da'],[55,'#3f7bcf'],[90,'#2e68c0']];
  const colAt=(e:number)=>{for(let i=1;i<stops.length;i++)if(e<=stops[i][0]){const [e0,a]=stops[i-1],[e1,b]=stops[i];return '#'+new THREE.Color(a).lerp(new THREE.Color(b),(e-e0)/(e1-e0)).getHexString();}return stops[stops.length-1][1];};
  const rowOf=(e:number)=>Math.round((90-e)/180*H);
  for(let y=0;y<H;y++){c.fillStyle=colAt(90-(y+.5)/H*180);c.fillRect(0,y,W,1);}
  let st=(seed*7919)>>>0||1;const r=()=>{st=(Math.imul(st,1664525)+1013904223)>>>0;return st/4294967296;};
  const rect=(x:number,y:number,w:number,h:number,col:string)=>{for(const dx of [0,-W,W]){c.fillStyle=col;c.fillRect(Math.round(x+dx),Math.round(y),Math.round(w),Math.round(h));}};
  // 卷云：细长、半透明、两三条错开的横线。
  for(let i=0;i<22;i++){const x=r()*W,y=rowOf(20+r()*35),w=40+r()*120;for(let j=0;j<3;j++){const ww=w*(.4+r()*.6),xx=x+(r()-.3)*w*.5;rect(xx,y+j*2,ww,1+Math.round(r()),'rgba(255,255,255,'+(.28+r()*.3).toFixed(2)+')');}}
  // 积云：平底，底下一道灰蓝阴影，往上几层越来越窄的亮块；离地平线越近越扁越小（透视）。
  const cumulus=(x:number,eBase:number,w:number,h:number)=>{const y0=rowOf(eBase);
    rect(x,y0-2,w,3,'#c5d2e2');rect(x+2,y0-4,w-4,2,'#dde6f0');
    let lw=w,lx=x,yy=y0-4;const layers=2+Math.floor(h/6);
    for(let l=0;l<layers;l++){const bumps=1+Math.floor(r()*3);for(let b=0;b<bumps;b++){const bw=lw*(.35+r()*.45),bx=lx+r()*(lw-bw),bh=Math.max(3,Math.round(h/layers*(.8+r()*.6)));
      rect(bx,yy-bh,bw,bh,'#ffffff');rect(bx,yy-bh,Math.max(2,bw*.18),bh,'#eef2f8');rect(bx+bw*.82,yy-bh+1,Math.max(2,bw*.18),bh-1,'#e2e9f2');}
      const shrink=.15+r()*.15;lx+=lw*shrink*r();lw*=1-shrink;yy-=Math.round(h/layers);}};
  for(let i=0;i<34;i++){const e=1.5+Math.pow(r(),1.4)*9,f=.45+e/9,x=r()*W;cumulus(x,e,Math.round((18+r()*46)*f),Math.round((6+r()*14)*f));}
  // 默认机位视线方向（u≈0.56～0.72）专门放几团，保证从厅里看出去山后面有云。
  for(const [u,e,w,h] of [[.585,7.5,56,18],[.63,9.5,40,14],[.69,6.5,62,20],[.72,11,34,10]] as const)cumulus(u*W,e,w,h);
  // 太阳那一侧（西南）地平线附近一圈很淡的暖白光晕。
  const sunU=.07,sx=sunU*W,sy=rowOf(17);const gr=c.createRadialGradient(sx,sy,0,sx,sy,90);gr.addColorStop(0,'rgba(255,248,232,.55)');gr.addColorStop(1,'rgba(255,248,232,0)');for(const dx of [0,-W,W]){c.save();c.translate(dx,0);c.fillStyle=gr;c.fillRect(sx-90,sy-90,180,180);c.restore();}
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;
  const mat=new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false,depthWrite:false});k.owned.push(mat,t);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(240,64,32),mat);dome.name='v2-sky';dome.renderOrder=-1;dome.frustumCulled=false;
  return dome;
}

export function buildLandscape(k:V2Kit,o:LakeSetting):THREE.Group{
  const root=new THREE.Group();root.name='v2-landscape';
  const r=rng(o.seed),n=valueNoise(o.seed);
  // ——湖：湖床（深青）+ 半透明水面，倒影画在两者之间。
  const span=560,depth=o.shore-(o.farShore-60);
  const bed=new THREE.Mesh(new THREE.PlaneGeometry(span,depth+40).rotateX(-Math.PI/2),k.flat('#1d4558'));bed.position.set((o.west+o.east)/2,o.water-2.2,o.shore-(depth+40)/2);bed.receiveShadow=true;root.add(bed);
  const waterMat=k.mat('v2-water',p=>{const W=PAL.water;p.fill(W.mid);const rr=rng(91);for(let i=0;i<7;i++){const y=Math.floor(rr()*16),x=Math.floor(rr()*13);p.rect(x,y,2+Math.floor(rr()*4),1,rr()<.3?W.light:W.deep);}if(rr()<.9)p.px(Math.floor(rr()*16),Math.floor(rr()*16),W.glint);},{rough:.22,transparent:true});
  waterMat.opacity=.7;waterMat.depthWrite=false;
  const waterGeo=new THREE.PlaneGeometry(span,depth).rotateX(-Math.PI/2),uv=waterGeo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*span/4,uv.getY(i)*depth/4);
  const water=new THREE.Mesh(waterGeo,waterMat);water.position.set((o.west+o.east)/2,o.water,o.shore-depth/2);water.receiveShadow=true;water.renderOrder=1;water.name='v2-water';root.add(water);

  // ——近处草地延伸（方块地形区外面的大片草地，用同一张草地贴图），不留断崖。
  const grassMat=k.mat('v2-apron-grass',V2_BLOCK_PAINT['block/grass_block_top']);
  const apron=(x0:number,x1:number,z0:number,z1:number)=>{const g=new THREE.PlaneGeometry(x1-x0,z1-z0).rotateX(-Math.PI/2),u=g.getAttribute('uv');for(let i=0;i<u.count;i++)u.setXY(i,u.getX(i)*(x1-x0),u.getY(i)*(z1-z0));const m=new THREE.Mesh(g,grassMat);m.position.set((x0+x1)/2,o.ground-.002,(z0+z1)/2);m.receiveShadow=true;root.add(m);};
  // 方块地形区（o.hole）里不铺，避免和方块草地重叠闪烁。
  const H=o.hole;if(H){apron(o.west-80,H.x0,o.shore,o.shore+140);apron(H.x1,o.east+80,o.shore,o.shore+140);apron(H.x0,H.x1,H.z1,o.shore+140);}else apron(o.west-80,o.east+80,o.shore,o.shore+140);
  // 岸坎：草地边缘到湖床的一道竖直土坡，从湖上回看时岸边不是空的。
  const bank=k.mat('v2-bank',V2_BLOCK_PAINT['block/dirt']);k.box(root,o.east-o.west+160,o.ground-(o.water-2.3),.3,bank,(o.west+o.east)/2,(o.ground+o.water-2.3)/2,o.shore-.15).name='v2-bank';

  // ——对岸、两侧山坡：4 米一格的台地，从水边往后抬高，上面种方块树。
  const land=new ColorBoxes(),trees=new ColorBoxes(),cell=4;
  const grassTop=[C(PAL.grass.base),C(PAL.grass.dark),C('#5f8f3c'),C(PAL.grass.light)],dirtSide=C('#5b6c3c'),rockSide=C('#7b7a74');
  const terrace=(x:number,z:number,h:number)=>{const t=grassTop[Math.floor(n(x*.07,z*.07)*4)%4];b(x,z,h,t);};
  const b=(x:number,z:number,h:number,t:THREE.Color)=>land.add(x,o.water-3,z,x+cell,h,z+cell,t,h-o.water>9?rockSide:dirtSide);
  // 对岸（从水边往后）：①砂石岸 3 米 ②近岸植被带 7 米（低矮灌丛、少量樱花和白桦）③针叶林线 30 米（几乎连成一片的深色云杉，
  // 树梢参差）④丘陵 35 米（台地抬高、树稀、颜色更灰蓝）。越远混入越多天边的雾蓝 hazeC。
  const hazeC=C('#a9bfd6'),deepC=C('#1d3328'),fade=(c:THREE.Color,t:number)=>c.clone().lerp(hazeC,t);
  const fs=o.farShore,sandTop=C(PAL.sand.dark),sandSide=C('#9c9070');
  for(let x=o.west-120;x<o.east+120;x+=cell){
    land.add(x,o.water-3,fs-3,x+cell,o.water+.3,fs,sandTop,sandSide);
    for(let z=fs-10;z<fs-3;z+=cell/2+.5){const h=o.water+.7+n(x*.11,z*.11)*.6;land.add(x,o.water-3,z,x+cell,h,z+3.5,fade(grassTop[Math.floor(n(x*.07,z*.07)*4)%4],.05),dirtSide);
      for(let j=0;j<2;j++){if(r()<.25)continue;const bx=x+r()*cell,bz=z+r()*3,bs=1+r()*1.6,kind=r();
        if(kind<.02){tree(trees,bx,h,bz,3.5+r()*1.5,'cherry',r);continue;}if(kind<.2){tree(trees,bx,h,bz,4+r()*3,'birch',r);continue;}
        const c=fade(C(pick(r,[PAL.leaf.base,PAL.leaf.dark,PAL.leaf.deep,PAL.grass.deep])),.12);trees.add(bx-bs/2,h,bz-bs/2,bx+bs/2,h+bs*.75,bz+bs/2,c,c.clone().multiplyScalar(.78));}}
    for(let z=fs-40;z<fs-10;z+=cell){const back=(fs-10-z)/30,h=o.water+1.2+back*4+Math.floor(n(x*.05,z*.05)*3);const t=.2+back*.14;
      land.add(x,o.water-3,z,x+cell,h,z+cell,fade(C(PAL.grass.deep),t),fade(dirtSide,t));
      for(let j=0;j<2;j++){if(r()<.12)continue;const tx=x+r()*cell,tz=z+r()*cell,ts=6+r()*4;const sp=r()<.85;
        const base=trees.vertices;tree(trees,tx,h,tz,ts,sp?'spruce':(r()<.5?'birch':'oak'),r);trees.tint(base,deepC,.25);trees.tint(base,hazeC,t);}}
    for(let z=fs-75;z<fs-40;z+=cell){const back=(fs-40-z)/35,h=o.water+5+Math.floor((back*14+n(x*.04,z*.04)*9)/2)*2;const t=.22+back*.16;
      land.add(x,o.water-3,z,x+cell,h,z+cell,fade(C(PAL.grass.dark),t),fade(rockSide,t));
      if(r()<.35){const base=trees.vertices;tree(trees,x+cell/2,h,z+cell/2,6+r()*4,'spruce',r);trees.tint(base,deepC,.2);trees.tint(base,hazeC,t+.08);}}
  }
  // 两侧山坡：从近岸一直延伸到对岸，越往外越高，把湖面框住。
  for(const side of [-1,1]){const edge=side<0?o.west:o.east;
    for(let i=0;i<22;i++)for(let z=o.farShore;z<o.shore+20;z+=cell){const x=side<0?edge-(i+1)*cell:edge+i*cell;
      const out=i/22,along=(z-o.farShore)/(o.shore+20-o.farShore),h=o.water+1+Math.floor((out*26*(1-.45*along)+n(x*.06,z*.06)*8)/1.5)*1.5;terrace(x,z,h);
      if(r()<.5){const kind=r()<.08?'cherry':r()<.4?'spruce':r()<.5?'birch':'oak';tree(trees,x+cell/2,h,z+cell/2,5+r()*5,kind,r);}}}
  // 近岸平地上零星的树和灌木丛（方块地形区以外、湖岸以南），让大片草地不至于空。
  if(o.hole){const H=o.hole;for(let i=0;i<70;i++){const a=r()*Math.PI*2,d=24+r()*70,x=(H.x0+H.x1)/2+Math.cos(a)*d,z=o.shore+6+Math.abs(Math.sin(a))*d*.9;
    if(x>H.x0-3&&x<H.x1+3&&z<H.z1+3)continue;if(r()<.35){const s=1.2+r()*1.4,c=C(PAL.leaf.dark);trees.add(x-s/2,o.ground,z-s/2,x+s/2,o.ground+s*.8,z+s/2,C(PAL.leaf.base),c);continue;}
    const kind=r()<.12?'cherry':r()<.3?'birch':r()<.55?'spruce':'oak';tree(trees,x,o.ground,z,4+r()*4,kind,r);}}
  const landMat=k.flat('#ffffff',{vertex:true}),landMesh=new THREE.Mesh(land.geometry(),landMat);landMesh.receiveShadow=true;landMesh.name='v2-far-land';root.add(landMesh);
  const treeMesh=new THREE.Mesh(trees.geometry(),landMat);treeMesh.name='v2-far-trees';root.add(treeMesh);

  // ——雪山：8 米一格、4 米一级的阶梯山体。主峰是带噪声的尖锥（不是圆包），山脊连成一线；
  //    山脚针叶、中段岩石、上部积雪；岩石往天边的雾蓝混 20%～32%（再叠场景雾），雪顶几乎不混，保持最亮。
  const mount=new ColorBoxes(),mc=8,ps=o.peakScale??1;
  const peaks=[[-260,44],[-190,58],[-120,40],[-50,50],[20,36],[85,46],[140,52],[205,40],[270,48]].map(([x,h])=>({x,h:h*ps,z:o.mountains-12+r()*24,w:34+r()*22}));
  const rock=C('#7a8494'),rockDark=C('#5f6877'),snow=C('#f3f6fa'),snowSide=C('#cfd9e6'),pine=C('#33544a'),mHaze=C('#9fb5cf');
  for(let x=-260;x<300;x+=mc)for(let z=o.mountains-36;z<o.mountains+28;z+=mc){
    let h=o.water+8+n(x*.03,z*.03)*10;for(const p of peaks){const d=Math.hypot(x-p.x,(z-p.z)*1.3),k=Math.max(0,1-d/p.w);h=Math.max(h,o.water+p.h*Math.pow(k,1.2)+n(x*.13,z*.13)*7*k);}
    h=Math.floor(h/4)*4;const rel=h-o.water,far=Math.min(1,Math.max(0,(o.mountains-z+36)/64));
    const isSnow=rel>=34||(rel>=26&&n(x*.3,z*.3)>.4),top=isSnow?snow:rel>16?rock:pine,side=isSnow?snowSide:rel>16?rockDark:pine.clone().multiplyScalar(.8);
    const t=isSnow?.02:.2+far*.12;mount.add(x,o.water-2,z,x+mc,h,z+mc,top.clone().lerp(mHaze,t),side.clone().lerp(mHaze,t));}
  void mc;
  const mountMesh=new THREE.Mesh(mount.geometry(),landMat);mountMesh.name='v2-mountains';root.add(mountMesh);

  // ——倒影：对岸、树、山按水面镜像，颜色压暗偏蓝，画在水面下面（水是半透明的）。
  const mirrorMat=k.flat('#7f97ab',{vertex:true,side:THREE.DoubleSide});
  const mirror=new THREE.Group();mirror.name='v2-reflection';for(const m of [landMesh,treeMesh,mountMesh]){const c=new THREE.Mesh(m.geometry,mirrorMat);mirror.add(c);}
  mirror.scale.y=-1;mirror.position.y=2*o.water;root.add(mirror);

  // ——天穹：v2 自己画的像素天空（见 v2Sky），盖在共用天穹（半径 250）里面。
  const [scx,scz]=o.center??[0,0];const dome=v2Sky(k,o.seed);dome.position.set(scx,0,scz);root.add(dome);
  // ——体块云：远处两三团立体的积云，从外景看有体积；默认机位里它们在山后面。
  const clouds=new ColorBoxes(),white=C('#ffffff'),shadeC=C('#e3eaf3'),under=C('#bccbdd');
  const puff=(cx:number,cy:number,cz:number,s:number)=>{for(let i=0;i<7;i++){const w=s*(.5+r()*.6),h=s*(.25+r()*.3),dx=(r()-.5)*s*1.4,dz=(r()-.5)*s*.6,dy=r()*s*.25;clouds.add(cx+dx-w/2,cy+dy,cz+dz-w/2*.6,cx+dx+w/2,cy+dy+h,cz+dz+w/2*.6,white,shadeC,under,false);}};
  for(const [x,y,z,s] of [[-150,58,-215,34],[175,66,-205,30],[-210,52,150,32],[60,70,215,36],[230,56,60,28]] as const)puff(x,y,z,s);
  const cloudMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});k.owned.push(cloudMat);
  const cloudMesh=new THREE.Mesh(clouds.geometry(),cloudMat);cloudMesh.name='v2-clouds';cloudMesh.castShadow=false;root.add(cloudMesh);
  // ——近岸：厅两侧的岸边几丛芦苇，水面上零星的睡莲叶（几片带一朵花）。
  const bits=new ColorBoxes();
  if(o.hole){const H=o.hole,reed=[C('#6f8f45'),C('#8ea657'),C('#a7955f')],pad=C('#4c8540'),padSide=C('#3b6a33');
    for(const [x0,x1] of [[H.x0,4],[21,H.x1]] as const)for(let x=x0;x<x1;x+=1.3){if(r()<.35)continue;const bx=x+r()*.8,bz=o.shore-.4-r()*1.6;
      for(let j=0;j<7;j++){const h=.7+r()*.9,px=bx+(r()-.5)*.6,pz=bz+(r()-.5)*.5,c=reed[Math.floor(r()*3)];bits.add(px-.03,o.water,pz-.03,px+.03,o.water+h,pz+.03,c,c.clone().multiplyScalar(.85));}}
    for(let i=0;i<46;i++){const x=H.x0-6+r()*(H.x1-H.x0+12),z=o.shore-2-r()*14;if(x>4&&x<21&&z>-4)continue;const s2=.35+r()*.4;
      bits.add(x-s2/2,o.water+.01,z-s2/2,x+s2/2,o.water+.04,z+s2/2,pad,padSide);
      if(r()<.25){const f=C(r()<.5?'#f6d3e0':'#fbf6ee');bits.add(x-.07,o.water+.04,z-.07,x+.07,o.water+.14,z+.07,f,f.clone().multiplyScalar(.85));}}}
  const bitsMesh=new THREE.Mesh(bits.geometry(),landMat);bitsMesh.name='v2-shore-plants';root.add(bitsMesh);
  root.traverse(x=>{if(x instanceof THREE.Mesh&&x!==bed&&x!==water&&x.name!=='v2-bank'&&x.material!==grassMat){x.castShadow=false;}});
  void tone;
  return root;
}
