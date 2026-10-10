/**
 * 水上茶叙榭的家具与陈设（v2 自己设计、自己画贴图）：圆桌（和园林茶椅同一套木料、同一种马蹄足和牙板）、
 * 宫灯（只留一两盏、很暗）、竹帘、花几盆景、系在埠头边的一条小船。
 * 第二轮按用户要求：桌面留空，不放茶具；不再有茶寮风炉和绣墩；“茶叙感”交给空间和光，不交给摆件。
 * 尺寸按人物比例：座高 0.50（共用椅子族）、桌面 0.72，坐下以后桌沿在腰腹，不挡胸口和手臂。
 */
import * as THREE from 'three';
import type {Painter} from '../../style';
import {rng,tone} from '../pixel';
import {ColorBoxes,place,type V2Kit} from '../kit';
import {GARDEN_WOOD} from '../../props/chairs';

/** 家具木料：榉木，温润的中褐，比建筑的栗壳色浅一档、暖一点（建筑压得住，家具是画面里最亲近的一块暖色）；和园林茶椅共用一组 */
const TABLE_WOOD=GARDEN_WOOD;
/** 道具贴图（16×16，按每米 32 像素平铺；小件按自身尺寸整张铺）。都是画出来的纹，不撒随机点。 */
export const PROP_PAINT:Record<string,Painter>={
  // 桌面：顺着 x 的四条宽板（每条 4 像素 = 12.5 厘米），板缝很淡，每条板上一两道长木纹
  tableTop:p=>{const T=TABLE_WOOD.top;for(let b=0;b<4;b++){const c=T[b];p.rect(0,b*4,16,4,c).rect(0,b*4,16,1,tone(c,1.05)).rect(0,b*4+3,16,1,tone(c,.9));}
    for(const [x,y,l] of [[2,1,9],[7,6,8],[1,9,6],[9,13,6],[11,2,4]] as const)p.rect(x,y,l,1,tone(T[Math.floor(y/4)],.9));},
  tableEdge:p=>{p.fill(TABLE_WOOD.edge);p.rect(0,0,16,1,tone(TABLE_WOOD.edge,1.12)).rect(0,15,16,1,tone(TABLE_WOOD.edge,.8));for(const [x,l] of [[3,7],[11,4]] as const)p.rect(x,7,l,1,tone(TABLE_WOOD.edge,.9));},
  legWood:p=>{p.fill(TABLE_WOOD.leg);p.rect(7,0,1,16,tone(TABLE_WOOD.leg,1.1));for(const [x,y,l] of [[3,2,8],[11,6,7]] as const)p.rect(x,y,1,l,tone(TABLE_WOOD.leg,.88));},
  celadon:p=>{p.fill('#9db8a2');p.rect(0,0,16,2,'#b6ccb8');p.rect(0,12,16,4,'#87a490');p.rect(0,6,16,1,'#a9c2ad');},
  // 宫灯：米色绢面上一枝淡墨兰草，四角深色木框，红缨
  silk:p=>{p.fill('#f6e7c8');p.rect(0,0,16,1,'#d9b98a').rect(0,15,16,1,'#d9b98a');p.rect(7,4,1,8,'#a38a5c').px(6,6,'#a38a5c').px(8,5,'#a38a5c').px(9,8,'#a38a5c').px(5,9,'#a38a5c').px(10,10,'#a38a5c');},
  lanternFrame:p=>{p.fill('#3d2a20');p.rect(0,0,16,1,'#5a4030');},
  tassel:p=>{p.fill('#8e3a30');for(let x=0;x<16;x+=2)p.rect(x,0,1,16,'#a5463a');},
  // 竹帘：细竹篾一条条，留缝，两道深色编绳
  blind:p=>{p.clear();for(let y=0;y<16;y+=2)p.rect(0,y,16,1,y%4?'#bba26a':'#a88f56');p.rect(4,0,1,16,'#5e4428').rect(11,0,1,16,'#5e4428');},
  bambooRoll:p=>{p.fill('#a88f56');for(let x=0;x<16;x+=3)p.rect(x,0,1,16,'#8f773f');},
  rope:p=>{p.fill('#8f7647');for(let y=0;y<16;y+=2)p.px(0,y,'#6d5634');},
  clay:p=>{p.fill('#8a5a44');p.rect(0,0,16,2,'#9e6c52').rect(0,13,16,3,'#6d4434');},
  boat:p=>{const cs=['#5e4433','#54392b','#654a37','#5a3f2f'];for(let y=0;y<16;y+=4){const c=cs[y/4];p.rect(0,y,16,4,c).rect(0,y+3,16,1,tone(c,.75));}},
};
const M=(k:V2Kit,name:keyof typeof PROP_PAINT,o?:Parameters<V2Kit['mat']>[2])=>k.mat('rt-'+name,PROP_PAINT[name],o);

