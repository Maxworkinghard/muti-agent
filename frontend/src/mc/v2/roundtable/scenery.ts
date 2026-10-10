/**
 * 水上园林茶叙榭的天和远景（第二轮，只属于这一间，别的场景另行设计，不拿它当模板）：
 *   - 天穹：略带阴翳的傍晚。太阳在西南偏西、仰角十几度，被一层薄云罩着；向光一侧地平线淡金，背光一侧是带一点玫瑰的灰蓝；
 *     几片被夕阳从下面照亮的高积云，大片的薄云纱，不画横贯天空的色带。
 *   - 园墙以外（远景，只有简化的方块、不进碰撞、不投影）：北墙外两三层林冠、两道别家厅堂的屋脊，170–230 米外两层淡淡的低山；
 *     西面河道两岸的柳和粉墙人家、一座小石桥，河道尽头小丘上一座小塔（借景）；东、南墙外的林冠和屋脊。
 * 远处的体块按距离往雾色混（空气透视），再叠场景雾。水面在 water.ts。
 */
import * as THREE from 'three';
import {ColorBoxes,type V2Kit} from '../kit';
import {rng,valueNoise} from '../pixel';
import {CANAL,PAGODA,WALLS,WATER} from './site';

/** 这间房的光线（Look 里的同一组数）：太阳方位角（从 +x 逆时针）、仰角（度）、颜色、天边雾色 */
export interface Evening {azimuth:number;elevation:number;sun:string;haze:string}
export const sunDirection=(e:Evening)=>{const az=THREE.MathUtils.degToRad(e.azimuth),el=THREE.MathUtils.degToRad(e.elevation);return new THREE.Vector3(Math.cos(el)*Math.cos(az),Math.sin(el),-Math.cos(el)*Math.sin(az)).normalize();};
const C=(hex:string)=>new THREE.Color(hex);

/**
 * 天穹（像素画，1 像素约 0.7°）。贴图 u：0 朝西、0.25 朝南、0.5 朝东、0.75 朝北（SphereGeometry 的经度）。
 * 颜色按仰角分带，再按和太阳的方位差在“背光的灰蓝”和“向光的淡金”之间混；太阳周围一圈被薄云化开的光晕。
 */
function veiledSky(k:V2Kit,e:Evening,seed:number){
  const W=512,H=256,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;
  const img=c.createImageData(W,H),sun=sunDirection(e),sunPhi=Math.atan2(sun.z,-sun.x),n=valueNoise(seed);
  const anti:Array<[number,string]>=[[-90,'#8f959f'],[-2,'#b9b6bb'],[0,'#cdc5c4'],[5,'#c6c2c8'],[12,'#b4b9c8'],[25,'#9eabc2'],[45,'#8296b6'],[70,'#6b80a6'],[90,'#5d7299']];
  const warm:Array<[number,string]>=[[-90,'#99928b'],[-2,'#d8c4a8'],[0,'#ead2ae'],[5,'#e6c9a4'],[12,'#d9c1a6'],[25,'#bdb4b4'],[45,'#9aa2ba'],[70,'#7486ab'],[90,'#5d7299']];
  const at=(stops:Array<[number,string]>,el:number)=>{for(let i=1;i<stops.length;i++)if(el<=stops[i][0]){const [e0,a]=stops[i-1],[e1,b]=stops[i];return C(a).lerp(C(b),(el-e0)/(e1-e0));}return C(stops[stops.length-1][1]);};
  const dir=new THREE.Vector3(),col=new THREE.Color(),glow=C('#f6e6c8'),veil=C('#d3cfd2'),veilLit=C('#ecdcc6');
  for(let y=0;y<H;y++){const el=90-(y+.5)/H*180,er=THREE.MathUtils.degToRad(el);
    for(let x=0;x<W;x++){const phi=(x+.5)/W*Math.PI*2;dir.set(-Math.cos(phi)*Math.cos(er),Math.sin(er),Math.sin(phi)*Math.cos(er));
      let d=Math.abs(phi-sunPhi)%(Math.PI*2);if(d>Math.PI)d=Math.PI*2-d;const side=Math.pow((1+Math.cos(d))/2,2);
      col.copy(at(anti,el)).lerp(at(warm,el),side);
      // 薄云纱：一大片低对比的云（横向拉长的几层噪声，像高空的卷层云和几缕高积云），向光处被照成淡金；不在地平线以下
      if(el>2){const v=n(x*.012,y*.06)*.55+n(x*.04,y*.16)*.3+n(x*.11,y*.3)*.15,cover=Math.max(0,Math.min(1,(v-.5)*3))*Math.min(1,(el-2)/10)*(el<60?1:Math.max(0,(80-el)/20));col.lerp(veil.clone().lerp(veilLit,side),cover*.6);}
      const a=Math.acos(Math.min(1,Math.max(-1,dir.dot(sun))));col.lerp(glow,Math.min(1,Math.exp(-((a/.2)**2))*.7+Math.exp(-((a/.6)**2))*.22*(el>-3?1:0)));
      const q=(v:number)=>Math.round(v*255/3)*3;const i=(y*W+x)*4;img.data[i]=q(col.r);img.data[i+1]=q(col.g);img.data[i+2]=q(col.b);img.data[i+3]=255;}}
  c.putImageData(img,0,0);
  // 天用线性过滤：云纱和光晕是柔的；地上的方块世界才是一格一格的
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;
  const mat=new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false,depthWrite:false});k.owned.push(mat,t);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(240,64,32),mat);dome.name='garden-sky';dome.renderOrder=-1;dome.frustumCulled=false;return dome;
}

