import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox} from './geometry';
/** 金属框会议椅，队色坐垫保持席位识别；座面与靠背高度沿用人物动作基准。 */
export function createChair(c:Room['layout']['chairs'][number],m:PropMaterials){
  const g=new THREE.Group(),cushion=c.side==='pro'?m.clothPro:c.side==='con'?m.clothCon:m.clothJudge;
  g.add(mesh(rbox(.46,.05,.46,.006),m.woodDark,0,.475,0));
  for(const sx of [-1,1])for(const sz of [-1,1])g.add(mesh(rbox(.055,.45,.055,.004),m.woodDark,sx*.2,.25,sz*.2));
  g.add(mesh(rbox(.42,.06,.42,.006),cushion,0,.53,0));
  g.add(mesh(rbox(.46,.6,.06,.006),m.woodDark,0,.8,-.21));
  g.add(mesh(rbox(.4,.52,.045,.006),cushion,0,.82,-.17));
  g.position.set(...c.position);g.rotation.y=c.yaw;return g;
}
