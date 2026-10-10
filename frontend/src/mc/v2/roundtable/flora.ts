/**
 * 茶叙榭近处的植物和山石（道具层，方块语言：都是一个个小方块拼的，颜色靠顶点色）：
 *   垂柳（倾向水面的干、几根主枝、一团树冠、上百条垂下来的柳丝，风里轻轻摆）、竹丛（细竿、竹节、上半段一簇簇有厚度的叶）、
 *   荷（贴水的圆叶、几片出水的叶子、几个花苞和一两朵开的花）、菖蒲和芦苇、太湖石（有洞有缝的灰白石堆）、芭蕉、小黑松。
 * 摆动只在顶点着色器里按“离挂点多远”加一点正弦位移（sway 属性 0→1），不改动几何、不影响碰撞，阴影保持静止。
 */
import * as THREE from 'three';
import {ColorBoxes,type V2Kit} from '../kit';
import {rng,valueNoise} from '../pixel';
import {WATER} from './site';

const C=(h:string)=>new THREE.Color(h);
/** 带摆动权重的顶点色盒子（和 ColorBoxes 同样的面，多一个 sway 属性：下沿 s0、上沿 s1） */
class SwayBoxes {
  private pos:number[]=[];private col:number[]=[];private nor:number[]=[];private idx:number[]=[];private sw:number[]=[];
  add(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,top:THREE.Color,side:THREE.Color,s0:number,s1:number,bottom=true){
    const faces:Array<[number[],number[][],THREE.Color,number[]]>=[
      [[0,1,0],[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],top,[s1,s1,s1,s1]],
      [[0,0,1],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],side,[s0,s0,s1,s1]],
      [[0,0,-1],[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],side,[s0,s0,s1,s1]],
      [[1,0,0],[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],side.clone().multiplyScalar(.9),[s0,s0,s1,s1]],
      [[-1,0,0],[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],side.clone().multiplyScalar(.9),[s0,s0,s1,s1]],
      [[0,-1,0],[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],side.clone().multiplyScalar(.7),[s0,s0,s0,s0]],
    ];
    if(!bottom)faces.pop();
    for(const [n,ps,c,s] of faces){const base=this.pos.length/3;ps.forEach((p,i)=>{this.pos.push(...p);this.nor.push(...n);this.col.push(c.r,c.g,c.b);this.sw.push(s[i]);});this.idx.push(base,base+1,base+2,base,base+2,base+3);}
  }
  geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('sway',new THREE.Float32BufferAttribute(this.sw,1));g.setIndex(this.idx);g.computeBoundingSphere();return g;}
}
/** 摆动材质：每个网格一份（不让道具合批把 sway 属性合掉），time 由房间的逐帧动画推进。 */
function swayMaterial(k:V2Kit,amp:number,speed:number){
  const time={value:0},m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{shader.uniforms.swayTime=time;shader.vertexShader='attribute float sway;uniform float swayTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    `#include <begin_vertex>\nvec4 swayWorld=modelMatrix*vec4(position,1.0);float swayPhase=swayTime*${speed.toFixed(3)}+swayWorld.x*.35+swayWorld.z*.27;\ntransformed.x+=sin(swayPhase)*sway*${amp.toFixed(3)};transformed.z+=cos(swayPhase*.83+1.7)*sway*${(amp*.7).toFixed(3)};`);};
  m.customProgramCacheKey=()=>'garden-sway-'+amp+'-'+speed;k.owned.push(m);return {material:m,time};
}
const swayMesh=(k:V2Kit,b:SwayBoxes,amp:number,speed:number,name:string)=>{const {material,time}=swayMaterial(k,amp,speed),m=new THREE.Mesh(b.geometry(),material);m.name=name;m.castShadow=true;m.receiveShadow=true;m.renderOrder=1;m.userData.animate=(now:number)=>{time.value=now/1000;};return m;};
const flatMesh=(k:V2Kit,b:ColorBoxes,name:string,cast=true)=>{const m=new THREE.Mesh(b.geometry(),k.flat('#ffffff',{vertex:true}));m.name=name;m.castShadow=cast;m.receiveShadow=true;return m;};

/** 两点之间一串小方块（树枝、树干），粗 t（半宽） */
function limb(b:ColorBoxes,a:THREE.Vector3,c:THREE.Vector3,t:number,col:THREE.Color,dark:THREE.Color){const n=Math.max(2,Math.ceil(a.distanceTo(c)/(t*2.4)));
  for(let i=0;i<n;i++){const p=a.clone().lerp(c,i/n),q=a.clone().lerp(c,(i+1)/n);b.add(Math.min(p.x,q.x)-t,Math.min(p.y,q.y)-t*.6,Math.min(p.z,q.z)-t,Math.max(p.x,q.x)+t,Math.max(p.y,q.y)+t*.6,Math.max(p.z,q.z)+t,col,dark);}}
/**
 * 垂柳：根部 (x, y, z)，lean 是树干往哪边倾（朝水面），s 是整体大小（1 ≈ 树高 7 米、冠幅 6 米）。
 * 树形：干斜着长、越往上越往水面那边弯；三四根主枝斜着往上撑（不是一根平伸出去的“T”），每根主枝梢头分出两根往外拱、往下弯的细枝；
 * 树冠是细枝上一层稀疏的叶，柳丝从细枝和主枝外半段一路垂下来，外圈长、里圈短，越往下越细、颜色越浅。
 */
export function weepingWillow(k:V2Kit,x:number,y:number,z:number,lean:[number,number],s=1,seed=1){
  const g=new THREE.Group();g.name='garden-willow';const r=rng(seed),bark=new ColorBoxes(),leaves=new SwayBoxes();
  const barkC=[C('#4a3b2e'),C('#57463a'),C('#3c3027')],dark=C('#2f261f');
  const lv=new THREE.Vector3(lean[0],0,lean[1]).normalize();
  let p=new THREE.Vector3(x,y,z),w=.2*s;
  for(let i=0;i<4;i++){const t=(i+1)/4,q=p.clone().add(new THREE.Vector3(lv.x*.34*s*(.5+t),.66*s,lv.z*.34*s*(.5+t)));limb(bark,p,q,w,barkC[i%3],dark);p=q;w*=.86;}
  const fork=p.clone(),anchors:Array<{p:THREE.Vector3;out:THREE.Vector3;outer:boolean}>=[];
  const nl=3+Math.floor(r()*2),base=Math.atan2(lv.z,lv.x);
  for(let i=0;i<nl;i++){const az=base+(i/(nl-1)-.5)*2.9+(r()-.5)*.35,L=(1.7+r()*.7)*s,out=new THREE.Vector3(Math.cos(az),0,Math.sin(az));
    let a=fork.clone(),t=.11*s;
    for(let j=0;j<3;j++){const d=new THREE.Vector3(out.x,1.05-j*.42,out.z).normalize(),b=a.clone().addScaledVector(d,L/3);limb(bark,a,b,t,barkC[j%3],dark);a=b;t*=.72;if(j>0)anchors.push({p:a.clone(),out,outer:false});}
    for(const side of [-1,1]){const az2=az+side*(.45+r()*.25);let b=a.clone();
      for(let j=0;j<4;j++){const d=new THREE.Vector3(Math.cos(az2),.5-j*.42,Math.sin(az2)).normalize(),c=b.clone().addScaledVector(d,(.5+r()*.2)*s);limb(bark,b,c,.032*s,barkC[2],dark);b=c;anchors.push({p:b.clone(),out:new THREE.Vector3(Math.cos(az2),0,Math.sin(az2)),outer:j>=1});}}}
  const greens=['#8aa756','#9cb963','#7a9748','#adc672','#6e8a40'].map(C),pale=C('#c2d289');
  // 树冠：细枝周围一层稀疏的小叶片（透光），不是一整团
  for(const a of anchors)for(let j=0;j<9;j++){const o=new THREE.Vector3((r()-.5)*.7,(r()-.25)*.35,(r()-.5)*.7).multiplyScalar(s),sz=(.05+r()*.07)*s,c=greens[Math.floor(r()*5)],q=a.p.clone().add(o);
    leaves.add(q.x-sz,q.y-sz*.5,q.z-sz,q.x+sz,q.y+sz*.5,q.z+sz,c,c.clone().multiplyScalar(.8),.05,.08);}
  // 柳丝：外圈的长（垂到离水面二三十厘米）、里圈的短；先顺着枝往外拱一点再垂下；一缕是连着的细条，叶子大小不一、错落地贴在两侧
  const n=Math.round(72*s);
  for(let i=0;i<n;i++){const a=anchors[Math.floor(r()*anchors.length)],L=(a.outer?1.6+Math.pow(r(),.6)*3:.6+r()*1.2)*s,seg=.22*s,c0=greens[Math.floor(r()*5)];
    let cur=a.p.clone().add(new THREE.Vector3((r()-.5)*.25*s,-.03*s,(r()-.5)*.25*s));
    for(let j=0;j*seg<L;j++){const f=j*seg/L,arch=j<2?.06*s:0,next=cur.clone().add(new THREE.Vector3(a.out.x*arch+(r()-.5)*.02*s,-seg,a.out.z*arch+(r()-.5)*.02*s)),s0=Math.min(1,j*seg/3),s1=Math.min(1,(j+1)*seg/3),
      c=c0.clone().lerp(pale,f*.45),t=(.016-.008*f)*s;
      leaves.add(Math.min(cur.x,next.x)-t,next.y,Math.min(cur.z,next.z)-t,Math.max(cur.x,next.x)+t,cur.y,Math.max(cur.z,next.z)+t,c,c.clone().multiplyScalar(.84),s1,s0,false);
      if(r()<.62){const side=r()<.5?1:-1,ls=(.018+r()*.016)*s*(1-f*.4),lx=a.out.z*side*.026*s,lz=-a.out.x*side*.026*s,ly=next.y+seg*r();leaves.add(next.x+lx-ls,ly-ls*1.8,next.z+lz-ls,next.x+lx+ls,ly+ls*1.8,next.z+lz+ls,c,c.clone().multiplyScalar(.86),s1,s1);}
      cur=next;if(cur.y<WATER+.3)break;}}
  g.add(flatMesh(k,bark,'willow-bark'),swayMesh(k,leaves,.07*s,.9,'willow-leaves'));
  return g;
}
const PALETTES={
  zelkova:['#5d7a3a','#6b8743','#4f6a32','#7a9550'],camphor:['#4d6b3b','#5a7a45','#405c33','#66844e'],elm:['#5f7d41','#6d8a4a','#526d38','#7c9656'],
  maple:['#8e3b2e','#a2493a','#7a3127','#b05a45'],osmanthus:['#3f5a33','#4b683b','#35502c','#57744a'],
};
/**
 * 阔叶大树（榉、香樟、朴、鸡爪槭、桂）：一根略斜的干，几根主枝撑到几团树冠；树冠是一格一格的叶块（cell 米），
 * 几个椭球叠成的团，团与团之间、团里面都留空洞，阳光从洞里漏下来就是地上、墙上的斑驳光影。只出外壳的叶块，里面实心的不画。
 */
export function canopyTree(k:V2Kit,x:number,y:number,z:number,o:{h:number;spread:number;lean?:[number,number];palette:keyof typeof PALETTES;cell?:number},seed=1){
  const g=new THREE.Group();g.name='garden-tree-'+o.palette;const r=rng(seed),n=valueNoise(seed*7+3),bark=new ColorBoxes(),leaves=new SwayBoxes();
  const cell=o.cell??.45,barkC=[C('#4b3f35'),C('#57493d'),C('#3f352c')],dark=C('#2e2721'),pal=PALETTES[o.palette].map(C);
  const lean=new THREE.Vector3(o.lean?.[0]??0,0,o.lean?.[1]??0);
  const fork=new THREE.Vector3(x+lean.x*o.h*.12,y+o.h*.42,z+lean.z*o.h*.12);limb(bark,new THREE.Vector3(x,y,z),fork,Math.max(.12,o.h*.022),barkC[0],dark);
  const clumps:Array<{c:THREE.Vector3;rx:number;ry:number}>=[];const nc=4+Math.floor(r()*3);
  for(let i=0;i<nc;i++){const a=i/nc*Math.PI*2+r()*.8,d=(i===0?0:.18+r()*.2)*o.spread,c=new THREE.Vector3(fork.x+lean.x*o.h*.18+Math.cos(a)*d,y+o.h*(i===0?.82:.6+r()*.22),fork.z+lean.z*o.h*.18+Math.sin(a)*d);
    clumps.push({c,rx:o.spread*(.2+r()*.1),ry:o.h*(.13+r()*.06)});limb(bark,fork,c.clone().add(new THREE.Vector3(0,-o.h*.08,0)),Math.max(.06,o.h*.012),barkC[i%3],dark);}
  const inside=(px:number,py:number,pz:number)=>{for(const q of clumps){const d=((px-q.c.x)/q.rx)**2+((py-q.c.y)/q.ry)**2+((pz-q.c.z)/q.rx)**2;if(d<1&&n(px*.6+py*.3,pz*.6-py*.2)>.3+d*.25)return true;}return false;};
  const lo=clumps.reduce((m,q)=>Math.min(m,q.c.y-q.ry),Infinity),hi=clumps.reduce((m,q)=>Math.max(m,q.c.y+q.ry),-Infinity),rx=o.spread*.75;
  for(let px=-rx;px<=rx;px+=cell)for(let pz=-rx;pz<=rx;pz+=cell)for(let py=lo;py<=hi;py+=cell){const wx=fork.x+px,wz=fork.z+pz;if(!inside(wx,py,wz))continue;
    if(inside(wx+cell,py,wz)&&inside(wx-cell,py,wz)&&inside(wx,py+cell,wz)&&inside(wx,py-cell,wz)&&inside(wx,py,wz+cell)&&inside(wx,py,wz-cell))continue;
    const c=pal[Math.floor(r()*pal.length)],under=!inside(wx,py-cell,wz),h=cell/2,sw=Math.min(1,(py-lo)/(hi-lo+.01))*.6;
    leaves.add(wx-h,py-h,wz-h,wx+h,py+h,wz+h,c,c.clone().multiplyScalar(under?.66:.82),sw*.6,sw);}
  g.add(flatMesh(k,bark,'tree-bark'),swayMesh(k,leaves,.035,.55,'tree-leaves'));
  return g;
}
/** 竹丛：中心 (x, z)、地面高 y，count 根竹竿，高 h0–h1。 */
export function bambooGrove(k:V2Kit,x:number,y:number,z:number,radius:number,count:number,h0:number,h1:number,seed=1){
  const g=new THREE.Group();g.name='garden-bamboo';const r=rng(seed),b=new SwayBoxes();
  const culm=[C('#6f9a4a'),C('#7fa957'),C('#5f8a3f')],node=C('#4f6f33'),leaf=['#6a9447','#7ea653','#57813a','#8db35d','#4d7735'].map(C);
  for(let i=0;i<count;i++){const a=r()*Math.PI*2,d=Math.sqrt(r())*radius,cx=x+Math.cos(a)*d,cz=z+Math.sin(a)*d,h=h0+r()*(h1-h0),w=.03+r()*.018,c=culm[i%3];
    for(let yy=0;yy<h;yy+=.46){const s0=Math.pow(yy/h,1.6),s1=Math.pow(Math.min(h,yy+.46)/h,1.6);b.add(cx-w,y+yy,cz-w,cx+w,y+Math.min(h,yy+.46)-.02,cz+w,c,c.clone().multiplyScalar(.85),s0,s1,false);b.add(cx-w-.006,y+yy+.44,cz-w-.006,cx+w+.006,y+yy+.465,cz+w+.006,node,node,s1,s1,false);}
    // 叶从中段往外长。梢头是错开的厚块，不在竿上叠成加号，侧面才是一团而不是一根竿。
    const tufts=5+Math.floor(r()*3);
    for(let j=0;j<tufts;j++){const t=.26+r()*.7,yy=y+h*t,ang=r()*Math.PI*2,reach=.34+r()*.48,ox=Math.cos(ang)*reach,oz=Math.sin(ang)*reach,s=Math.pow(Math.max(.05,t),1.1);
      const c2=leaf[Math.floor(r()*leaf.length)],dark=c2.clone().multiplyScalar(.8),mid=c2.clone().multiplyScalar(.92);
      const px=cx+ox,pz=cz+oz,py=yy-.06-r()*.16,L=.18+r()*.08,W=.08+r()*.03,Th=.06+r()*.02,mx=cx+ox*.55,mz=cz+oz*.55;
      b.add(mx-.02,yy-.03,mz-.02,mx+.02,yy+.04,mz+.02,node,node,s*.4,s);
      if(Math.abs(Math.cos(ang))>Math.abs(Math.sin(ang))){b.add(px-L,py-Th,pz-W,px+L*.25,py+Th,pz+W,c2,dark,s,s);b.add(px-W*.3,py+.04,pz-L*.35,px+W*1.4,py+Th*2.4,pz+L*.15,dark,mid,s,s);b.add(px-W*.9,py-Th*2.3,pz-L*.1,px+W*.4,py-Th*.15,pz+L*.75,mid,dark,s,s);}
      else{b.add(px-W,py-Th,pz-L,px+W,py+Th,pz+L*.25,c2,dark,s,s);b.add(px-L*.35,py+.04,pz-W*.3,px+L*.15,py+Th*2.4,pz+W*1.4,dark,mid,s,s);b.add(px-L*.1,py-Th*2.3,pz-W*.9,px+L*.75,py-Th*.15,pz+W*.4,mid,dark,s,s);}}}
  g.add(swayMesh(k,b,.09,1.25,'bamboo'));
  return g;
}
/** 一片荷塘：贴水的圆叶（按像素圆拼的几块薄板，边缘略翘）、几片出水的叶子、几个花苞和一两朵开着的花。 */
export function lotusPatch(k:V2Kit,x0:number,z0:number,x1:number,z1:number,count:number,seed=1){
  const r=rng(seed),b=new ColorBoxes(),y=WATER+.012,leaf=[C('#4f7d3c'),C('#5d8c45'),C('#456f35')],edge=C('#3a5f2d');
  const disc=(cx:number,cy:number,cz:number,rad:number,c:THREE.Color)=>{b.add(cx-rad,cy,cz-rad*.42,cx+rad,cy+.02,cz+rad*.42,c,edge);b.add(cx-rad*.42,cy,cz-rad,cx+rad*.42,cy+.02,cz+rad,c,edge);b.add(cx-rad*.78,cy+.004,cz-rad*.78,cx+rad*.78,cy+.024,cz+rad*.78,c,edge);b.add(cx-rad*.12,cy+.024,cz-rad*.12,cx+rad*.12,cy+.03,cz+rad*.12,c.clone().multiplyScalar(1.12),edge);};
  for(let i=0;i<count;i++){const cx=x0+r()*(x1-x0),cz=z0+r()*(z1-z0),rad=.22+r()*.24,c=leaf[i%3];
    if(r()<.22){const h=.35+r()*.6;b.add(cx-.012,y,cz-.012,cx+.012,y+h,cz+.012,C('#5f7f43'),C('#4f6f38'));disc(cx,y+h,cz,rad*1.1,c);continue;}disc(cx,y,cz,rad,c);}
  for(let i=0;i<Math.max(1,Math.round(count/9));i++){const cx=x0+r()*(x1-x0),cz=z0+r()*(z1-z0),h=.5+r()*.5;b.add(cx-.012,y,cz-.012,cx+.012,y+h,cz+.012,C('#5f7f43'),C('#4f6f38'));
    if(i%3===0){for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const)b.add(cx+dx*.05-.045,y+h,cz+dz*.05-.045,cx+dx*.05+.045,y+h+.1,cz+dz*.05+.045,C('#f4d2da'),C('#e6aebd'));b.add(cx-.035,y+h+.02,cz-.035,cx+.035,y+h+.07,cz+.035,C('#e8c45a'),C('#c9a23f'));}
    else{b.add(cx-.04,y+h,cz-.04,cx+.04,y+h+.13,cz+.04,C('#f0c4cf'),C('#e2a3b4'));b.add(cx-.022,y+h+.13,cz-.022,cx+.022,y+h+.18,cz+.022,C('#e79aae'),C('#d5869c'));}}
  return flatMesh(k,b,'garden-lotus',false);
}
/** 菖蒲 / 芦苇：一簇细长的叶，根在水边。 */
export function reeds(k:V2Kit,points:Array<[number,number]>,y:number,seed=1){
  const r=rng(seed),b=new SwayBoxes(),cs=['#6f8f45','#86a456','#9c9a5c','#5f7d3c'].map(C);
  for(const [x,z] of points)for(let j=0;j<9;j++){const px=x+(r()-.5)*.5,pz=z+(r()-.5)*.4,h=.6+r()*.9,c=cs[Math.floor(r()*4)];b.add(px-.018,y,pz-.018,px+.018,y+h,pz+.018,c,c.clone().multiplyScalar(.85),0,1);}
  return swayMesh(k,b,.06,1.6,'garden-reeds');
}
/** 太湖石：几层错开的灰白方块，层与层之间、块与块之间留洞（透、漏、瘦、皱的意思）。 */
export function taihuRock(b:ColorBoxes,x:number,y:number,z:number,s:number,seed=1){
  // 一层层叠上去：每层两三块错开的灰白石块，块与块之间留缝、偶尔整层只剩一边（透、漏），中段收细（瘦），顶上一块往外挑（皱）
  const r=rng(seed),cs=[C('#cbc8c0'),C('#bbb8af'),C('#d6d3cb'),C('#c2c0b9')],dark=C('#9c9a93');let yy=y,w=s*.85;const layers=4+Math.floor(r()*3);
  for(let l=0;l<layers;l++){const h=s*(.18+r()*.2),n=2+Math.floor(r()*2),waist=l===Math.floor(layers/2)?.62:1;
    for(let i=0;i<n;i++){if(l>0&&r()<.18)continue;const ox=(r()-.5)*w*.8,oz=(r()-.5)*w*.6,bw=w*(.28+r()*.32)*waist,bd=w*(.25+r()*.3)*waist,c=cs[Math.floor(r()*4)];b.add(x+ox-bw/2,yy,z+oz-bd/2,x+ox+bw/2,yy+h,z+oz+bd/2,c,dark);
      if(r()<.4){const px=x+ox+(r()<.5?-1:1)*bw*.5,pz=z+oz,ps=bw*.28;b.add(px-ps,yy+h*.2,pz-ps,px+ps,yy+h*.75,pz+ps,cs[(i+1)%4],dark);}}
    yy+=h*(.82+r()*.15);w*=.8+r()*.22;}
  const ox=(r()-.5)*w;b.add(x+ox-w*.55,yy,z-w*.3,x+ox+w*.45,yy+s*.14,z+w*.3,cs[2],dark);
}
/** 一堆太湖石（几块大小不一，放成一组），返回网格 */
export function rockery(k:V2Kit,rocks:Array<[number,number,number,number]>,seed=1){const b=new ColorBoxes();rocks.forEach(([x,y,z,s],i)=>taihuRock(b,x,y,z,s,seed+i*7));return flatMesh(k,b,'garden-rocks');}
/** 芭蕉：一根假茎，七八片大叶子往外往上舒展（叶面一道中脉）。 */
export function banana(k:V2Kit,x:number,y:number,z:number,seed=1){
  const g=new THREE.Group();g.name='garden-banana';const r=rng(seed),stem=k.flat('#6f8d42'),leafM=k.flat('#5f8f3e',{side:THREE.DoubleSide}),rib=k.flat('#a8c070');
  k.box(g,.2,1.4,.2,stem,x,y+.7,z);k.box(g,.26,.3,.26,k.flat('#7d6a45'),x,y+.15,z);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2+r()*.4,tilt=.5+r()*.5,L=1.3+r()*.4,leaf=new THREE.Group();leaf.position.set(x,y+1.1+r()*.4,z);leaf.rotation.y=-a;g.add(leaf);
    const l=k.box(leaf,L,.02,.42,leafM,L/2,0,0);l.rotation.z=tilt;l.position.y=Math.sin(tilt)*L/2;l.position.x=Math.cos(tilt)*L/2;const m=k.box(leaf,L,.035,.04,rib,L/2,0,0);m.rotation.z=tilt;m.position.copy(l.position).add(new THREE.Vector3(0,.012,0));}
  return g;
}
/**
 * 黑松：之字形的干（往一侧探），三四处分枝，枝梢一片片平展的松针团（扁的椭圆叶块，上面亮、下面暗），层层错开。
 * 假山、小岛上用；s 是整体大小（1 ≈ 高 3.5 米）。
 */