/**
 * 远处的一棵树：细干 + 两三团叶（一格一格的叶块，格子随距离变大，近一点的细、远的粗），只出外壳、随机挖几个洞；
 * 上面亮、下面暗，按距离混雾色。不是一个大方盒子。
 */
function canopy(b:ColorBoxes,x:number,y:number,z:number,s:number,pal:string[],r:()=>number,fade:(c:THREE.Color)=>THREE.Color,cell=Math.min(2.6,Math.max(.8,Math.hypot(x-16,z-4)*.026))){
  const trunk=fade(C('#3f352c'));b.add(x-s*.035,y,z-s*.035,x+s*.035,y+s*.42,z+s*.035,trunk,trunk);
  const g=pal.map(h=>fade(C(h))),blobs=Array.from({length:2+Math.floor(r()*2)},(_,i)=>({cx:x+(r()-.5)*s*.35,cy:y+s*(.55+r()*.15)+(i?0:s*.08),cz:z+(r()-.5)*s*.35,rx:s*(.26+r()*.1),ry:s*(.2+r()*.06)}));
  const inn=(px:number,py:number,pz:number)=>blobs.some(q=>((px-q.cx)/q.rx)**2+((py-q.cy)/q.ry)**2+((pz-q.cz)/q.rx)**2<1);
  const R=s*.6,lo=y+s*.3,hi=y+s*1.05;
  for(let px=x-R;px<=x+R;px+=cell)for(let pz=z-R;pz<=z+R;pz+=cell)for(let py=lo;py<=hi;py+=cell){if(!inn(px,py,pz))continue;
    if(inn(px+cell,py,pz)&&inn(px-cell,py,pz)&&inn(px,py+cell,pz)&&inn(px,py,pz+cell)&&inn(px,py,pz-cell))continue;if(r()<.08)continue;
    const top=g[Math.floor(r()*g.length)],under=!inn(px,py-cell,pz);b.add(px-cell/2,py-cell/2,pz-cell/2,px+cell/2,py+cell/2,pz+cell/2,top,top.clone().multiplyScalar(under?.62:.8));}
}
/** 远处的垂柳：细干、一团浅绿的冠、一圈垂下来的柳丝 */
function farWillow(b:ColorBoxes,x:number,y:number,z:number,s:number,r:()=>number,fade:(c:THREE.Color)=>THREE.Color){
  const trunk=fade(C('#4b3a2c'));b.add(x-s*.035,y,z-s*.035,x+s*.035,y+s*.5,z+s*.035,trunk,trunk);
  const g=['#8aa456','#9bb563','#78924a','#a8c070'].map(h=>fade(C(h))),top=y+s*.48,w=s*.6;
  b.add(x-w/2,top,z-w/2,x+w/2,top+s*.2,z+w/2,g[0],g[2]);b.add(x-w*.32,top+s*.18,z-w*.32,x+w*.32,top+s*.3,z+w*.32,g[3],g[1]);
  const n=12+Math.floor(r()*6);for(let i=0;i<n;i++){const a=i/n*Math.PI*2+r()*.4,rr=w*(.4+r()*.12),px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr,len=s*(.28+r()*.32),t=Math.max(.05,s*.016),c=g[i%4];b.add(px-t,top-len,pz-t,px+t,top+s*.04,pz+t,c,c.clone().multiplyScalar(.82));}
}
/** 粉墙黛瓦的一户：白墙方盒，两坡阶梯瓦顶，檐下一排深色窗洞；two 为两层。顺着 x 方向，山墙朝东西。 */
function house(b:ColorBoxes,x:number,y:number,z:number,w:number,d:number,two:boolean,fade:(c:THREE.Color)=>THREE.Color){
  const wall=fade(C('#e6e2d8')),wallSide=fade(C('#d6d0c3')),tile=fade(C('#4d5258')),tileSide=fade(C('#3b3f44')),win=fade(C('#4f4338'));
  const h=two?5.4:3.3;b.add(x,y,z,x+w,y+h,z+d,wall,wallSide);
  for(let i=0;i<Math.floor(w/2.2);i++){const wx=x+1+i*2.2;b.add(wx,y+1,z+d,wx+.9,y+2.1,z+d+.06,win,win);if(two)b.add(wx,y+3.5,z+d,wx+.9,y+4.5,z+d+.06,win,win);}
  for(let l=0;l<3;l++){const inset=l*d/6,yy=y+h+l*.5;b.add(x-.4,yy,z-.5+inset,x+w+.4,yy+.5,z+d+.5-inset,tile,tileSide);}
  b.add(x-.5,y+h+1.5,z+d/2-.22,x+w+.5,y+h+1.8,z+d/2+.22,tileSide,tileSide);
}
/** 一道厅堂的屋脊（墙外只露出屋顶）：歇山的意思，几级阶梯瓦，脊两头翘一点 */
function roofline(b:ColorBoxes,x:number,y:number,z:number,w:number,d:number,fade:(c:THREE.Color)=>THREE.Color){
  const tile=fade(C('#4c5157')),tileSide=fade(C('#393d42')),wall=fade(C('#e3dfd5'));b.add(x,y,z,x+w,y+2.4,z+d,wall,wall.clone().multiplyScalar(.92));
  for(let l=0;l<4;l++){const yy=y+2.4+l*.55,inset=l*d/8;b.add(x-.8+l*.15,yy,z-.8+inset,x+w+.8-l*.15,yy+.55,z+d+.8-inset,tile,tileSide);}
  const ry=y+2.4+2.2;b.add(x-.2,ry,z+d/2-.25,x+w+.2,ry+.3,z+d/2+.25,tileSide,tileSide);for(const ex of [x-.4,x+w-.2])b.add(ex,ry+.2,z+d/2-.25,ex+.6,ry+.7,z+d/2+.25,tileSide,tileSide);
}
/** 小石拱桥（河道上，远景）：半圆券洞、桥面拱起、两侧矮栏。顺着 z 跨过河道，中心在 (cx, cz)。 */
function smallBridge(b:ColorBoxes,cx:number,y:number,cz:number,span:number,fade:(c:THREE.Color)=>THREE.Color){
  const stone=fade(C('#b1aca2')),side=fade(C('#99938a')),R=span/2-.6,step=.5,width=2.6;
  for(let z=-span/2-2.5;z<span/2+2.5;z+=step){const az=Math.abs(z+step/2),deck=y+R+1.1-Math.max(0,az-1.2)*.3,hole=az<R?y+Math.sqrt(R*R-az*az):y-1;
    b.add(cx-width/2,hole,cz+z,cx+width/2,deck,cz+z+step,stone,side);for(const s of [-1,1])b.add(cx+s*width/2-(s>0?.22:0),deck,cz+z,cx+s*width/2+(s<0?.22:0),deck+.42,cz+z+step,side,side);}
}
/** 塔：方形塔身一层比一层收，每层一圈出檐、四角起一点，塔刹一根细柱。 */
function pagoda(b:ColorBoxes,x:number,y:number,z:number,tiers:number,fade:(c:THREE.Color)=>THREE.Color){
  const body=fade(C('#8d8478')),bodySide=fade(C('#776f64')),eave=fade(C('#403c3b')),eaveSide=fade(C('#323030')),gold=fade(C('#8f7a50'));
  let w=4.4,yy=y;for(let i=0;i<tiers;i++){const h=i?2.2:2.8;b.add(x-w/2,yy,z-w/2,x+w/2,yy+h,z+w/2,body,bodySide);const e=w/2+.9;b.add(x-e,yy+h,z-e,x+e,yy+h+.45,z+e,eave,eaveSide);
    for(const sx of [-1,1])for(const sz of [-1,1])b.add(x+sx*e-(sx>0?.45:0),yy+h+.45,z+sz*e-(sz>0?.45:0),x+sx*e+(sx<0?.45:0),yy+h+.85,z+sz*e+(sz<0?.45:0),eave,eaveSide);
    yy+=h+.45;w*=.87;}
  b.add(x-.6,yy,z-.6,x+.6,yy+.9,z+.6,eave,eaveSide);b.add(x-.15,yy+.9,z-.15,x+.15,yy+4.5,z+.15,gold,gold);
}

