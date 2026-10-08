import * as THREE from 'three';
import {mesh,rbox} from './geometry';
import {shade,seeded} from '../style';
import {blockTextures,type BlockTextureSource} from './blockKit';
/**
 * 照二维场景画法做的家具：圆润厚实的块面、平涂颜色（不用木纹和金属反光），
 * 颜色由房间色板给，同一套零件在不同房间换色使用。尺寸单位是米，原点在物体底面中心。
 */
export interface Kit {
  mat(color:string,opts?:{rough?:number;emissive?:string;glow?:number;side?:THREE.Side}):THREE.MeshStandardMaterial;
  /** 往 parent 上加一个圆角方块（中心坐标） */
  box(parent:THREE.Object3D,w:number,h:number,d:number,color:string|THREE.Material,x?:number,y?:number,z?:number,r?:number,shadow?:boolean):THREE.Mesh;
  cyl(parent:THREE.Object3D,rTop:number,rBottom:number,h:number,color:string|THREE.Material,x?:number,y?:number,z?:number,seg?:number,shadow?:boolean):THREE.Mesh;
  /** 像素贴图材质：draw 在 w×h 的小画布上作画，近看是清楚的像素格 */
  pixels(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void,opts?:{glow?:number;transparent?:boolean}):THREE.MeshStandardMaterial;
  /** 用方块图集里的贴图包一个方块（侧面、顶面、底面各用哪张贴图，比如原木的树皮和年轮），贴图按每米 16 像素平铺 */
  block(parent:THREE.Object3D,w:number,h:number,d:number,faces:{side:string;top?:string;bottom?:string;tint?:string;glow?:number},x?:number,y?:number,z?:number):THREE.Mesh;
  /** 原版的画（painting/ 下的贴图，比如 sunset、sea），云杉木框，贴墙朝 +z */
  painting(parent:THREE.Object3D,name:string,w:number,h:number,x?:number,y?:number,z?:number,yaw?:number,frame?:string):THREE.Object3D;
  /** 同上，圆柱（圆桌面、树桩、桌腿） */
  blockCyl(parent:THREE.Object3D,rTop:number,rBottom:number,h:number,faces:{side:string;top?:string;bottom?:string;tint?:string;glow?:number},x?:number,y?:number,z?:number,seg?:number):THREE.Mesh;
  owned:Array<THREE.Material|THREE.Texture>;
}
/** 道具工具箱：平涂的圆角块、像素贴图，以及从方块图集取贴图的方块件（src 是方块图集和原版贴图）。 */
export function createKit(src:BlockTextureSource):Kit {
  const owned:Array<THREE.Material|THREE.Texture>=[],cache=new Map<string,THREE.MeshStandardMaterial>();
  const kit:Kit={owned,block:null!,blockCyl:null!,painting:null!,
    mat(color,opts={}){const k=[color,opts.rough??.95,opts.emissive??'',opts.glow??0,opts.side??THREE.FrontSide].join('|');let m=cache.get(k);
      if(!m){m=new THREE.MeshStandardMaterial({color,roughness:opts.rough??.95,metalness:0,emissive:opts.emissive??'#000000',emissiveIntensity:opts.glow??0,side:opts.side??THREE.FrontSide});cache.set(k,m);owned.push(m);}return m;},
    box(parent,w,h,d,color,x=0,y=0,z=0,r=.03,shadow=true){const m=mesh(rbox(w,h,d,r),typeof color==='string'?kit.mat(color):color,x,y,z,shadow);parent.add(m);return m;},
    cyl(parent,rt,rb,h,color,x=0,y=0,z=0,seg=20,shadow=true){const m=mesh(new THREE.CylinderGeometry(rt,rb,h,seg),typeof color==='string'?kit.mat(color):color,x,y,z,shadow);parent.add(m);return m;},
    pixels(w,h,draw,opts={}){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;draw(c);
      const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;owned.push(t);
      const m=new THREE.MeshStandardMaterial({map:t,roughness:.95,metalness:0,transparent:opts.transparent??false,alphaTest:opts.transparent?.1:0,emissive:opts.glow?'#ffffff':'#000000',emissiveMap:opts.glow?t:null,emissiveIntensity:opts.glow??0});owned.push(m);return m;},
  };
  Object.assign(kit,blockTextures(kit.mat,src,x=>{owned.push(x);return x;}));
  return kit;
}
const at=(g:THREE.Object3D,x:number,y:number,z:number,yaw=0)=>{g.position.set(x,y,z);g.rotation.y=yaw;return g;};

