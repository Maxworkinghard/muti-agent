/**
 * Q 版人物 / 椅子 / 地面的实验台（开发工具，不进生产构建）。地址参数：
 *   mode=row    一排人物站着或坐着：group=roundtable|emotion|ent|product|rational|all（或 ids=a,b），view=front|side|back|34，pose=stand|sit
 *   mode=expr   每人 6 种表情（neutral/happy/surprised/thinking/angry/shy）的头肩特写，group 或 ids
 *   mode=poses  一个人的 6 种姿态（站、坐、说话、思考、前倾、用工具），id=人物 id，view
 *   mode=chairs 三种椅子 ×（空椅 / 有人坐），view=34|side|front
 *   mode=floors 三种地面：上排斜看近景，下排俯视整块
 * 加 &shot 隐藏工具条（mc-shots.mjs lab 用）。每个格子单独取景渲染（剪裁视口），互不遮挡。渲染完成后 window.__labReady = true。
 */
import * as THREE from 'three';
import {createRig,legPose,type Rig} from '../mc/player';
import {LOOKS} from '../mc/avatar/looks';
import {SEAT_H,SIT_DROP,T,HAND_REACH} from '../mc/avatar/rig';
import {LIBRARY_PERSONAS} from '../data/personas';
import {RATIONAL_PERSONAS} from '../data/rationalPersonas';
import {createV2Kit} from '../mc/v2/kit';
import {makeChair,SOFT_FABRIC,type ChairKind} from '../mc/props/chairs';
import {plankHall,walnutHerringbone,stoneWoodMix} from '../mc/props/floors';
import type {FaceExtra} from '../mc/skin';
import type {Persona} from '../types';

type Art=(c:CanvasRenderingContext2D,w:number,d:number)=>void;
const q=new URLSearchParams(location.search),mode=q.get('mode')??'row',view=q.get('view')??'front',pose=q.get('pose')??'stand',group=q.get('group')??'roundtable';
if(q.has('shot'))document.body.classList.add('shot');
const GROUPS:Record<string,string[]>={
  roundtable:['math-intuitionist-001','skeptic-001','socratic-questioner-001','pragmatic-philosopher-001','logic-analyst-001','jie-mo','hao-hao','leng-cui'],
  emotion:['jie-mo','hao-hao','leng-cui','fu-du-ji','shu-dong','nuan-bao-bao','pao-zhang'],
  ent:['ent-affirmer-001','ent-cold-observer-001','ent-contrarian-001','ent-counter-contrarian-001','ent-imagination-001','ent-life-friend-001','ent-normal-001','podcast-host-amai'],
  product:['ji-mu','suan-pan','fang-da-jing','ban-shou','zhao-yao-jing','nao-zhong','pin-tu','chi-lun','tiao-se-pan','bu-chong-wang','mie-huo-qi','la-ba','gang-bi'],
  rational:['math-intuitionist-001','skeptic-001','socratic-questioner-001','pragmatic-philosopher-001','logic-analyst-001'],
};
GROUPS.all=[...GROUPS.emotion,...GROUPS.ent,...GROUPS.product,...GROUPS.rational];
const ids=(q.get('ids')?.split(',')??GROUPS[group]??GROUPS.roundtable).filter(id=>LOOKS[id]);
const personas=new Map<string,Persona>([...LIBRARY_PERSONAS,...RATIONAL_PERSONAS].map(p=>[p.id,p]));
const rigOf=(id:string)=>{const p=personas.get(id),l=LOOKS[id];const r=createRig(id,p?.name??l?.name??id,p?.visual??{skin:l.skin,hair:l.hair.color,shirt:l.top.color,accent:'#fbf5e4'},'host');
  // 贴图集用量：换成 512 或快满了就在控制台提示（mc-shots lab 会把警告打出来）
  const at=r.avatar.atlas;if(at.size>256||at.used>.85)console.warn('atlas',id,at.size,at.used.toFixed(2));return r;};

