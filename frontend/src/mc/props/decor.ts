import * as THREE from 'three';
import type {PropMaterials} from './materials';
import {mesh,rbox} from './geometry';
/** 北墙上的风景画，使用细灰框，保留游戏贴图。 */
export function createWallArt(m:PropMaterials,art:THREE.Texture){
  const g=new THREE.Group();
  const image=art.image as HTMLImageElement,height=.96*image.height/image.width;
  const mat=new THREE.MeshStandardMaterial({map:art,roughness:.92});m.owned.push(mat);
  const inner=mesh(new THREE.PlaneGeometry(.96,height),mat,0,0,.023,false);
  const frame=mesh(rbox(1.03,height+.07,.04,.004),m.woodDark,0,0,0);
  g.add(frame,inner);
  return g;
}
/** 桌面保留笔记本和小盆栽，留出开麦、书写和扶桌的位置。 */
const BOOKS={pro:['#3d8bff','#f0c84a','#ff4d9a'],con:['#ff4d9a','#3dba6e','#f0c84a'],judge:['#9b6fe0','#d4a86a','#3d8bff']};
export function createTableDecor(m:PropMaterials,side:'pro'|'con'|'judge',endX:number){
  const g=new THREE.Group();
  let seed=side==='pro'?3:side==='con'?5:9;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<3;i++){const mat=new THREE.MeshStandardMaterial({color:BOOKS[side][i],roughness:.92});m.owned.push(mat);
    g.add(mesh(rbox(.21,.035,.15,.003),mat,-endX+(random()-.5)*.012,.02+i*.037,(random()-.5)*.02));}
  g.add(mesh(rbox(.08,.08,.08,.004),m.pot,endX,.04,.16));
  const leaf=new THREE.PlaneGeometry(.13,.16);m.leaf.side=THREE.DoubleSide;m.leafDark.side=THREE.DoubleSide;
  for(const [r,mat] of [[0,m.leaf],[Math.PI/2,m.leafDark]] as const){const q=mesh(leaf,mat,endX,.16,.16,false);q.rotation.y=r;g.add(q);}
  return g;
}