/** 圆鼓鼓的扶手椅（二维圆桌会议室那种）：布面座垫、靠背和扶手，木色扶手顶和短腿。朝 +z 坐。 */
export function armchair(k:Kit,fabric:string,wood:string){
  const g=new THREE.Group(),dark=shade(fabric,.82);
  for(const x of [-1,1])for(const z of [-1,1])k.box(g,.09,.16,.09,shade(wood,.8),x*.32,.08,z*.28,.02);
  k.box(g,.82,.2,.74,dark,0,.26,0,.06);k.box(g,.62,.14,.62,fabric,0,.43,.03,.06);
  k.box(g,.82,.58,.18,fabric,0,.65,-.3,.07);k.box(g,.82,.06,.18,shade(fabric,1.12),0,.92,-.3,.03);
  for(const x of [-1,1]){k.box(g,.14,.34,.7,fabric,x*.36,.5,0,.05);k.box(g,.15,.05,.72,wood,x*.36,.68,0,.02);}
  return g;
}
/** 贴方块贴图的扶手椅：羊毛座垫、靠背、扶手，木板扶手顶和木腿。朝 +z 坐。wool、wood 是方块名（如 blue_wool、oak_planks），tint 给布料乘一层颜色（白羊毛加 tint 就是任意色的布）。 */
export function blockArmchair(k:Kit,wool:string,wood:string,tint?:string){
  const g=new THREE.Group(),W={side:'block/'+wool,tint},P={side:'block/'+wood};
  for(const x of [-1,1])for(const z of [-1,1])k.block(g,.09,.16,.09,P,x*.32,.08,z*.28);
  k.block(g,.82,.2,.74,W,0,.26,0);k.block(g,.62,.14,.62,W,0,.43,.03);k.block(g,.82,.58,.18,W,0,.65,-.3);k.block(g,.84,.06,.2,P,0,.97,-.3);
  for(const x of [-1,1]){k.block(g,.14,.34,.7,W,x*.36,.5,0);k.block(g,.16,.05,.72,P,x*.36,.69,0);}
  return g;
}
/** 圆地毯：羊毛贴图乘上颜色，外面一圈细边（和圆桌同形，把桌椅圈成一组）。原点在地面中心。 */
export function roundRug(k:Kit,radius:number,field:string,edge:string,border=.14,wool='block/white_wool'){
  const g=new THREE.Group();k.blockCyl(g,radius,radius,.02,{side:wool,tint:edge},0,.01,0,48);k.blockCyl(g,radius-border,radius-border,.02,{side:wool,tint:field},0,.02,0,48);
  g.traverse(o=>{o.castShadow=false;});return g;
}
/** 吊灯：一根深色细链从天花板垂下，灯罩上下是黑石盖，中间一块会亮的萤石。原点在灯罩中心，ceiling 是天花板离灯罩中心的高度。 */
export function pendantLantern(k:Kit,ceiling:number,size=.36,metal='block/polished_blackstone',glow='block/glowstone'){
  const g=new THREE.Group(),dark={side:metal};
  k.block(g,.05,ceiling-size/2,.05,dark,0,size/2+(ceiling-size/2)/2,0);
  k.block(g,size*1.25,size*.18,size*1.25,dark,0,size*.5,0);k.block(g,size,size*.8,size,{side:glow,glow:1.6},0,0,0);k.block(g,size*.8,size*.14,size*.8,dark,0,-size*.47,0);
  return g;
}
/** 木线条：墙顶的檐线、墙脚的踢脚线、窗框，用木板贴图（纹路是横的）。沿 x 方向 length 长。 */
export function trim(k:Kit,length:number,height:number,depth=.06,wood='block/oak_planks'){
  const g=new THREE.Group();k.block(g,length,height,depth,{side:wood});return g;
}
/** 桌心的盆花：陶土盆、一团实心的苔藓色叶子、几朵小花（盆、叶、花用哪种贴图可以换）。 */
export function centerpiece(k:Kit,size=1,pot='block/terracotta',leaves='block/moss_block',flower='block/pink_wool'){
  const g=new THREE.Group();k.block(g,.3*size,.22*size,.3*size,{side:pot},0,.11*size,0);
  k.block(g,.42*size,.26*size,.42*size,{side:leaves},0,.33*size,0);k.block(g,.28*size,.16*size,.28*size,{side:leaves},.02*size,.5*size,-.02*size);
  for(const [x,y,z] of [[.14,.47,.1],[-.12,.44,-.13],[.04,.6,.06],[-.16,.4,.15],[.17,.4,-.14]] as const)k.block(g,.07*size,.07*size,.07*size,{side:flower},x*size,y*size,z*size);
  return g;
}
/** 贴方块贴图的圆桌：木板桌面、原木桌腿和十字底座。 */
export function blockRoundTable(k:Kit,radius:number,height:number,top:string,leg:string){
  const g=new THREE.Group();k.blockCyl(g,radius,radius,.14,{side:'block/'+top},0,height-.07,0,40);
  k.blockCyl(g,.2,.24,height-.14,{side:'block/'+leg,top:'block/'+leg+'_top'},0,(height-.14)/2,0,12);
  for(const yaw of [0,Math.PI/2])k.block(g,radius*1.1,.08,.18,{side:'block/'+top},0,.04,0).rotation.y=yaw;
  return g;
}
/** 贴方块贴图的方桌：木板桌面、四条腿。length 沿 x，depth 沿 z。 */
export function blockDesk(k:Kit,length:number,depth:number,height:number,top='spruce_planks',leg='stripped_spruce_log'){
  const g=new THREE.Group();k.block(g,length,.1,depth,{side:'block/'+top},0,height-.05,0);
  for(const x of [-1,1])for(const z of [-1,1])k.block(g,.1,height-.1,.1,{side:'block/'+leg,top:'block/'+leg+(leg.endsWith('_log')?'_top':'')},x*(length/2-.08),(height-.1)/2,z*(depth/2-.08));
  return g;
}
/** 贴方块贴图的课椅：羊毛座面和靠背，深色铁框。朝 +z 坐。 */
export function blockSeat(k:Kit,wool:string,frame='polished_blackstone'){
  const g=new THREE.Group(),F={side:'block/'+frame},W={side:'block/'+wool};
  for(const x of [-1,1]){k.block(g,.05,.46,.05,F,x*.2,.23,.05);k.block(g,.05,.86,.05,F,x*.2,.43,-.2);}
  k.block(g,.5,.1,.46,W,0,.5,.02);k.block(g,.5,.46,.09,W,0,.86,-.2);return g;
}
/** 贴方块贴图的办公椅：羊毛座垫靠背、黑色底座和五爪脚。朝 +z 坐。 */
export function blockOfficeChair(k:Kit,wool:string,metal='polished_blackstone'){
  const g=new THREE.Group(),M={side:'block/'+metal},W={side:'block/'+wool};
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;k.block(g,.05,.04,.3,M,Math.sin(a)*.14,.05,Math.cos(a)*.14).rotation.y=a;}
  k.block(g,.05,.36,.05,M,0,.24,0);k.block(g,.5,.1,.48,W,0,.47,.02);k.block(g,.46,.5,.09,W,0,.8,-.21);return g;
}
/** 贴方块贴图的盆栽：陶土盆、泥土、杜鹃叶团（不用平涂的叶子）。size 是整体高度系数。 */
export function blockPlant(k:Kit,size=1,leaves='azalea_leaves',pot='terracotta',seed=1){
  const g=new THREE.Group(),r=seeded(seed),L={side:'block/'+leaves};k.block(g,.34*size,.3*size,.34*size,{side:'block/'+pot},0,.15*size,0);k.block(g,.28*size,.02,.28*size,{side:'block/rooted_dirt'},0,.3*size,0);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2+r()*.6,d=(.06+r()*.1)*size,s=(.22+r()*.12)*size;k.block(g,s,s*.8,s,L,Math.cos(a)*d,(.45+r()*.3)*size,Math.sin(a)*d).rotation.y=r();}
  k.block(g,.3*size,.26*size,.3*size,L,0,.78*size,0);return g;
}
/** 贴方块贴图的长凳：木框、羊毛坐垫和靠背。沿 x 方向 length 长，朝 +z 坐。 */
export function blockBench(k:Kit,length:number,wool:string,wood='spruce_planks'){
  const g=new THREE.Group(),P={side:'block/'+wood},W={side:'block/'+wool};
  for(const x of [-1,1])k.block(g,.1,.42,.5,P,x*(length/2-.08),.21,0);
  k.block(g,length,.08,.52,P,0,.42,0);k.block(g,length-.06,.12,.48,W,0,.52,.01);k.block(g,length-.06,.42,.12,W,0,.78,-.22);k.block(g,length,.06,.14,P,0,1,-.22);return g;
}
/** 白盆绿植：圆润的盆、两种绿的叶团。size 是整体高度系数（1 ≈ 0.8 米）。 */
export function plant(k:Kit,leaf:string,pot='#f4efe6',size=1,seed=1){
  const g=new THREE.Group(),r=seeded(seed),dark=shade(leaf,.72),light=shade(leaf,1.2);
  k.box(g,.34*size,.3*size,.34*size,pot,0,.15*size,0,.06*size);k.box(g,.38*size,.05*size,.38*size,shade(pot,.93),0,.3*size,0,.02*size);k.box(g,.28*size,.03*size,.28*size,'#6b4a35',0,.31*size,0,.01,false);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2+r()*.5,d=(.08+r()*.12)*size,h=(.42+r()*.34)*size,s=(.18+r()*.1)*size;
    const leafBox=k.box(g,s,s*.75,s,i%3===0?dark:i%3===1?leaf:light,Math.cos(a)*d,h,Math.sin(a)*d,s*.25);leafBox.rotation.set(r()*.6,a,r()*.4);}
  k.box(g,.26*size,.22*size,.26*size,leaf,0,.74*size,0,.07*size);
  return g;
}
/** 平板显示器：细边框、支架和底座，屏幕朝 +z。screen 是会亮的屏幕材质。 */
export function monitor(k:Kit,screen:THREE.Material,body='#3a3640'){const g=new THREE.Group();k.box(g,.26,.02,.18,body,0,.01,0,.006);k.box(g,.05,.26,.04,body,0,.14,-.03,.01);
  k.box(g,.64,.4,.04,body,0,.42,0,.014);k.box(g,.58,.34,.01,screen,0,.42,.022,.004,false);return g;}
