import * as THREE from 'three';
import type {Assets} from './assets';
import type {DirectorState} from './director';
import {mesh,mergeStatic,createFlatBatch} from './props/geometry';
import {cuboid} from './player';
/**
 * 小动物（第 12.9 节）：舞台后角一只蜷着睡的猫、另一角一台唱片机和栖木上的鹦鹉。
 * 它们对台上的事有反应——桌铃一响猫抬头看主持、有人发言偶尔转头看、出结果站起来伸懒腰；
 * 鹦鹉在背景音乐播放时跟着跳舞，唱片机冒音符。不抢戏：动作小、间隔 8 秒以上。
 */
interface Critter {update(s:DirectorState,dt:number):void;dispose():void}
function boxMesh(w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
export function createCritters(assets:Assets,now:number):{root:THREE.Group;critters:Critter[];musicPlaying():boolean;setMusicPlaying(on:boolean):void;dispose():void} {
  const root=new THREE.Group();root.name='critters';const owned:Array<THREE.Material|THREE.Texture>=[];
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  // 64×32 的游戏动物展开图：按每个身体部件自己的 UV 使用完整贴图。
  const fur=keep(new THREE.MeshStandardMaterial({map:assets.textures.get('entity/cat/cat_tabby.png')!,roughness:.95}));
  const bird=keep(new THREE.MeshStandardMaterial({map:assets.textures.get('entity/parrot/parrot_red_blue.png')!,roughness:.95}));
  const animalBox=(w:number,h:number,d:number,u:number,v:number,mat:THREE.MeshStandardMaterial,x=0,y=0,z=0)=>{
    const geo=cuboid(w,h,d,u,v,[0,0,0]),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,1-(1-uv.getY(i))*2);
    return mesh(geo,mat,x,y,z);
  };
  // —— 猫：北墙西角书架顶上蜷着 ——
  const cat=new THREE.Group();cat.position.set(1.5,4,1.5);cat.rotation.y=.4;
  const catBody=new THREE.Group();cat.add(catBody);
  const torso=animalBox(4,16,6,20,0,fur,0,.24,0);torso.rotation.x=Math.PI/2;catBody.add(torso);
  const catHead=new THREE.Group();catHead.position.set(0,.32,.48);catHead.add(animalBox(5,4,5,0,0,fur));catBody.add(catHead);
  for(const s of [-1,1])catHead.add(animalBox(1,2,1,0,10,fur,s*.11,.14,0));
  const tail=new THREE.Group();tail.position.set(.22,.16,-.08);catBody.add(tail);
  const tailSeg=animalBox(1,7,1,0,15,fur,0,0,-.21);tailSeg.rotation.x=Math.PI/2;tail.add(tailSeg);tail.rotation.y=.5;
  for(const s of [-1,1])for(const z of [-.32,.3])catBody.add(animalBox(2,4,2,0,16,fur,s*.09,.125,z));
  root.add(cat);
  // —— 唱片机 + 栖木 + 鹦鹉：北墙东角书架前 ——
  const jukebox=boxMesh(.9,.86,.9,keep(new THREE.MeshStandardMaterial({color:'#6b4a37',roughness:.9})),18.5,1.43,2.8);
  const jukeboxTop=boxMesh(.7,.06,.7,keep(new THREE.MeshStandardMaterial({color:'#2c2c30',roughness:.85})),18.5,1.9,2.8);
  root.add(jukebox,jukeboxTop);
  const perch=boxMesh(1.6,.09,.09,keep(new THREE.MeshStandardMaterial({color:'#8a5b34',roughness:.9})),18.5,2.35,2.8);
  root.add(perch);
  for(const x of [17.9,19.1])root.add(boxMesh(.09,1.35,.09,perch.material,x,1.675,2.8));
  const parrot=new THREE.Group();parrot.position.set(18.5,2.395,2.8);parrot.rotation.y=Math.PI;
  const parrotBody=new THREE.Group();parrot.add(parrotBody);
  parrotBody.add(animalBox(3,6,3,2,8,bird,0,.29,0),animalBox(2,3,2,2,0,bird,0,.52,.03));
  parrotBody.add(animalBox(1,2,1,11,0,bird,0,.48,.12));
  const wingL=animalBox(1,5,3,19,0,bird,-.125,.29,0),wingR=animalBox(1,5,3,19,0,bird,.125,.29,0);parrotBody.add(wingL,wingR);
  parrotBody.add(animalBox(2,4,1,22,8,bird,0,.15,-.12));
  for(const s of [-1,1])parrotBody.add(animalBox(1,2,1,14,18,bird,s*.045,.0625,.02));
  root.add(parrot);
  mergeStatic(catBody,new Set([catHead,tail]));mergeStatic(catHead);mergeStatic(parrotBody,new Set([wingL,wingR]));
  mergeStatic(root,new Set([cat,parrot]),keep(createFlatBatch()));
  let musicOn=false,catActionAt=now-8000,catLookUntil=0,catYaw=0,catStretchUntil=0,lastBell=-1;const critters:Critter[]=[];
  const R=(n:number)=>Math.sin(n*127.1)*43758.5453%1;
  critters.push({update(s,dt){
    // 猫：睡姿呼吸、尾巴轻甩；铃响后 1.6 秒抬头看主持 1.8 秒；出结果站起来伸懒腰；偶尔翻身。
    const t=s.now/1000,bell=s.bellAt>lastBell&&s.bellAt>=0,ready=s.now-catActionAt>=8000;
    const speaker=Object.values(s.actors).find(a=>a.desired==='speaking'&&!a.error);
    if(bell)lastBell=s.bellAt;
    if(ready&&s.resultStage>=2){catStretchUntil=s.now+2200;catActionAt=s.now;}
    else if(ready&&(bell||speaker&&t%11<2)){const target=bell?[8,1.95]:[speaker!.position[0],speaker!.position[2]];catYaw=Math.max(-1.2,Math.min(1.2,Math.atan2(target[0]-cat.position.x,target[1]-cat.position.z)-cat.rotation.y));catLookUntil=s.now+2200;catActionAt=s.now;}
    const alert=s.now<catLookUntil,stretch=s.now<catStretchUntil;
    catHead.rotation.x=approach(catHead.rotation.x,alert?-.3:stretch?-.12:0,dt*4);
    catHead.rotation.y=approach(catHead.rotation.y,alert?catYaw:0,dt*4);
    catBody.scale.z=approach(catBody.scale.z,stretch?1.06:1,dt*4);
    catBody.scale.y=approach(catBody.scale.y,(stretch?1.18:1)+(s.reduced?0:Math.sin(t*1.7)*.02),dt*4);
    tail.rotation.z=s.reduced?0:Math.sin(t*1.3)*.18;
    // 鹦鹉：音乐播放时跟着节拍点头摇身、扑翅（游戏里唱片机旁的鹦鹉就会跳）；平时歪头、偶尔梳毛。
    const dance=musicOn&&!s.reduced;const beat=t*2.4;
    if(dance){parrotBody.rotation.z=Math.sin(beat)*.22;parrotBody.rotation.y=Math.PI+Math.sin(beat*.5)*.25;parrotBody.position.y=Math.abs(Math.sin(beat))*.05;
      wingL.rotation.z=.4+Math.abs(Math.sin(beat*1.3))*.9;wingR.rotation.z=-wingL.rotation.z;}
    else{const tilt=(t+R(1)*7)%11;parrotBody.rotation.z=approach(parrotBody.rotation.z,tilt<1.6?.24:0,dt*4);parrotBody.rotation.y=approach(parrotBody.rotation.y,Math.PI,dt*4);parrotBody.position.y=approach(parrotBody.position.y,0,dt*4);
      wingL.rotation.z=approach(wingL.rotation.z,0,dt*4);wingR.rotation.z=approach(wingR.rotation.z,0,dt*4);}
    jukeboxTop.visible=musicOn;
  },dispose(){}});
  return {root,critters,musicPlaying:()=>musicOn,setMusicPlaying:on=>{musicOn=on;},dispose(){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});owned.forEach(o=>o.dispose());}};
}
const approach=(from:number,to:number,rate:number)=>from+(to-from)*Math.min(1,rate);