/**
 * 圆桌：冰盘沿桌面（上面一层 4 厘米，下沿收进一道小线）、束腰、一圈窄牙板；六条方腿（上粗下细，脚下马蹄足往里勾），
 * 腿间离地 0.2 米一圈细横枨。桌下是空的，能看到地面，不是一整根木圆柱。桌面外沿往里 16 厘米一道很细的嵌线。原点在地面中心。
 */
export function roundTable(k:V2Kit,r:number,height:number){
  const g=new THREE.Group();g.name='garden-round-table';const top=M(k,'tableTop',{rough:.4}),edge=M(k,'tableEdge',{rough:.45}),leg=M(k,'legWood',{rough:.5});
  k.prism(g,r,.04,32,[edge,top,top],0,height-.02,0,32);k.prism(g,r-.025,.02,32,edge,0,height-.05,0,32);
  k.prism(g,r-.09,.03,32,leg,0,height-.075,0,32);k.prism(g,r-.065,.05,32,edge,0,height-.115,0,32);
  const inlay=new THREE.Mesh(new THREE.RingGeometry(r-.175,r-.16,64),k.flat(TABLE_WOOD.leg));inlay.rotation.x=-Math.PI/2;inlay.position.y=height+.001;inlay.receiveShadow=true;g.add(inlay);
  const R=r-.12,legH=height-.14;
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+Math.PI/6,x=Math.cos(a),z=Math.sin(a);
    const up=k.box(g,.065,legH*.55,.065,leg,x*R,legH*.725,z*R,32);up.rotation.y=-a;
    const low=k.box(g,.055,legH*.47,.055,leg,x*(R-.006),legH*.235+.03,z*(R-.006),32);low.rotation.y=-a;
    const foot=k.box(g,.075,.04,.075,leg,x*(R-.03),.02,z*(R-.03),32);foot.rotation.y=-a;
    // 牙头：腿和牙板相接处一块小角牙
    const tooth=k.box(g,.16,.05,.03,edge,x*(R+.02),height-.165,z*(R+.02),32);tooth.rotation.y=-a+Math.PI/2;}
  for(let i=0;i<6;i++){const a0=i/6*Math.PI*2+Math.PI/6,a1=(i+1)/6*Math.PI*2+Math.PI/6,ax=Math.cos(a0)*(R-.01),az=Math.sin(a0)*(R-.01),bx=Math.cos(a1)*(R-.01),bz=Math.sin(a1)*(R-.01);
    const len=Math.hypot(bx-ax,bz-az),s=k.box(g,len,.03,.025,leg,(ax+bx)/2,.2,(az+bz)/2,32);s.rotation.y=-Math.atan2(bz-az,bx-ax);}
  return g;
}
/** 宫灯（很暗的一两盏）：六角，上下木盖、绢面、红缨。原点在顶部挂点。 */
export function palaceLantern(k:V2Kit,size=.42,glow=1.25){
  const g=new THREE.Group();g.name='garden-palace-lantern';const f=M(k,'lanternFrame'),h=size*1.3;
  k.prism(g,size*.62,.06,6,f,0,-.03,0);k.prism(g,size*.5,.05,6,f,0,-.085,0);
  k.prism(g,size*.5,h,6,M(k,'silk',{glow}),0,-.11-h/2,0);
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+Math.PI/6;k.box(g,.03,h+.02,.03,f,Math.cos(a)*size*.5,-.11-h/2,Math.sin(a)*size*.5);}
  k.prism(g,size*.56,.05,6,f,0,-.135-h,0);k.prism(g,size*.32,.07,6,f,0,-.2-h,0);
  k.box(g,.035,.22,.035,M(k,'tassel'),0,-.26-h,0);
  return g;
}
/** 纸灯笼（廊下的小灯）：上下木盖、四面发光纸。原点在顶部挂点。 */
export function paperLantern(k:V2Kit,size=.28,glow=1.1){
  const g=new THREE.Group(),h=size*1.25,f=M(k,'lanternFrame');
  k.box(g,size+.05,.04,size+.05,f,0,-.02,0);k.box(g,size+.05,.04,size+.05,f,0,-h-.02,0);
  k.box(g,size,h,size,M(k,'silk',{glow}),0,-h/2-.02,0);
  for(const x of [-1,1])for(const z of [-1,1])k.box(g,.025,h,.025,f,x*size/2,-h/2-.02,z*size/2);
  return g;
}
/** 吊绳：从挂点往上到梁底。 */
export function cord(k:V2Kit,length:number){const g=new THREE.Group();k.box(g,.02,length,.02,M(k,'rope'),0,length/2,0);return g;}
/** 竹帘：顶上一卷帘轴，放下一段帘面（篾缝透光，在地上落出细条纹）。原点在顶部中心，帘面在 x-y 平面。 */
export function bambooBlind(k:V2Kit,width:number,drop:number){
  const g=new THREE.Group();g.name='garden-blind';const roll=k.prism(g,.06,width,8,M(k,'bambooRoll'),0,-.06,0);roll.rotation.z=Math.PI/2;
  if(drop>0){const m=M(k,'blind',{side:THREE.DoubleSide}),geo=new THREE.PlaneGeometry(width,drop),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*width*1.4,uv.getY(i)*drop*1.4);
    const p=new THREE.Mesh(geo,m);p.position.y=-.12-drop/2;p.castShadow=true;p.receiveShadow=true;g.add(p);
    for(const x of [-width*.3,width*.3])k.box(g,.015,drop+.1,.02,M(k,'rope'),x,-.1-drop/2,.02);}
  return g;
}
/** 花几上一盆松（盆景）：细高的花几，陶盆，一棵小松（歪脖子的干，三层平展的松针团）。原点在地面中心。 */
export function bonsaiStand(k:V2Kit,height=.82,seed=1){
  const g=new THREE.Group();g.name='garden-bonsai';const wood=M(k,'legWood',{rough:.5}),r=rng(seed);
  for(const x of [-.14,.14])for(const z of [-.14,.14])k.box(g,.04,height,.04,wood,x,height/2,z,32);
  k.box(g,.36,.04,.36,wood,0,height,0,32);k.box(g,.3,.03,.3,wood,0,.12,0,32);
  k.box(g,.32,.1,.22,M(k,'clay'),0,height+.07,0,64);k.box(g,.28,.015,.18,k.flat('#4a3a2c'),0,height+.125,0);
  const bark=k.flat('#5a4636'),cb=new ColorBoxes(),pine=[new THREE.Color('#3f6a45'),new THREE.Color('#4f7d52'),new THREE.Color('#33583a')];
  const trunk=[[0,.13,0],[.05,.25,.02],[-.02,.36,.04],[.06,.45,0]];for(let i=1;i<trunk.length;i++){const [a,b,c]=trunk[i-1],[d,e,f]=trunk[i];const m=k.box(g,.035,e-b+.02,.035,bark,(a+d)/2,height+(b+e)/2,(c+f)/2);m.rotation.z=Math.atan2(a-d,e-b);}
  for(const [x,y,z,s] of [[.12,.32,.02,.16],[-.1,.4,.03,.13],[.07,.5,-.02,.12]] as const)for(let j=0;j<6;j++){const px=x+(r()-.5)*s,pz=z+(r()-.5)*s*.7,ss=.04+r()*.04,c=pine[j%3];cb.add(px-ss,height+y,pz-ss,px+ss,height+y+.05,pz+ss,c,c.clone().multiplyScalar(.82),undefined,false);}
  const m=new THREE.Mesh(cb.geometry(),k.flat('#ffffff',{vertex:true}));m.castShadow=true;g.add(m);
  return g;
}
/** 小木船：船底、两舷、船头翘起，中间一块横板、船尾一支桨。原点在水面中心，船身顺着 x。 */
export function boat(k:V2Kit){
  const g=new THREE.Group();g.name='garden-boat';const m=M(k,'boat');
  k.box(g,2.6,.12,.7,m,0,.02,0);for(const z of [-.36,.36])k.box(g,2.8,.26,.07,m,0,.17,z);
  for(const s of [-1,1]){const p=k.box(g,.5,.3,.75,m,s*1.42,.24,0);p.rotation.z=s*.4;}
  k.box(g,.14,.05,.72,m,.3,.24,0);const oar=k.box(g,1.6,.04,.06,M(k,'legWood'),-1.1,.36,.2);oar.rotation.y=.25;oar.rotation.z=-.12;
  return g;
}
/**
 * 抱柱联：贴在柱子朝厅内一面的一条竖板，深色退光漆底，一道细金边，五个楷书字（浅金）。
 * 原点在板的底边中心，字面朝 +z；字从上往下排。
 */