export function buildScenery(k:V2Kit,e:Evening):THREE.Group{
  const root=new THREE.Group();root.name='garden-scenery';
  const r=rng(53),n=valueNoise(53),haze=C(e.haze);
  const sky=veiledSky(k,e,11);sky.position.set(16,0,0);root.add(sky);
  const land=new ColorBoxes(),flora=new ColorBoxes(),built=new ColorBoxes();
  const fadeAt=(dist:number)=>(c:THREE.Color)=>c.clone().lerp(haze,Math.min(.8,Math.max(0,(dist-30)/240)));
  const distTo=(x:number,z:number)=>Math.hypot(x-16,z-4);
  // 园外的地：切成一块块（近处 10 米、远处 30 米），每块按自己的距离混雾色——不能整片一个颜色，不然墙根外就是一片发白的平地
  const ground=(x0:number,z0:number,x1:number,z1:number)=>{for(let x=x0;x<x1;){const tx=Math.abs(x-16)<120?10:30;for(let z=z0;z<z1;){const tz=Math.abs(z)<120?10:30,xe=Math.min(x1,x+tx),ze=Math.min(z1,z+tz),f=fadeAt(distTo((x+xe)/2,(z+ze)/2)),v=.94+n(x*.05,z*.05)*.12;
    land.add(x,WATER-1.4,z,xe,1,ze,f(C('#465f37').multiplyScalar(v)),f(C('#4a4f3a')));z=ze;}x+=tx;}};
  const PAL={dark:['#3f5a35','#4a663d','#36502f'],mid:['#4f6b3d','#5c7946','#456035'],fresh:['#5f7d42','#6c8a4b','#54703a']};
  // ——园墙外的地：北、南两大块，东面一块；西面被河道分开
  ground(-300,-300,320,WALLS.north);ground(-300,WALLS.south,320,320);ground(WALLS.east,WALLS.north,320,WALLS.south);
  // 河道中心线和半宽；过了尽头（塔下的小丘）就没有河了
  const canalAt=(x:number)=>{for(let i=1;i<CANAL.length;i++){const a=CANAL[i-1],b=CANAL[i];if(x<=a.x&&x>=b.x){const t=(a.x-x)/(a.x-b.x);return {z:a.z+(b.z-a.z)*t,half:a.half+(b.half-a.half)*t};}}return {z:CANAL[CANAL.length-1].z,half:0};};
  for(let x=WALLS.west;x>-300;x-=3){const {z,half}=canalAt(x-1.5),f=fadeAt(distTo(x,z));
    land.add(x-3,WATER-1.4,WALLS.north,x,1,z-half,f(C('#4f6a3e')),f(C('#4a4f3a')));land.add(x-3,WATER-1.4,z+half,x,1,WALLS.south,f(C('#4f6a3e')),f(C('#4a4f3a')));
    // 河岸：浅灰的条石边
    for(const s of [-1,1]){const zz=z+s*half;land.add(x-3,WATER-1,Math.min(zz,zz+s*.6),x,1.05,Math.max(zz,zz+s*.6),f(C('#a5a197')),f(C('#8c887f')));}}
  // ——北墙外：几层林冠（墙外 4–90 米，越远越稀、越淡），两道别家厅堂的屋脊，再远一点是一片粉墙黛瓦的屋顶（城里），都只露出顶
  for(let i=0;i<105;i++){const x=-70+r()*170,z=WALLS.north-4-Math.pow(r(),.9)*86,s=8+r()*6,f=fadeAt(distTo(x,z)+6);canopy(flora,x,1,z,s,r()<.5?PAL.dark:PAL.mid,r,f);}
  roofline(built,4,1,-58,12,7,fadeAt(64));roofline(built,30,1,-66,10,6,fadeAt(72));
  for(let i=0;i<26;i++){const x=-80+r()*190,z=-96-r()*40,w=7+r()*6,d=5+r()*3;roofline(built,x,1+r()*1.5,z,w,d,fadeAt(distTo(x,z)));}
  // ——远山：两层淡淡的低山（不高、不抢画面），只往雾色混一部分，留住轮廓
  for(const [z0,z1,base,amp,col,mix] of [[-185,-160,6,12,'#5f7363',.38],[-240,-205,10,18,'#6f8193',.5]] as const){
    for(let x=-200;x<240;x+=6)for(let z=z0;z<z1;z+=6){const ridge=Math.max(0,n(x*.016,z*.02+7)-.25)*1.4,h=WATER+base*.4+ridge*amp+n(x*.06,z*.06)*3;const y=Math.floor(h/2)*2,top=C(col).lerp(haze,mix),side=C(col).multiplyScalar(.86).lerp(haze,mix);land.add(x,WATER-2,z,x+6,y,z+6,top,side);}}
  // ——东墙外、南墙外：林冠和屋脊（墙外 3–70 米）
  for(let i=0;i<48;i++){const x=WALLS.east+3+Math.pow(r(),.9)*68,z=-70+r()*130,s=7+r()*6;canopy(flora,x,1,z,s,r()<.5?PAL.mid:PAL.dark,r,fadeAt(distTo(x,z)));}
  for(let i=0;i<48;i++){const x=-40+r()*120,z=WALLS.south+3+Math.pow(r(),.9)*64,s=7+r()*6;canopy(flora,x,1,z,s,r()<.4?PAL.fresh:PAL.dark,r,fadeAt(distTo(x,z)));}
  for(let i=0;i<12;i++){const x=62+r()*50,z=-40+r()*80;roofline(built,x,1,z,7+r()*5,5+r()*3,fadeAt(distTo(x,z)));}
  for(let i=0;i<12;i++){const x=-30+r()*90,z=52+r()*40;roofline(built,x,1,z,7+r()*5,5+r()*3,fadeAt(distTo(x,z)));}
  roofline(built,-8,1,36,10,6,fadeAt(40));roofline(built,34,1,42,9,6,fadeAt(46));
  // ——西面河道：两岸垂柳、粉墙人家，一座小石桥；河道尽头小丘上的小塔（借景，约 190 米外，不当画面中心）
  for(let x=-34;x>-185;x-=5+r()*4){const {z,half}=canalAt(x);for(const s of [-1,1]){if(r()<.25)continue;const tz=z+s*(half+1.5+r()*2.5),dist=distTo(x,tz),f=fadeAt(dist);farWillow(flora,x,1,tz,5+r()*2.4,r,f);}}
  for(const [x,s,w,d,two] of [[-46,-1,8,6,true],[-58,1,6,5,false],[-72,-1,9,6,true],[-86,1,7,5,false],[-104,-1,8,6,true],[-118,1,7,6,false],[-132,-1,6,5,false],[-150,1,8,6,true]] as const){const {z,half}=canalAt(x),zz=s<0?z-half-4-d:z+half+4;house(built,x,1,zz,w,d,two,fadeAt(distTo(x,zz)));}
  for(let i=0;i<28;i++){const x=-30-r()*170,{z,half}=canalAt(x),s=r()<.5?-1:1,tz=z+s*(half+9+r()*25),sz=8+r()*5;canopy(flora,x,1,tz,sz,r()<.5?PAL.dark:PAL.mid,r,fadeAt(distTo(x,tz)+10));}
  {const {z}=canalAt(-96);smallBridge(built,-96,WATER,z,9,fadeAt(110));}
  {const hx=PAGODA.x,hz=PAGODA.z,f=fadeAt(distTo(hx,hz));for(let x=hx-20;x<hx+20;x+=4)for(let z=hz-18;z<hz+18;z+=4){const d=Math.hypot(x+2-hx,z+2-hz)/20;if(d>1)continue;const y=WATER+Math.floor((5*(1-d*d)+n(x*.1,z*.1)*2)/1)*1;land.add(x,WATER-2,z,x+4,y,z+4,f(C('#56704a')),f(C('#4a5f40')));if(r()<.35)canopy(flora,x+2,y,z+2,6+r()*3,PAL.dark,r,f);}
    // 塔只混一部分雾色：远看是一道淡淡的灰剪影，再叠场景雾
    pagoda(built,hx,WATER+5,hz,5,c=>c.clone().lerp(haze,.38));}
  const mat=k.flat('#ffffff',{vertex:true});
  for(const [cb,name] of [[land,'garden-far-land'],[flora,'garden-far-flora'],[built,'garden-far-built']] as const){const m=new THREE.Mesh(cb.geometry(),mat);m.name=name;m.castShadow=false;m.receiveShadow=true;root.add(m);}
  return root;
}