export function keyboard(k:Kit,color='#e8e2d4'){const g=new THREE.Group();k.box(g,.5,.035,.17,color,0,.018,0,.008);for(let i=0;i<3;i++)k.box(g,.44,.006,.03,shade(color,.82),0,.038,-.05+i*.05,.002,false);return g;}
/** 一排竖着的彩色文件夹 */
export function binders(k:Kit,colors:string[],count=4){const g=new THREE.Group();for(let i=0;i<count;i++)k.box(g,.07,.3,.24,colors[i%colors.length],(i-(count-1)/2)*.08,.15,0,.008);return g;}
/** 打印机 / 复印机：米色机身、深色进纸口 */
export function printer(k:Kit,w=.6,h=.32,d=.5,body='#e9e1cf'){const g=new THREE.Group();k.box(g,w,h,d,body,0,h/2,0,.03);k.box(g,w*.7,.03,d*.6,'#5b5560',0,h+.01,0,.01,false);k.box(g,w*.6,.03,.12,'#fbfbf5',0,h*.6,d/2+.05,.01);return g;}
/** 马克杯、纸张这类桌面小物 */
export function mug(k:Kit,color:string){const g=new THREE.Group();k.cyl(g,.045,.04,.1,color,0,.05,0,10);k.cyl(g,.035,.035,.004,'#5a3b2a',0,.098,0,10,false);return g;}
export function paper(k:Kit,w=.21,d=.28,color='#fbfaf4'){const g=new THREE.Group();k.box(g,w,.01,d,color,0,.005,0,.002,false);return g;}
/** 黑板：木框、深绿板面、底下一条粉笔槽，板上几道淡粉笔印。宽 w、高 h，贴墙朝 +z。 */
export function chalkboard(k:Kit,w:number,h:number,frame:string,seed=1){
  const g=new THREE.Group(),r=seeded(seed);k.box(g,w+.14,h+.14,.06,frame,0,0,0,.015);
  const face=k.pixels(Math.round(w*16),Math.round(h*16),c=>{const W=c.canvas.width,H=c.canvas.height;c.fillStyle='#2f4a3c';c.fillRect(0,0,W,H);for(let i=0;i<W*H/14;i++){c.fillStyle=r()<.5?'#34503f':'#2a4336';c.fillRect(Math.floor(r()*W),Math.floor(r()*H),2,1);}
    c.fillStyle='rgba(235,240,230,.45)';for(let i=0;i<5;i++){const x=Math.floor(r()*(W-20))+4,y=Math.floor(r()*(H-8))+3;c.fillRect(x,y,8+Math.floor(r()*14),1);}c.fillStyle='rgba(255,230,140,.5)';c.fillRect(Math.floor(W*.15),Math.floor(H*.3),6,1);});
  g.add(mesh(new THREE.PlaneGeometry(w,h),face,0,0,.032,false));k.box(g,w,.05,.1,frame,0,-h/2-.06,.06,.01);k.box(g,.12,.025,.03,'#f6f3ea',w*.3,-h/2-.025,.07,.005,false);return g;
}
/** 播客话筒：三脚落地架、斜伸的悬臂、黑色话筒和防喷罩。话筒朝 +z。 */
export function micStand(k:Kit,metal='#2f2b36'){
  const g=new THREE.Group();for(let i=0;i<3;i++){const leg=k.box(g,.03,.03,.32,metal,Math.sin(i*2.1)*.12,.03,Math.cos(i*2.1)*.12,.01);leg.rotation.y=i*2.1;}
  k.box(g,.03,1.1,.03,metal,0,.58,0,.01);const arm=k.box(g,.025,.025,.6,metal,0,1.16,.22,.01);arm.rotation.x=-.35;
  k.box(g,.09,.16,.09,'#1f1c25',0,1.3,.47,.03);k.cyl(g,.09,.09,.02,'#5f6b85',0,1.3,.56,16,false).rotation.x=Math.PI/2;return g;
}
/** 落地灯：深色细杆、米黄灯罩，灯罩会亮。 */
export function floorLamp(k:Kit,shadeColor='#fbe6b0'){const g=new THREE.Group();k.cyl(g,.18,.2,.04,'#2f2b36',0,.02,0,16);k.cyl(g,.02,.02,1.55,'#2f2b36',0,.8,0,8);
  k.cyl(g,.18,.3,.34,k.mat(shadeColor,{emissive:'#ffd98a',glow:.9}),0,1.68,0,16,false);return g;}
