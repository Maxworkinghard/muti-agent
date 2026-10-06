import * as THREE from 'three';
import type {PropMaterials} from './materials';
import {mesh,rbox} from './geometry';
/** 北墙书架上方一幅金框风景画（第 12.5 节）：手绘的天空、山和太阳，配 2D 场景里墙上的挂画。 */
export function createWallArt(m:PropMaterials,art:THREE.Texture){
  const g=new THREE.Group();
  const image=art.image as HTMLImageElement,height=.96*image.height/image.width;
  const mat=new THREE.MeshStandardMaterial({map:art,roughness:.92});m.owned.push(mat);
  const inner=mesh(new THREE.PlaneGeometry(.96,height),mat,0,0,.023,false);
  const frame=mesh(rbox(1.06,height+.1,.04,.006),m.brass,0,0,0);
  g.add(frame,inner);
  return g;
}
/** 桌面上的小摆设：一摞书、一小盆绿植、两支蜡烛，颜色都从 2D 场景的色板里来，让桌子像有人常坐。 */
const BOOKS={pro:['#3e6d9a','#e7c96a','#b15546'],con:['#b15546','#3f8f62','#e7c96a'],judge:['#7a5b8a','#6b4a37','#3e6d9a']};
export function createTableDecor(m:PropMaterials,side:'pro'|'con'|'judge',endX:number){
  const g=new THREE.Group();
  let seed=side==='pro'?3:side==='con'?5:9;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<3;i++){const mat=new THREE.MeshStandardMaterial({color:BOOKS[side][i],roughness:.92});m.owned.push(mat);
    g.add(mesh(rbox(.21,.035,.15,.003),mat,-endX+(random()-.5)*.012,.02+i*.037,(random()-.5)*.02));}
  g.add(mesh(rbox(.08,.08,.08,.004),m.pot,endX,.04,.16));
  const leaf=new THREE.PlaneGeometry(.13,.16);m.leaf.side=THREE.DoubleSide;m.leafDark.side=THREE.DoubleSide;
  for(const [r,mat] of [[0,m.leaf],[Math.PI/2,m.leafDark]] as const){const q=mesh(leaf,mat,endX,.16,.16,false);q.rotation.y=r;g.add(q);}
  for(const x of [endX-.3,endX-.14]){
    g.add(mesh(new THREE.CylinderGeometry(.016,.018,.08,10),m.candle,x,.04,.1));
    g.add(mesh(new THREE.SphereGeometry(.008,8,6),m.flame,x,.092,.1,false));
  }
  return g;
}