export function pillarCouplet(k:V2Kit,text:string,h=2){
  const g=new THREE.Group();g.name='garden-couplet';const W=.21,D=.03,chars=[...text];
  const cw=96,cv=document.createElement('canvas');cv.width=cw;cv.height=Math.round(cw*h/W);const c=cv.getContext('2d')!;
  c.fillStyle='#2b201a';c.fillRect(0,0,cv.width,cv.height);
  c.strokeStyle='#8a7550';c.lineWidth=3;c.strokeRect(7,7,cv.width-14,cv.height-14);
  c.fillStyle='#d2c294';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${Math.round(cw*.66)}px "KaiTi","STKaiti","Kaiti SC","楷体",serif`;
  const top=cw*.75,step=(cv.height-top*2)/(chars.length-1||1);chars.forEach((ch,i)=>c.fillText(ch,cw/2,top+i*step));
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;k.owned.push(t);
  const face=new THREE.MeshStandardMaterial({map:t,roughness:.45,metalness:0});k.owned.push(face);
  const lacquer=k.flat('#2b201a',{rough:.45});
  // 盒子的六个面：+x、−x、+y、−y、+z（字面）、−z
  const board=new THREE.Mesh(new THREE.BoxGeometry(W,h,D),[lacquer,lacquer,lacquer,lacquer,face,lacquer]);board.position.y=h/2;board.castShadow=true;board.receiveShadow=true;g.add(board);
  return g;
}
/** 兰花几：细高的花几（和盆景花几同一种木），青瓷盆，一丛往外拱、梢头下垂的长叶，两枝淡黄绿的花。原点在地面中心。 */
export function orchidStand(k:V2Kit,height=.9,seed=1){
  const g=new THREE.Group();g.name='garden-orchid';const wood=M(k,'legWood',{rough:.5}),r=rng(seed);
  for(const x of [-.13,.13])for(const z of [-.13,.13])k.box(g,.04,height,.04,wood,x,height/2,z,32);
  k.box(g,.34,.04,.34,wood,0,height,0,32);k.box(g,.28,.03,.28,wood,0,.12,0,32);
  k.prism(g,.12,.17,8,M(k,'celadon',{rough:.35}),0,height+.105,0,64);k.prism(g,.105,.012,8,k.flat('#3a2e24'),0,height+.19,0);
  const b=new ColorBoxes(),leaf=[new THREE.Color('#3c6a3a'),new THREE.Color('#4a7a44'),new THREE.Color('#33583a')],flower=new THREE.Color('#e3dfae'),y0=height+.19;
  for(let i=0;i<13;i++){const a=i/13*Math.PI*2+r()*.4,L=.42+r()*.22,lift=.22+r()*.14,c=leaf[i%3];let px=0,py=y0,pz=0;
    for(let j=0;j<7;j++){const t=(j+1)/7,nx=Math.cos(a)*L*t,nz=Math.sin(a)*L*t,ny=y0+lift*Math.sin(t*Math.PI*.85)-t*t*.12,w=.012*(1-t*.6);
      b.add(Math.min(px,nx)-w,Math.min(py,ny)-.004,Math.min(pz,nz)-w,Math.max(px,nx)+w,Math.max(py,ny)+.004,Math.max(pz,nz)+w,c,c.clone().multiplyScalar(.75));px=nx;py=ny;pz=nz;}}
  for(let s=0;s<2;s++){const a=r()*Math.PI*2,sx=Math.cos(a)*.05,sz=Math.sin(a)*.05,h2=.32+r()*.1;b.add(sx-.006,y0,sz-.006,sx+.006,y0+h2,sz+.006,leaf[1],leaf[2]);
    for(let f=0;f<4;f++){const fy=y0+h2-.02-f*.05,fx=sx+Math.cos(a+f)*.035,fz=sz+Math.sin(a+f)*.035;b.add(fx-.018,fy-.012,fz-.018,fx+.018,fy+.012,fz+.018,flower,flower.clone().multiplyScalar(.85));}}
  const m=new THREE.Mesh(b.geometry(),k.flat('#ffffff',{vertex:true}));m.castShadow=true;m.receiveShadow=true;g.add(m);
  return g;
}
export {place};