/** 三角彩旗：两点之间垂一道弧线，等距挂一串小三角旗。直接用房间坐标。 */
export function bunting(k:Kit,a:[number,number,number],b:[number,number,number],count=14,sag=.3,colors=['#3d8bff','#f0c84a','#ff4d9a','#fff8ea','#3dba6e']){
  const g=new THREE.Group(),wire=k.mat('#6b5a5f'),pt=(t:number)=>new THREE.Vector3(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-sag*4*t*(1-t),a[2]+(b[2]-a[2])*t);
  for(let i=0,n=count*2;i<n;i++){const p0=pt(i/n),p1=pt((i+1)/n),m=new THREE.Mesh(new THREE.BoxGeometry(.018,.018,p0.distanceTo(p1)),wire);m.position.copy(p0).add(p1).multiplyScalar(.5);m.lookAt(p1);g.add(m);}
  const along=new THREE.Vector3(b[0]-a[0],0,b[2]-a[2]).normalize(),yaw=Math.atan2(along.x,along.z)-Math.PI/2;
  for(let i=0;i<count;i++){const t=(i+.5)/count,p=pt(t),c=colors[i%colors.length],w=.34,h=.42;
    const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.Float32BufferAttribute([-w/2,0,0,w/2,0,0,0,-h,0],3));tri.computeVertexNormals();
    const flag=new THREE.Mesh(tri,k.mat(c,{side:THREE.DoubleSide}));flag.position.copy(p);flag.rotation.y=yaw;flag.rotation.x=.08;g.add(flag);}
  return g;}
