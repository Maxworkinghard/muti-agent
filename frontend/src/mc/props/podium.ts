import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,textCanvas,FONT,type Keep} from './geometry';
/**
 * 主持的讲台：浅灰窄立柱、金属底座和浅木斜面，讲稿保留实体翻页，
 * 右侧一粒石质按钮按下去弹回来，旁边的小灯是主持自己的"开麦灯"。
 */
export function createPodium(layout:Room['layout'],m:PropMaterials,keep:Keep,dynamic:Set<THREE.Object3D>,glowLamp:THREE.Material){
  const podium=new THREE.Group();podium.position.set(...layout.podium.position);podium.rotation.y=layout.podium.yaw;
  podium.add(mesh(rbox(.66,.06,.5,.004),m.woodDark,0,.03,0));
  podium.add(mesh(rbox(.42,1.06,.3,.008),m.stone,0,.59,0));
  podium.add(mesh(rbox(.24,.025,.015,.003),m.clothJudge,0,.96,.158));
  const top=new THREE.Group();top.position.set(0,1.18,0);top.rotation.x=-.24;podium.add(top);
  top.add(mesh(rbox(.62,.035,.46,.004),m.wood));
  top.add(mesh(rbox(.58,.028,.02,.004),m.woodDark,0,.026,-.21));
  // 讲稿：左页一页，右页三页；最上面那页是翻页动画的实体。
  const pageGeo=new THREE.PlaneGeometry(.19,.27);pageGeo.rotateX(-Math.PI/2);
  for(const [x,n] of [[.1,3],[-.1,1]] as const)for(let i=0;i<n;i++)top.add(mesh(pageGeo,m.paper,x,.019+i*.0012,.005,false));
  const flip=new THREE.Group();flip.position.set(0,.0225,.005);top.add(flip);dynamic.add(flip);const flipPage=mesh(pageGeo,m.paper,.1,0,0,false);flip.add(flipPage);flip.visible=false;
  // 「下一轮」按钮：石色小方块坐在小基座上，按下去会弹回来。
  const box=new THREE.Group();box.position.set(.21,.02,-.09);top.add(box);box.add(mesh(rbox(.09,.03,.06,.004),m.stone,0,.015,0));
  const podiumButton=mesh(new THREE.BoxGeometry(.038,.018,.038),m.brass,0,.039,0);box.add(podiumButton);dynamic.add(podiumButton);
  const label=mesh(new THREE.PlaneGeometry(.1,.025),keep(new THREE.MeshStandardMaterial({map:keep(textCanvas(256,64,c=>{c.fillStyle=PALETTE_LABEL_BG;c.fillRect(0,0,256,64);c.fillStyle='#f6f2e8';c.font=`600 38px ${FONT}`;c.textAlign='center';c.fillText('下一轮',128,46);})),roughness:.85})),0,.014,-.045,false);label.rotation.y=Math.PI;box.add(label);
  // 主持的开麦灯：讲话时亮，和台上的红石灯一个意思。
  const hostLamp=mesh(new THREE.BoxGeometry(.09,.09,.09),glowLamp,-.2,.045+.045,-.06,false);
  hostLamp.geometry.setAttribute('propGlow',new THREE.Float32BufferAttribute(new Float32Array(hostLamp.geometry.getAttribute('position').count).fill(6),1));
  top.add(hostLamp);
  // 桌铃的小台子：在讲台右手边，主持一伸手就能拍到。
  const shelf=new THREE.Group();shelf.position.set(.38,1.06,-.02);podium.add(shelf);shelf.add(mesh(rbox(.16,.024,.14,.004),m.wood),mesh(rbox(.03,.12,.03,.004),m.woodDark,-.055,-.06,0));
  return {podium,podiumButton,flip,flipPage,shelf,hostLamp};
}
const PALETTE_LABEL_BG='#3d3a42';