export function pine(k:V2Kit,x:number,y:number,z:number,s=1,seed=1){
  const r=rng(seed),bark=new ColorBoxes(),needles=new ColorBoxes(),barkC=[C('#4a3a2c'),C('#3d3024')],dark=C('#2a211a'),g2=[C('#34523a'),C('#3f6044'),C('#2c4632')];
  let p=new THREE.Vector3(x,y,z);const dir=r()*Math.PI*2;
  const pads:THREE.Vector3[]=[];
  for(let i=0;i<5;i++){const q=p.clone().add(new THREE.Vector3(Math.cos(dir)*(i%2?.32:.12)*s,.62*s,Math.sin(dir)*(i%2?.32:.12)*s));limb(bark,p,q,(.13-i*.018)*s,barkC[i%2],dark);p=q;
    if(i>=1){const a=dir+(i%2?1.6:-1.6)+(r()-.5)*.6,L=(.9+r()*.6)*s*(1-i*.1),e=p.clone().add(new THREE.Vector3(Math.cos(a)*L,.12*s,Math.sin(a)*L));limb(bark,p,e,.045*s,barkC[1],dark);pads.push(e);}}
  pads.push(p.clone().add(new THREE.Vector3(0,.15*s,0)));
  for(const c of pads){const w=(.55+r()*.35)*s,d=w*(.7+r()*.3),cell=.14*s;for(let px=-w;px<=w;px+=cell)for(let pz=-d;pz<=d;pz+=cell){const e=(px/w)**2+(pz/d)**2;if(e>1||r()<.12)continue;
    const c2=g2[Math.floor(r()*3)],top=c.y+(1-e)*.16*s;needles.add(c.x+px-cell/2,top-.1*s,c.z+pz-cell/2,c.x+px+cell/2,top,c.z+pz+cell/2,c2,c2.clone().multiplyScalar(.7));}}
  const g=new THREE.Group();g.name='garden-pine';g.add(flatMesh(k,bark,'pine-bark'),flatMesh(k,needles,'pine-needles'));return g;
}
/** 矮灌木（杜鹃、箬竹、沿墙的绿篱）：贴地的一团圆叶块，深绿。spots 是 [x, 地面 y, z, 半径] */
export function shrubs(k:V2Kit,spots:Array<[number,number,number,number]>,seed=1){
  const r=rng(seed),b=new ColorBoxes(),cs=['#3e5b33','#4a693b','#35502c','#55744a'].map(C);
  for(const [x,y,z,rad] of spots){const cell=.22;for(let px=-rad;px<=rad;px+=cell)for(let pz=-rad;pz<=rad;pz+=cell){const e=(px*px+pz*pz)/(rad*rad);if(e>1||r()<.1)continue;const h=(1-e)*rad*.7+.12,c=cs[Math.floor(r()*4)];b.add(x+px-cell/2,y,z+pz-cell/2,x+px+cell/2,y+h,z+pz+cell/2,c,c.clone().multiplyScalar(.72));}}
  return flatMesh(k,b,'garden-shrubs');
}
/** 石缝里的蕨：几片往外拱的叶（out 是朝外的方向） */
export function ferns(k:V2Kit,spots:Array<{x:number;y:number;z:number;out:[number,number]}>,seed=1){
  const r=rng(seed),b=new SwayBoxes(),cs=['#4d7a3a','#5f8c45','#41692f'].map(C);
  for(const sp of spots)for(let i=0;i<5;i++){const a=Math.atan2(sp.out[1],sp.out[0])+(r()-.5)*2.4,L=.32+r()*.3,c=cs[Math.floor(r()*3)];
    for(let j=0;j<4;j++){const t0=j/4,t1=(j+1)/4,x0=sp.x+Math.cos(a)*L*t0,z0=sp.z+Math.sin(a)*L*t0,y0=sp.y+Math.sin(t0*Math.PI)*.18*L+t0*.05,x1=sp.x+Math.cos(a)*L*t1,z1=sp.z+Math.sin(a)*L*t1,y1=sp.y+Math.sin(t1*Math.PI)*.18*L+t1*.05,w=.03*(1-t0*.5);
      b.add(Math.min(x0,x1)-w,Math.min(y0,y1),Math.min(z0,z1)-w,Math.max(x0,x1)+w,Math.max(y0,y1)+.012,Math.max(z0,z1)+w,c,c.clone().multiplyScalar(.8),t0,t1);}}
  return swayMesh(k,b,.03,1.4,'garden-ferns');
}