/** 挂钟：彩色外框、白表盘、刻度和两根指针（十点十分）。贴墙朝 +z。 */
export function wallClock(k:Kit,frame:string,radius=.32){const g=new THREE.Group();
  k.cyl(g,radius,radius,.08,frame,0,0,0,28).rotation.x=Math.PI/2;k.cyl(g,radius*.84,radius*.84,.02,'#fffaf0',0,0,.042,28,false).rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;k.box(g,.028,i%3?.035:.07,.008,'#3a3340',Math.sin(a)*radius*.66,Math.cos(a)*radius*.66,.055,.002,false).rotation.z=-a;}
  for(const [a,len] of [[(10+10/60)/12*Math.PI*2,radius*.42],[10/60*Math.PI*2,radius*.62]] as const)k.box(g,.03,len,.01,'#3a3340',Math.sin(a)*len/2,Math.cos(a)*len/2,.06,.004,false).rotation.z=-a;
  k.cyl(g,.03,.03,.02,'#e86f6f',0,0,.068,10,false).rotation.x=Math.PI/2;return g;}
/** 壁灯：小灯罩贴墙，朝 +z。 */
export function sconce(k:Kit,shadeColor='#fbe6b0'){const g=new THREE.Group();k.box(g,.12,.18,.06,'#7a5a3c',0,0,0,.02);k.box(g,.04,.04,.14,'#7a5a3c',0,.02,.09,.01);
  k.cyl(g,.1,.16,.18,k.mat(shadeColor,{emissive:'#ffd98a',glow:1}),0,.12,.18,14,false);return g;}