// ——场景
const W=1440,H=960,renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),BG=new THREE.Color('#c9d6e2');scene.background=BG;
// 光照按场景里的量级来（半球光 0.85、太阳 2.1、补光 0.35），不然颜色发白，看不出布料和木头的真实颜色
scene.add(new THREE.HemisphereLight('#dfe8f2','#8f8676',.85));
const fill=new THREE.DirectionalLight('#cfe0ff',.35);fill.position.set(6,4,-6);scene.add(fill);
const owned:Array<THREE.Material|THREE.Texture>=[],kit=createV2Kit(owned);
/** 每个格子一盏自己的太阳（只照格子周围，阴影图清楚） */
function sunAt(x:number,z:number,r=3){const s=new THREE.DirectionalLight('#fff1dc',2.1);s.position.set(x-3,9,z+7);s.target.position.set(x,0,z);s.castShadow=true;s.shadow.mapSize.set(1024,1024);const c=s.shadow.camera as THREE.OrthographicCamera;c.left=-r;c.right=r;c.top=r;c.bottom=-r;c.near=1;c.far=25;s.shadow.bias=-.0004;s.shadow.normalBias=.02;scene.add(s,s.target);}
/** 一块地面：16 像素 / 米的像素图 */
function floorPatch(w:number,d:number,art:Art=(c,a,b)=>plankHall(c,a,b),x=0,z=0){
  const cv=document.createElement('canvas');cv.width=Math.round(w*16);cv.height=Math.round(d*16);const c=cv.getContext('2d')!;art(c,w,d);
  const t=new THREE.CanvasTexture(cv);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.colorSpace=THREE.SRGBColorSpace;owned.push(t);
  const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:t,roughness:.9}));m.position.set(x,0,z);m.receiveShadow=true;scene.add(m);return m;}
const place=(o:THREE.Object3D,x:number,y:number,z:number,yaw=0)=>{o.position.set(x,y,z);o.rotation.y=yaw;scene.add(o);return o;};
const YAW:Record<string,number>={front:0,side:Math.PI/2,back:Math.PI,'34':Math.PI/5};
const yaw=YAW[view]??0;
/** 姿态：和游戏里 player.update 同一套角度 */
function posed(r:Rig,kind:string,sit:number){
  const b=r.bones;legPose(b,r.knees,sit);
  let rx=-Math.PI/5*sit,ry=0,rz=0,lx=-Math.PI/5*sit,ly=0,lz=0;b[2].rotation.set(0,0,0);b[3].rotation.set(0,0,0);
  if(kind==='speak'){lx=-1.0;lz=.28;rx=-.85;}
  // 思考：左手托着下巴（手在脸的斜前方，大头不挡），头微歪
  // 实验台斜 45° 看的是人物右侧，所以用右手托腮（游戏里的“托腮”待机是左手，角度对称）
  if(kind==='think'){rx=-2.4;ry=0;rz=-.6;b[3].rotation.x=.08;b[3].rotation.z=-.12;}
  if(kind==='lean'){b[2].rotation.x=.35;b[3].rotation.x=-.25;rx=-1;lx=-1;}
  if(kind==='tool'){rx=-1.15;rz=-.2;lx=-1.23;ly=.5;lz=.5;b[3].rotation.x=.16;
    const pad=new THREE.Mesh(new THREE.BoxGeometry(.2,.012,.15),new THREE.MeshStandardMaterial({color:'#e9e1c8'}));const hand=new THREE.Group();hand.position.set(-.5*T,HAND_REACH+T,-1.5*T);hand.rotation.set(-1.25,.15,0);pad.position.set(0,0,.06);hand.add(pad);b[4].add(hand);}
  b[4].rotation.set(rx,ry,rz);b[5].rotation.set(lx,ly,lz);
  r.root.position.y=sit?SEAT_H-SIT_DROP:0;
}
const EXPR:Array<[string,FaceExtra[]]>=[['neutral',['neutral']],['happy',['happy']],['surprised',['shock']],['thinking',['think']],['angry',['angry']],['shy',['shy']]];
const fabric=(i:number)=>SOFT_FABRIC[i%SOFT_FABRIC.length];
const rigs:Rig[]=[];
/** 一个格子：屏幕矩形（像素）+ 看向的点、可见宽度（米）、从哪个方向看 */
interface Cell{x:number;y:number;w:number;h:number;at:THREE.Vector3;span:number;dir:THREE.Vector3;label?:string;fov?:number}
const cells:Cell[]=[];
const grid=(cols:number,rows:number,i:number,top=0)=>{const cw=W/cols,ch=(H-top)/rows;return {x:(i%cols)*cw,y:top+Math.floor(i/cols)*ch,w:cw,h:ch};};
const person=(id:string,x:number,z:number,kind='stand',chair:ChairKind|null=null,extra:FaceExtra[]=['neutral'],i=0)=>{const r=rigOf(id);rigs.push(r);const sit=kind==='stand'?0:1;posed(r,kind,sit);place(r.root,x,0,z,yaw);
  if(sit&&chair)place(makeChair(kit,chair,fabric(i)),x,0,z,yaw);r.skin.face(undefined,500,kind==='speak',true,extra);return r;};

