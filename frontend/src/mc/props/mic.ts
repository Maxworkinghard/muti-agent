import * as THREE from 'three';
import type {PropMaterials} from './materials';
import {mesh,rbox} from './geometry';
/**
 * 开麦的开关就是游戏里的那套（第 12.12 节第 5 条）：石座拉杆加大到全景能认出，扳过去红石灯亮——
 * 灯直接用游戏的红石灯贴图，暗着也认得出是灯。拉杆是手的接触目标，底座和灯并排摆在说话人正前方。
 */
export function createMic(m:PropMaterials,lampMat:THREE.Material,tileBox:(geo:THREE.BufferGeometry,tile:string)=>THREE.BufferGeometry,index:number){
  const g=new THREE.Group();
  g.add(mesh(rbox(.17,.05,.25,.004),m.stone,0,.025,-.09));
  const stick=new THREE.Group();stick.position.set(0,.05,-.015);g.add(stick);
  stick.add(mesh(rbox(.05,.24,.05,.004),m.woodDark,0,.12,0));
  stick.rotation.x=.72;
  const lamp=mesh(tileBox(new THREE.BoxGeometry(.26,.26,.26),'block/redstone_lamp'),lampMat,0,.13,.17,false);
  lamp.geometry.setAttribute('propGlow',new THREE.Float32BufferAttribute(new Float32Array(lamp.geometry.getAttribute('position').count).fill(index),1));
  g.add(lamp);
  return {group:g,stick,lamp};
}
