import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,textCanvas,FONT} from './geometry';
/**
 * 现代辩论桌：浅木台面、哑光灰挡板、金属端架，蓝红只用于细色带和队名。
 * 保持原来的桌面高度、深度和接触位置，人物开麦与扶桌动作不变。
 */
export function createTable(t:Room['layout']['tables'][number],m:PropMaterials){
  const g=new THREE.Group(),L=t.length,D=t.depth,H=t.height;
  // 端架与横梁支撑桌面，腿部和桌下空间可见。
  for(const s of [-1,1]){
    g.add(mesh(rbox(.09,H-.1,D-.12,.008),m.woodDark,s*(L/2-.24),(H-.1)/2,0));
    g.add(mesh(rbox(.22,.04,D-.04,.004),m.woodDark,s*(L/2-.24),.02,0));
  }
  g.add(mesh(rbox(L-.48,.07,.1,.005),m.woodDark,0,.55,D*.25));
  const cloth=t.side==='pro'?m.clothPro:t.side==='con'?m.clothCon:m.clothJudge;
  // 薄台面与浅灰挡板；队色只占窄条，不铺满整面。
  g.add(mesh(rbox(L+.08,.1,D+.08,.008),m.wood,0,H-.05,0));
  g.add(mesh(rbox(L-.16,.4,.06,.006),m.stone,0,H-.34,D/2-.03));
  const label=t.side==='pro'?'正方':t.side==='con'?'反方':'评委';
  const panel=textCanvas(1024,192,c=>{c.fillStyle='#b3a78f';c.fillRect(0,0,1024,192);
    c.fillStyle=cloth.color.getStyle();c.fillRect(0,0,1024,12);
    c.font=`700 104px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.fillText(label,512,110);});
  const panelMaterial=new THREE.MeshStandardMaterial({map:panel,roughness:.88});m.owned.push(panel,panelMaterial);
  g.add(mesh(new THREE.PlaneGeometry(L-.2,.36),panelMaterial,0,H-.32,D/2+.003,false));
  // 台面两端的小型条形工作灯，底座贴桌，不再摆传统灯笼。
  for(const s of [-1,1]){
    const lantern=new THREE.Group();lantern.position.set(s*(L/2-.26),H+.005,0);
    lantern.add(mesh(rbox(.16,.01,.1,.003),m.woodDark),mesh(rbox(.018,.13,.018,.002),m.woodDark,0,.07,-.025),mesh(rbox(.22,.028,.09,.003),m.woodDark,0,.14,0),mesh(rbox(.19,.008,.07,.002),m.flame,0,.121,0,false));
    g.add(lantern);
  }
  g.position.set(...t.center);g.rotation.y=t.skirtYaw;return g;
}