if(mode==='row'){
  // 每排最多 per 人（默认 8 人以内一排 4 个，人多一排 11 个），格子同时按宽和高取景，人不会被裁掉
  const per=Number(q.get('per')??(ids.length<=8?4:11)),rows=Math.ceil(ids.length/per),cols=Math.ceil(ids.length/rows),gap=1.15,sit=pose==='sit';
  for(let rr=0;rr<rows;rr++){const z=rr*30,n=Math.min(cols,ids.length-rr*cols);floorPatch(n*gap+2,4,undefined,0,z);sunAt(0,z,n*gap/2+1.5);
    for(let c=0;c<n;c++){const i=rr*cols+c,x=(c-(n-1)/2)*gap;person(ids[i],x,z,sit?'sit':'stand',sit?'meeting':null,['neutral'],i);}
    const g=grid(1,rows,rr),dir=view==='34'||sit?new THREE.Vector3(0,.22,1):new THREE.Vector3(0,.08,1),needH=sit?2.25:2.6;
    cells.push({...g,at:new THREE.Vector3(0,sit?1.0:1.22,z),span:Math.max(cols*gap+.2,needH*g.w/g.h),dir,label:ids.slice(rr*cols,rr*cols+n).map(id=>LOOKS[id].name).join(' · ')});}
}
if(mode==='expr'){
  // 人和人隔 5 米、排和排隔 9 米（往 -z 排），每个格子的镜头前面不会挡着别人的头
  ids.forEach((id,row)=>EXPR.forEach(([name,extra],col)=>{const x=col*5,z=-row*9;person(id,x,z,'stand',null,extra);
    cells.push({...grid(6,ids.length,row*6+col),at:new THREE.Vector3(x,1.6,z),span:1.08,dir:new THREE.Vector3(0,.05,1),fov:22,label:(col===0?LOOKS[id].name+' · ':'')+name});}));
  sunAt(12.5,-ids.length*4.5,Math.max(16,ids.length*5));
}
if(mode==='poses'){
  const id=q.get('id')??'jie-mo',kinds=['stand','sit','speak','think','lean','tool'];
  kinds.forEach((k,i)=>{const x=i*4;floorPatch(2.4,2.4,undefined,x,0);sunAt(x,0,1.6);person(id,x,0,k,k==='stand'?null:'meeting',k==='think'?['think']:['neutral'],i);
    cells.push({...grid(3,2,i),at:new THREE.Vector3(x,.98,0),span:2.3,dir:new THREE.Vector3(0,.2,1),label:LOOKS[id].name+' · '+k});});
}
if(mode==='chairs'){
  // 六种椅子：occ=0 空椅，occ=1 有人坐（每把配一个人，看脚、臀、背、扶手的接触），3×2 排
  const occ=q.get('occ')==='1',kinds:ChairKind[]=['meeting','office','classroom','debate','outdoor','lounge'],who=(q.get('ids')??'leng-cui,chi-lun,math-intuitionist-001,logic-analyst-001,ent-life-friend-001,podcast-host-amai').split(','),fab=['#62738a','#5f7c79','','#36597e','','#c26a3c'];
  const dir=view==='side'?new THREE.Vector3(0,.08,1):view==='front'?new THREE.Vector3(0,.2,1):new THREE.Vector3(0,.32,1);
  kinds.forEach((k,i)=>{const x=i*5;floorPatch(2.2,2.2,undefined,x,0);sunAt(x,0,1.5);place(makeChair(kit,k,fab[i]||undefined),x,0,0,yaw);
    if(occ){const r=rigOf(who[i]);rigs.push(r);posed(r,'stand',1);place(r.root,x,0,0,yaw);r.skin.face(undefined,500,false,true,['neutral']);}
    cells.push({...grid(3,2,i),at:new THREE.Vector3(x,occ?1.1:.5,0),span:occ?2.35:1.35,dir,label:k+(occ?' · '+LOOKS[who[i]].name:' · 空')});});
}
if(mode==='floors'){
  const arts:Art[]=[(c,w,d)=>plankHall(c,w,d,{border:8,hearth:{x0:2.75,x1:3.75,z0:1.25,z1:2.75}}),(c,w,d)=>walnutHerringbone(c,w,d),(c,w,d)=>stoneWoodMix(c,w,d)],names=['湖畔议事厅长条木地板（含包边、炉床）','深胡桃人字拼','石木混拼'];
  arts.forEach((a,i)=>{const x=i*8;floorPatch(4,4,a,x,0);sunAt(x,0,3);if(i===0)person('hao-hao',x-.6,-.3);if(i===1)place(makeChair(kit,'debate','#4e79a1'),x+.4,0,.3,.5);if(i===2)place(makeChair(kit,'outdoor'),x-.2,0,.2,-.4);
    cells.push({...grid(3,2,i),at:new THREE.Vector3(x,.2,.6),span:2.6,dir:new THREE.Vector3(0,.75,1),label:names[i]+' · 近景'});
    cells.push({...grid(3,2,3+i),at:new THREE.Vector3(x,0,0),span:4.1,dir:new THREE.Vector3(0,1,.0001),label:names[i]+' · 俯视 4×4 米'});});
}
// ——渲染：每个格子一台相机
const camera=new THREE.PerspectiveCamera(30,1,.05,200);
function shoot(cell:Cell){const fov=cell.fov??30,aspect=cell.w/cell.h;camera.fov=fov;camera.aspect=aspect;camera.updateProjectionMatrix();
  const hf=2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*aspect),dist=cell.span/2/Math.tan(hf/2);
  camera.position.copy(cell.at).addScaledVector(cell.dir.clone().normalize(),dist);camera.up.set(0,1,0);if(cell.dir.x===0&&cell.dir.z<.001)camera.up.set(0,0,-1);camera.lookAt(cell.at);
  const y=H-cell.y-cell.h;renderer.setViewport(cell.x,y,cell.w,cell.h);renderer.setScissor(cell.x,y,cell.w,cell.h);renderer.render(scene,camera);}
