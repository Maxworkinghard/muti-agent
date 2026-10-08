import * as THREE from 'three';
import type {Assets} from '../assets';
import type {Room} from '../rooms/debate';
import {createFlatBatch,mergeStatic,mesh} from './geometry';
import {createKit,at} from './furniture';
import {drawBoard} from './boards';
import {createHandBook,type DebateProps,type PropCast,type PropContacts} from './debateProps';
/**
 * 新画风房间的物件：房间自己摆静态家具（decorate）和椅子（makeChair），这里负责地面图、
 * 会滑动的椅子、话题板和逐帧更新。接口和旧的场景物件一致，人物、镜头、导演都不用改。
 */
export function createStyledProps(room:Room,cast:PropCast[],assets:Assets):DebateProps {
  const root=new THREE.Group();root.name='styled-props';
  const k=createKit(assets),flat=createFlatBatch(),dynamic=new Set<THREE.Object3D>(),owned:Array<THREE.Material|THREE.Texture>=[flat];
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  // 地面图：每米 16 像素，最近邻放大，和方块贴图一样是清楚的像素格。
  if(room.floorArt)for(const f of room.floor){const w=f.x1-f.x0,d=f.z1-f.z0,art=room.floorArt;
    const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);const quad=mesh(g,k.pixels(w*16,d*16,c=>art(c,w,d)),(f.x0+f.x1)/2,f.y,(f.z0+f.z1)/2,false);quad.name='floor-art';root.add(quad);}
  // 水面（草地的池塘）：原版流动的水贴图，染成房间给的湖蓝，带一点反光。
  let water:THREE.Texture|undefined,waterFrames=1;
  const waterBlocks=room.blocks.filter(b=>b.id==='water'),still=assets.textures.get('block/water_still.png');
  if(waterBlocks.length&&still?.image){
    water=keep(still.clone());water.colorSpace=THREE.SRGBColorSpace;water.magFilter=THREE.NearestFilter;water.minFilter=THREE.NearestFilter;water.needsUpdate=true;
    const img=still.image as {width:number;height:number};waterFrames=Math.max(1,Math.round(img.height/img.width));water.repeat.set(1,1/waterFrames);
    const mat=keep(new THREE.MeshStandardMaterial({map:water,color:room.waterColor??'#3f76e4',transparent:true,opacity:.86,roughness:.1,metalness:0,depthWrite:false}));
    for(const b of waterBlocks){const g=new THREE.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);root.add(mesh(g,mat,b.x+.5,b.y+.88,b.z+.5,false));}
  }
  room.decorate?.(k,root);
  const chairs:Array<{g:THREE.Group;home:THREE.Vector3;back:THREE.Vector3;actor:number;slide:number}>=[];
  for(const c of room.layout.chairs){const g=room.makeChair?room.makeChair(k,c):new THREE.Group();at(g,...c.position,c.yaw);root.add(g);
    if(c.actor!==undefined){dynamic.add(g);chairs.push({g,home:g.position.clone(),back:new THREE.Vector3(-Math.sin(c.yaw),0,-Math.cos(c.yaw)),actor:c.actor,slide:c.slide});}}
  // 话题板：画布按板子比例，字够清楚；底图用像素画放大。
  const board=room.layout.board,style=room.boardStyle??'cork',W=1536,H=Math.round(W*board.height/board.width);
  const bc=document.createElement('canvas');bc.width=W;bc.height=H;const ctx=bc.getContext('2d')!,boardTexture=keep(new THREE.CanvasTexture(bc));boardTexture.colorSpace=THREE.SRGBColorSpace;boardTexture.anisotropy=8;
  const sign=new THREE.Group();sign.name='topic-board';
  // 边框：'block/xxx' 用方块贴图（和房间木作同一种木头），否则是平涂颜色。
  if(room.boardFrame?.startsWith('block/'))k.block(sign,board.width+.18,board.height+.18,.08,{side:room.boardFrame},0,0,-.01);
  else if(room.boardFrame)k.box(sign,board.width+.18,board.height+.18,.08,room.boardFrame,0,0,-.01,.02);
  sign.add(mesh(new THREE.PlaneGeometry(board.width,board.height),keep(new THREE.MeshStandardMaterial({map:boardTexture,roughness:.9,emissive:style==='onair'?'#ffffff':'#000000',emissiveMap:style==='onair'?boardTexture:null,emissiveIntensity:style==='onair'?.18:0})),0,0,.035,false));
  sign.position.set(...board.position);sign.rotation.y=room.boardYaw??0;root.add(sign);
  room.decorateBoard?.(k,sign);
  let boardKey='';
  const names=cast.map(p=>p.name).join(' · ');
  const drawInfo=(s:Parameters<DebateProps['update']>[0])=>{const tasks=s.tasks??[],last=tasks.at(-1),key=JSON.stringify([s.theme,s.round,s.label,s.finished,last?.id,last?.status]);if(key===boardKey)return;boardKey=key;
    const detail=room.kind==='office'&&last?`${cast.find(p=>p.id===last.from)?.name??'成员'} → ${cast.find(p=>p.id===last.to)?.name??'成员'}：${last.title}`:room.kind==='podcast'?`主持 ${cast[0]?.name??'—'} · 嘉宾 ${cast[1]?.name??'—'}`:names;
    const info={title:room.title??'讨论空间',theme:s.theme,phase:s.round?`第 ${s.round} 轮 · ${s.label}`:'等待开场',detail,finished:s.finished};if(room.drawBoard)room.drawBoard(ctx,W,H,info);else drawBoard(style,ctx,W,H,info);boardTexture.needsUpdate=true;};
  mergeStatic(root,dynamic,flat);for(const c of chairs)mergeStatic(c.g,new Set(),flat);
  const empty=new THREE.Object3D();root.add(empty);
  const contacts:PropContacts={mics:new Map(),nextRound:empty,bell:empty,script:empty};
  const bookMaterials=new Map<string,THREE.MeshStandardMaterial>();
  root.userData.surfaces={style:'flat-pixel',floor:room.floorArt?'pixel-art':'blocks',board:style};
  return {root,contacts,fixtures:[],beamScale:0,
    update(s){for(const c of chairs)c.g.position.copy(c.home).addScaledVector(c.back,c.slide*(1-(s.sit[c.actor]??1)));if(water)water.offset.y=1-(Math.floor(s.now/100)%waterFrames+1)/waterFrames;room.animate?.(s.now);drawInfo(s);},
    setEnvironment(map,intensity=.15){for(const m of [...k.owned,...owned])if(m instanceof THREE.MeshStandardMaterial){m.envMap=map;m.envMapIntensity=intensity;m.needsUpdate=true;}},setReflections(){},
    createBook(){return createHandBook(assets,(name,make)=>{let mat=bookMaterials.get(name);if(!mat){mat=keep(make());bookMaterials.set(name,mat);}return mat;});},
    dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});[...k.owned,...owned].forEach(o=>o.dispose());}};
}
