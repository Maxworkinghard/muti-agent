import * as THREE from 'three';
import type {TaskEvent} from '../../types';
import type {Assets} from '../assets';
import type {Room} from '../rooms/debate';
import {createMaterials} from './materials';
import {FONT,mesh,rbox,textCanvas,mergeStatic} from './geometry';
import {createChair} from './chair';
import {createPodium} from './podium';
import {createHandBook,type DebateProps,type PropCast,type PropState,type PropContacts} from './debateProps';
import {wideFloor} from './surfaceTextures';

/** 通用 MC 家具和场景牌，只呈现实际讨论进度，不引入比赛规则或评分。 */
export function createSceneProps(room:Room,cast:PropCast[],assets:Assets):DebateProps {
  const root=new THREE.Group();root.name='scene-props';
  const m=createMaterials(),dynamic=new Set<THREE.Object3D>(),bookMaterials=new Map<string,THREE.MeshStandardMaterial>();
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{m.owned.push(x);return x;};
  const add=(parent:THREE.Object3D,w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0,shadow=true)=>{const o=mesh(rbox(w,h,d,.007),mat,x,y,z,shadow);parent.add(o);return o;};
  // 水的游戏模型只有粒子贴图；流体表面由单独的原版动画贴图呈现。
  let water:THREE.Texture|undefined,waterMat:THREE.MeshStandardMaterial|undefined,waterFrames=1;
  if(room.outdoor&&room.blocks.some(b=>b.id==='water')){
    water=keep(assets.textures.get('block/water_still.png')!.clone());const image=water.image as HTMLImageElement;waterFrames=image.height/image.width;water.repeat.set(1,1/waterFrames);
    waterMat=keep(new THREE.MeshStandardMaterial({map:water,color:'#4d8cc0',transparent:true,opacity:.78,roughness:.25,metalness:0,depthWrite:false}));
    for(const b of room.blocks.filter(b=>b.id==='water')){const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);root.add(mesh(g,waterMat,b.x+.5,b.y+.88,b.z+.5,false));}
  }
  for(const f of room.floor){const w=f.x1-f.x0,d=f.z1-f.z0,t=keep(wideFloor(w,d)),g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);root.add(mesh(g,keep(new THREE.MeshStandardMaterial({name:'wood-floor',map:t,bumpMap:t,bumpScale:.006,roughness:.64})),(f.x0+f.x1)/2,f.y,(f.z0+f.z1)/2,false));}
  for(const l of room.lights){const [x,y,z]=l.position;
    if(l.kind==='lantern'){
      add(root,.025,6-y-.3,.025,m.brassDark,x,(6+y+.3)/2,z,false);
      for(const s of [-1,1])add(root,.46,.035,.46,m.brass,x,y+s*.27,z,false);
      for(const a of [-1,1])for(const b of [-1,1])add(root,.025,.52,.025,m.brassDark,x+a*.205,y,z+b*.205,false);
      add(root,.33,.46,.33,m.flame,x,y,z,false);
    }else{add(root,1.04,.035,l.length+.04,m.woodDark,x,5.982,z,false);add(root,.92,.014,l.length-.08,m.flame,x,5.957,z,false);}
  }
  const screens:Array<{mat:THREE.MeshStandardMaterial;index:number}>=[];
  for(const t of room.layout.tables){const g=new THREE.Group(),h=t.height;
    if(t.shape==='round'){
      g.add(mesh(new THREE.CylinderGeometry(t.length/2,t.length/2,.12,32),m.wood,0,h-.06,0));
      add(g,.44,h-.12,.44,m.woodDark,0,(h-.12)/2,0);add(g,t.length*.6,.09,t.depth*.6,m.woodDark,0,.045,0);
    }else{
      add(g,t.length,.12,t.depth,m.wood,0,h-.06,0);
      for(const x of [-1,1])for(const z of [-1,1])add(g,.075,h-.12,.075,m.woodDark,x*(t.length/2-.12),(h-.12)/2,z*(t.depth/2-.12));
      add(g,t.length-.2,.22,.055,m.stone,0,h-.24,-t.depth/2+.03);
    }
    g.position.set(...t.center);g.rotation.y=t.skirtYaw;root.add(g);
    if(t.id.startsWith('work-desk')){
      const i=Number(t.id.split('-').at(-1));
      add(g,.8,.5,.08,m.woodDark,0,h+.42,-.2);add(g,.055,.24,.06,m.brassDark,0,h+.16,-.2);add(g,.35,.025,.22,m.brassDark,0,h+.013,-.2);
      const texture=keep(textCanvas(256,144,c=>{c.fillStyle='#35493f';c.fillRect(0,0,256,144);c.fillStyle='#e2d5b9';c.font=`22px ${FONT}`;c.fillText('工位 '+(i+1),14,32);for(let j=0;j<4;j++){c.fillStyle=j===0?'#b99b62':'#637769';c.fillRect(14,50+j*19,170-j*20,8);}}));
      const mat=keep(new THREE.MeshStandardMaterial({map:texture,roughness:.8,emissive:'#617b69',emissiveIntensity:.08}));g.add(mesh(new THREE.PlaneGeometry(.73,.43),mat,0,h+.42,-.153,false));screens.push({mat,index:i});
      add(g,.58,.02,.19,m.stone,0,h+.013,.24);add(g,.085,.03,.11,m.stone,.42,h+.02,.24);
      add(g,.4,.42,.66,m.wood, t.length/2-.23,h*.45,0);
    }
    const pot=new THREE.Group();add(pot,.16,.18,.16,m.pot,0,.09,0);add(pot,.2,.16,.2,m.leaf,0,.26,0);add(pot,.08,.2,.12,m.leafDark,.08,.32,0);
    pot.position.set(t.shape==='round'?0:t.length/2-.2,h,0);g.add(pot);
    if(t.id==='picnic-table'){for(const x of [-.55,.55]){add(g,.14,.08,.14,m.paper,x,h+.04,.12);add(g,.19,.03,.22,m.woodDark,x,h+.016,-.28);}}
  }
  const chairs:Array<{g:THREE.Group;home:THREE.Vector3;back:THREE.Vector3;actor:number;slide:number}>=[];
  for(const c of room.layout.chairs){let g:THREE.Group;
    if(c.style==='stool'){g=new THREE.Group();add(g,.65,.5,.65,m.woodDark,0,.25,0);add(g,.69,.035,.69,m.wood,0,.515,0);g.position.set(...c.position);g.rotation.y=c.yaw;}
    else if(c.style==='armchair'){
      g=new THREE.Group();const fabric=c.actor===0?m.clothCon:m.clothPro;
      add(g,1,.16,.86,m.woodDark,0,.35,0);add(g,.84,.17,.78,fabric,0,.505,0);add(g,.86,.7,.16,fabric,0,.85,-.35);
      for(const x of [-1,1]){add(g,.15,.4,.85,fabric,x*.46,.66,0);for(const z of [-1,1])add(g,.065,.29,.065,m.woodDark,x*.38,.145,z*.3);}
      g.position.set(...c.position);g.rotation.y=c.yaw;
    }else g=createChair(c,m);
    root.add(g);if(c.actor!==undefined){dynamic.add(g);chairs.push({g,home:g.position.clone(),back:new THREE.Vector3(-Math.sin(c.yaw),0,-Math.cos(c.yaw)),actor:c.actor,slide:c.slide});}
  }
  if(room.kind==='podcast'){
    for(const a of room.anchors){const g=new THREE.Group();add(g,.25,.035,.25,m.brassDark,0,.02,0);add(g,.026,1.02,.026,m.brassDark,0,.54,0);
      const boom=add(g,.025,.025,.58,m.brassDark,0,1.07,-.25);boom.rotation.x=.25;add(g,.085,.14,.11,m.stone,0,1.02,-.49);
      g.position.set(a.seat[0]+(a.seat[0]<8?.6:-.6),1,a.seat[2]+.62);g.rotation.y=a.homeYaw;root.add(g);
    }
    const rug=keep(textCanvas(256,256,c=>{c.fillStyle='#526f79';c.fillRect(0,0,256,256);c.strokeStyle='#b99d65';c.lineWidth=3;c.strokeRect(8,8,240,240);}));
    const plane=new THREE.PlaneGeometry(9,5);plane.rotateX(-Math.PI/2);root.add(mesh(plane,keep(new THREE.MeshStandardMaterial({map:rug,roughness:1})),8,1.025,8,false));
  }
  const empty=new THREE.Object3D();root.add(empty);let contacts:PropContacts={mics:new Map(),nextRound:empty,bell:empty,script:empty};
  if(room.kind==='classroom'){const pod=createPodium(room.layout,m,keep,dynamic,m.glow('#eebd78',1.2));root.add(pod.podium);contacts={mics:new Map(),nextRound:pod.podiumButton,bell:empty,script:pod.flipPage};}
  const bc=document.createElement('canvas');bc.width=1536;bc.height=384;const ctx=bc.getContext('2d')!,boardTexture=keep(new THREE.CanvasTexture(bc));boardTexture.colorSpace=THREE.SRGBColorSpace;
  const board=room.layout.board,sign=new THREE.Group();
  add(sign,board.width+.16,board.height+.16,.09,m.woodDark);
  sign.add(mesh(new THREE.PlaneGeometry(board.width,board.height),keep(new THREE.MeshStandardMaterial({map:boardTexture,roughness:.9})),0,0,.048,false));sign.position.set(...board.position);root.add(sign);
  if(room.outdoor)for(const x of [-1,1])add(root,.12,board.position[1]-1,.12,m.woodDark,board.position[0]+x*(board.width/2-.3),(board.position[1]+1)/2,board.position[2]-.08);
  let boardKey='';
  const draw=(s:PropState & {tasks?:TaskEvent[]})=>{const tasks=s.tasks??[],last=tasks.at(-1),key=JSON.stringify([s.theme,s.round,s.label,s.finished,last?.id,last?.status]);if(key===boardKey)return;boardKey=key;
    const line=(text:string,y:number,max:number,font:number,color:string)=>{let n=font;ctx.font=`600 ${n}px ${FONT}`;while(n>22&&ctx.measureText(text).width>max){n-=2;ctx.font=`600 ${n}px ${FONT}`;}ctx.fillStyle=color;ctx.fillText(text,768,y);};
    ctx.fillStyle='#f2e6cd';ctx.fillRect(0,0,1536,384);ctx.fillStyle='#3d5147';ctx.fillRect(0,0,1536,82);ctx.textAlign='center';ctx.textBaseline='middle';
    line(room.title??'讨论空间',41,1460,52,'#f5eddd');line(s.theme||'等待你带来话题',145,1450,64,'#403d32');
    const phase=s.finished?'本次讨论已结束':s.round?`第 ${s.round} 轮 · ${s.label}`:'等待开场';line(phase,229,1440,38,'#7a6949');
    const detail=room.kind==='office'&&last?`${cast.find(p=>p.id===last.from)?.name??'成员'} → ${cast.find(p=>p.id===last.to)?.name??'成员'}：${last.title}`:room.kind==='podcast'?`主持：${cast[0]?.name??'—'}  ·  嘉宾：${cast[1]?.name??'—'}`:cast.map(p=>p.name).join(' · ');
    line(detail,318,1440,36,'#556455');boardTexture.needsUpdate=true;
  };
  mergeStatic(root,dynamic,m.flatBatch);for(const c of chairs)mergeStatic(c.g,new Set(),m.flatBatch);
  root.userData.surfaces={wood:{roughness:m.wood.roughness,grain:true},cloth:{roughness:m.clothJudge.roughness,weave:true},copper:{roughness:m.brass.roughness,metalness:m.brass.metalness},floor:{pattern:room.outdoor?'grass-and-picnic-cloth':'wide-staggered-planks'}};
  return {root,contacts,fixtures:[],beamScale:0,
    update(s){for(const c of chairs)c.g.position.copy(c.home).addScaledVector(c.back,c.slide*(1-(s.sit[c.actor]??1)));for(const screen of screens)screen.mat.emissiveIntensity=s.mics['seat-'+screen.index]?.28:.08;if(water)water.offset.y=1-(Math.floor(s.now/150)%waterFrames+1)/waterFrames;draw(s);},
    setEnvironment(map,intensity=.32){m.env(map,intensity);if(waterMat){waterMat.envMap=map;waterMat.envMapIntensity=.25;waterMat.needsUpdate=true;}},setReflections(){},
    createBook(){return createHandBook(assets,(name,make)=>{let mat=bookMaterials.get(name);if(!mat){mat=keep(make());bookMaterials.set(name,mat);}return mat;});},
    dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});m.owned.forEach(o=>o.dispose());}};
}
