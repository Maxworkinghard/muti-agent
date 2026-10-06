import * as THREE from 'three';
import type {PropMaterials} from './materials';
import {mesh} from './geometry';
/** 桌铃：黄铜色的小铃铛，拍一下杆就弹回来，换轮、结束都靠它（敲钟的物理动作）。 */
export function createBell(m:PropMaterials){
  const bell=new THREE.Group();bell.position.set(0,.012,0);
  bell.add(mesh(new THREE.CylinderGeometry(.042,.046,.012,24),m.brassDark,0,.006,0));
  const dome=mesh(new THREE.SphereGeometry(.038,24,12,0,Math.PI*2,0,Math.PI/2),m.brass,0,.012,0);bell.add(dome);
  const plunger=mesh(new THREE.CylinderGeometry(.004,.004,.015,10),m.brassDark,0,.056,0);bell.add(plunger);
  bell.add(mesh(new THREE.SphereGeometry(.007,10,8),m.brassDark,0,.065,0));
  return {bell,dome,plunger};
}