/** ON AIR 灯箱：红底白字，会亮。 */
export function onAirSign(k:Kit,w=1.5,h=.42){const g=new THREE.Group();k.box(g,w+.1,h+.1,.1,'#3b2430',0,0,0,.03);
  const face=k.pixels(48,14,c=>{c.fillStyle='#d93a3a';c.fillRect(0,0,48,14);c.fillStyle='#ff6b5e';c.fillRect(1,1,46,1);c.fillStyle='#fff3e6';const font:Record<string,string[]>={O:['111','101','101','101','111'],N:['101','111','111','111','101'],A:['010','101','111','101','101'],I:['111','010','010','010','111'],R:['110','101','110','101','101'],' ':['000','000','000','000','000']};
    let x=5;for(const ch of 'ON AIR'){const m=font[ch];m.forEach((row,y)=>[...row].forEach((v,i)=>{if(v==='1')c.fillRect(x+i*2,3+y*2,2,2);}));x+=8;}},{glow:1.1});
  g.add(mesh(new THREE.PlaneGeometry(w,h),face,0,0,.052,false));return g;}
/** 吸音板：深浅相间的方格。贴墙朝 +z。 */
export function acousticPanel(k:Kit,cols=3,rows=2,cell=.42){const g=new THREE.Group();for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const dark=(i+j)%2===0;
  k.box(g,cell-.04,cell-.04,.08,dark?'#3a3a4d':'#5b5b72',(i-(cols-1)/2)*cell,(j-(rows-1)/2)*cell,0,.02);k.box(g,cell*.42,cell*.42,.02,dark?'#5b5b72':'#3a3a4d',(i-(cols-1)/2)*cell+cell*.14,(j-(rows-1)/2)*cell+cell*.14,.05,.01,false);}return g;}
