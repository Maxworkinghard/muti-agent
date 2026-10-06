import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,textCanvas} from './geometry';
/**
 * 像素风的辩论桌，照 2D 参照图做（第 12.12 节「桌子」）：一整块有分量的长方体，
 * 朝场内的一整面是队色面板，面板上用游戏字体写队名；木色桌面略微出沿；
 * 两端各一个木色端头方墩，上面一盏灯笼（既装饰也补桌面的光）。
 * 尺寸按游戏人物的比例：桌面高 0.95、厚 0.14、深 1。
 */
export function createTable(t:Room['layout']['tables'][number],m:PropMaterials){
  const g=new THREE.Group(),L=t.length,D=t.depth,H=t.height;
  // 朝场内的一面有分量，坐人一侧留出腿部空间，端头方墩托住整块桌面。
  g.add(mesh(rbox(L,H-.14,D*.45,.008),m.woodDark,0,(H-.14)/2,D*.275));
  const cloth=t.side==='pro'?m.clothPro:t.side==='con'?m.clothCon:m.clothJudge;
  // 桌面：木色，往前后各出沿 4 厘米。
  g.add(mesh(rbox(L+.08,.14,D+.08,.008),m.wood,0,H-.07,0));
  // 队色面板：朝场内一整面，中间用游戏字体写队名（正方/反方/评委）。
  const label=t.side==='pro'?'正方':t.side==='con'?'反方':'评委';
  const panel=textCanvas(1024,192,c=>{c.fillStyle=cloth.color?.getStyle()??'#4e79a1';c.fillRect(0,0,1024,192);
    c.fillStyle='rgba(255,255,255,.12)';c.fillRect(0,0,1024,10);c.fillRect(0,182,1024,10);
    c.fillStyle='#f6f2e8';c.font=`700 120px "MCFont"`;c.textAlign='center';c.textBaseline='middle';
    for(let i=0;i<label.length;i++)c.fillText(label[i],512+(i-(label.length-1)/2)*190,104);});
  const panelMaterial=new THREE.MeshStandardMaterial({map:panel,roughness:.92});m.owned.push(panel,panelMaterial);
  g.add(mesh(new THREE.PlaneGeometry(L-.3,H-.4),panelMaterial,0,H/2-.03,D/2+.002,false));
  // 端头方墩：木色，比桌面略窄，顶上贴着桌面；一盏小灯笼（装饰，像素风）。
  for(const s of [-1,1]){
    g.add(mesh(rbox(.52,H,.62,.008),m.wood,s*(L/2-.26),H/2,0));
    const lantern=new THREE.Group();lantern.position.set(s*(L/2-.26),H+.13,0);
    lantern.add(mesh(rbox(.15,.05,.15,.004),m.brassDark,0,.02,0),mesh(rbox(.11,.14,.11,.004),m.flame,0,.11,0,false),mesh(rbox(.13,.03,.13,.004),m.brassDark,0,.19,0));
    g.add(lantern);
  }
  g.position.set(...t.center);g.rotation.y=t.skirtYaw;return g;
}
