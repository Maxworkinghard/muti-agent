import * as THREE from 'three';
import type {Room} from '../rooms/debate';
/** 仅供 mc-lab 拍物品与人物的比例近景，生产页面沿用全景/评委席/人物视角。 */
export function inspectionCamera(kind:string,room:Room,index:number){
  const a=room.anchors[index]??room.anchors[0],desk=room.layout.desk.find(d=>d.actor===index)??room.layout.desk[0],p=room.layout.podium.position;
  let target=new THREE.Vector3(a.seat[0],a.stand[1]+1.15,a.seat[2]),distance=2.6,fov=42;
  const forward=new THREE.Vector3(Math.sin(a.homeYaw),0,Math.cos(a.homeYaw)),right=new THREE.Vector3(forward.z,0,-forward.x);
  let position=target.clone().addScaledVector(forward,distance).addScaledVector(right,.7);position.y+=.45;
  if(kind==='chair'){target.set(a.seat[0],a.stand[1]+.6,a.seat[2]);position=target.clone().addScaledVector(forward,-1.2).addScaledVector(right,1.6);position.y+=1;fov=48;}
  if(kind==='lever'&&desk.mic){target.set(...desk.mic);target.y+=.15;position=target.clone().addScaledVector(forward,1.3).addScaledVector(right,.55);position.y+=.4;fov=35;}
  if(kind==='book'){target.addScaledVector(forward,.35).addScaledVector(right,-.25);target.y=a.stand[1]+1;position=target.clone().addScaledVector(forward,1.5).addScaledVector(right,.3);position.y+=.4;fov=35;}
  if(kind==='podium'){target.set(p[0],p[1]+.9,p[2]-.2);position.set(p[0]+1.25,p[1]+1.6,p[2]+2.1);fov=44;}
  if(kind==='bell'){target.set(p[0]+.38,p[1]+.98,p[2]-.02);position.set(p[0]+.5,p[1]+1.28,p[2]+.7);fov=32;}
  if(kind==='board'){const s=room.layout.board;target.set(...s.position);position.copy(target).add(new THREE.Vector3(.2,-.2,10));fov=30;}
  if(kind==='front'){target.set(p[0],3.2,p[2]);position.set(p[0],4.4,p[2]+8.8);fov=43;}
  if(kind==='judge'){const t=room.layout.tables.find(t=>t.side==='judge')!;target.set(t.center[0],t.center[1]+t.height,t.center[2]);position.set(t.center[0]+1.3,t.center[1]+1.8,t.center[2]+2.4);fov=55;}
  return {pos:position.toArray() as [number,number,number],target:target.toArray() as [number,number,number],fov};
}