/** 墙上的置物板：木板加两个托架 */
export function shelf(k:Kit,w:number,wood:string){const g=new THREE.Group();k.box(g,w,.05,.24,wood,0,0,0,.015);for(const x of [-1,1])k.box(g,.04,.14,.16,shade(wood,.75),x*(w/2-.15),-.09,-.03,.01);return g;}
/** 老式收音机 */
export function radio(k:Kit,body='#9b6b45'){const g=new THREE.Group();k.box(g,.46,.28,.2,body,0,.14,0,.04);k.box(g,.24,.18,.02,'#e8d7b4',-.07,.14,.1,.01,false);for(const y of [.18,.1])k.cyl(g,.03,.03,.02,'#3b2f3f',.15,y,.105,10,false).rotation.x=Math.PI/2;return g;}
/** 圆叶绿植（播客间角落那盆）：高盆、细茎、一团圆叶子 */
export function roundLeafPlant(k:Kit,leaf:string,pot='#d07a4f',size=1){const g=new THREE.Group(),dark=shade(leaf,.75),light=shade(leaf,1.2);
  k.box(g,.42*size,.4*size,.42*size,pot,0,.2*size,0,.05);k.box(g,.04,.6*size,.04,'#5c7a3a',0,.7*size,0,.01);
  const r=seeded(13);for(let i=0;i<11;i++){const a=r()*Math.PI*2,d=r()*.28*size,y=(1+r()*.7)*size;k.cyl(g,.12*size,.12*size,.05,i%3===0?dark:i%3===1?leaf:light,Math.cos(a)*d,y,Math.sin(a)*d,10).rotation.set(r()*.8,0,r()*.8);}
  return g;}
/** 小圆茶几 */
export function sideTable(k:Kit,wood:string,radius=.42,height=.55){const g=new THREE.Group();k.cyl(g,radius,radius,.06,wood,0,height-.03,0,24);k.cyl(g,.05,.05,height-.06,shade(wood,.75),0,(height-.06)/2,0,10);k.cyl(g,.2,.24,.04,shade(wood,.75),0,.02,0,16);return g;}
export function teacup(k:Kit,color='#fbfaf4'){const g=new THREE.Group();k.cyl(g,.12,.12,.012,color,0,.006,0,12,false);k.cyl(g,.06,.05,.08,color,0,.05,0,12,false);k.cyl(g,.052,.052,.004,'#8a5a3a',0,.088,0,12,false);k.box(g,.03,.04,.012,color,.07,.05,0,.005,false);return g;}
export function openBook(k:Kit){const g=new THREE.Group();for(const s of [-1,1]){const p=k.box(g,.2,.02,.28,'#fbf6e6',s*.1,.02,0,.005,false);p.rotation.z=-s*.08;}k.box(g,.42,.015,.3,'#b0503f',0,.005,0,.004,false);for(let i=0;i<4;i++)k.box(g,.14,.003,.012,'#9a8f7a',-.1+(i%2)*.2,.032,-.08+Math.floor(i/2)*.06,.001,false);return g;}
/** 告示牌的两根木桩：插在地里，板子挂在上面。 */
export function signPosts(k:Kit,width:number,height:number,wood:string){const g=new THREE.Group();for(const x of [-1,1])k.box(g,.14,height,.14,wood,x*(width/2-.25),height/2,-.06,.03);return g;}
export {at};