const draw=()=>{renderer.setScissor(0,0,W,H);renderer.setViewport(0,0,W,H);renderer.setClearColor(BG);renderer.clear();for(const c of cells)shoot(c);};
// ——标签与格线
const box=document.getElementById('labels')!;
for(const c of cells){if(!c.label)continue;const s=document.createElement('span');s.textContent=c.label;s.style.left=(c.x+c.w/2)+'px';s.style.top=(c.y+c.h-20)+'px';box.appendChild(s);
  if(cells.length>1){const f=document.createElement('i');Object.assign(f.style,{position:'absolute',left:c.x+'px',top:c.y+'px',width:c.w-1+'px',height:c.h-1+'px',border:'1px solid #ffffff55',boxSizing:'border-box'});box.appendChild(f);}}
// ——工具条
const bar=document.getElementById('bar')!;const link=(t:string,p:Record<string,string>)=>{const u=new URLSearchParams({...Object.fromEntries(q),...p});const a=document.createElement('a');a.href='?'+u;a.textContent=t;bar.appendChild(a);};
for(const v of ['front','side','back','34'])link(v,{mode:'row',view:v,pose:'stand'});link('坐',{mode:'row',pose:'sit',view:'34'});link('表情',{mode:'expr'});link('姿态',{mode:'poses'});link('椅子',{mode:'chairs',view:'34'});link('椅子侧面',{mode:'chairs',view:'side'});link('地面',{mode:'floors'});
for(const g of Object.keys(GROUPS))link(g,{group:g});
let frames=0;const tick=()=>{draw();if(++frames<3)requestAnimationFrame(tick);else (window as unknown as {__labReady:boolean}).__labReady=true;};requestAnimationFrame(tick);
(window as unknown as {__lab:unknown}).__lab={scene,camera,renderer,rigs,cells,draw};
