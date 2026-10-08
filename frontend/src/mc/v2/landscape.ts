/**
 * 远景：湖面（带倒影）、对岸的林带、两侧的山坡、雪山和体块云。都是 v2 自己生成的几何体，
 * 方块语言（按格子起伏的台地、方块树冠），颜色靠顶点色，远处交给场景雾做空气透视。
 * 尺寸单位米；相机远裁剪面是 300 米，所有东西都放在 300 米以内。
 */
import * as THREE from 'three';
import {ColorBoxes,type V2Kit} from './kit';
import {PAL,rng,tone} from './pixel';
import {V2_BLOCK_PAINT} from './blockTextures';

export interface LakeSetting {
  /** 水面高度 */water:number;
  /** 近岸线（水面从这里往 -z 铺） */shore:number;
  /** 对岸起点 z、雪山带 z */farShore:number;mountains:number;
  /** 湖的左右岸（x） */west:number;east:number;
  /** 近处草地高度（顶面） */ground:number;
  /** 近处用方块铺的地形范围（这里不铺平面草地） */hole?:{x0:number;x1:number;z0:number;z1:number};
  /** 雪山高度倍数 */peakScale?:number;
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
  // 对岸：z 从 farShore 往后 70 米，x 跨整个湖。
  for(let x=o.west-120;x<o.east+120;x+=cell)for(let z=o.farShore-70;z<o.farShore;z+=cell){
    const back=(o.farShore-z)/70,h=o.water+1+Math.floor((back*14+n(x*.05,z*.05)*10)/1.5)*1.5;terrace(x,z,h);
    if(r()<.55){const kinds=['oak','oak','spruce','birch','cherry'] as const,kind=r()<.06?'cherry':kinds[Math.floor(r()*4)];tree(trees,x+cell/2+(r()-.5)*2,h,z+cell/2+(r()-.5)*2,5+r()*4,kind,r);}
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

  // ——雪山：8 米一格的阶梯山体，几座主峰加噪声；山脚林线、中段岩石、上部积雪。
  const mount=new ColorBoxes(),mc=8,ps=o.peakScale??1,peaks=[[-150,95],[-60,120],[30,88],[120,130],[210,100],[-230,80]].map(([x,h])=>({x,h:h*ps,z:o.mountains-30+r()*40,w:(55+r()*35)*Math.max(.6,ps)}));
  const rock=C('#6e7a8a'),rockDark=C('#56606e'),snow=C('#eef3f8'),snowSide=C('#c9d5e4'),pine=C('#2f4d3c');
  for(let x=-320;x<360;x+=mc)for(let z=o.mountains-60;z<o.mountains+40;z+=mc){
    let h=o.water+6*ps+n(x*.02,z*.02)*16*ps;for(const p of peaks){const d=Math.hypot(x-p.x,(z-p.z)*1.4);h=Math.max(h,o.water+p.h*Math.exp(-(d*d)/(2*p.w*p.w))+n(x*.08,z*.08)*10);}
    h=Math.floor(h/(4*Math.max(.5,ps)))*4*Math.max(.5,ps);const rel=(h-o.water)/ps,top=rel>78?snow:rel>56?(n(x*.3,z*.3)>.45?snow:rock):rel>26?rock:pine,side=rel>78?snowSide:rel>26?rockDark:pine.clone().multiplyScalar(.8);
    mount.add(x,o.water-2,z,x+mc,h,z+mc,top,side);}
  void mc;
  const mountMesh=new THREE.Mesh(mount.geometry(),landMat);mountMesh.name='v2-mountains';root.add(mountMesh);

  // ——倒影：对岸、树、山按水面镜像，颜色压暗偏蓝，画在水面下面（水是半透明的）。
  const mirrorMat=k.flat('#7f97ab',{vertex:true,side:THREE.DoubleSide});
  const mirror=new THREE.Group();mirror.name='v2-reflection';for(const m of [landMesh,treeMesh,mountMesh]){const c=new THREE.Mesh(m.geometry,mirrorMat);mirror.add(c);}
  mirror.scale.y=-1;mirror.position.y=2*o.water;root.add(mirror);

  // ——体块云：几团白色方块堆成的积云，底部略带灰蓝，不受雾影响。
  const clouds=new ColorBoxes(),white=C('#ffffff'),shadeC=C('#d7e2ee'),under=C('#c3d1e2');
  const puff=(cx:number,cy:number,cz:number,s:number)=>{for(let i=0;i<7;i++){const w=s*(.5+r()*.6),h=s*(.25+r()*.3),dx=(r()-.5)*s*1.4,dz=(r()-.5)*s*.6,dy=r()*s*.25;clouds.add(cx+dx-w/2,cy+dy,cz+dz-w/2*.6,cx+dx+w/2,cy+dy+h,cz+dz+w/2*.6,white,shadeC,under,false);}};
  for(const [x,y,z,s] of [[-120,70,-230,40],[-30,92,-250,46],[70,64,-220,34],[150,84,-240,44],[-200,60,-150,30],[230,72,-150,36],[0,110,-200,26]] as const)puff(x,y,z,s);
  const cloudMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});k.owned.push(cloudMat);
  const cloudMesh=new THREE.Mesh(clouds.geometry(),cloudMat);cloudMesh.name='v2-clouds';cloudMesh.castShadow=false;root.add(cloudMesh);
  root.traverse(x=>{if(x instanceof THREE.Mesh&&x!==bed&&x!==water&&x.name!=='v2-bank'&&x.material!==grassMat){x.castShadow=false;}});
  void tone;
  return root;
}
