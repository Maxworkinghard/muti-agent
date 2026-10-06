import * as THREE from 'three';
import type {Assets} from '../assets';
import {blockModels,resolveModel,transformPoint} from '../blockModel';
import {propBoxes,type Room} from './debate';

export interface Collider {id:string;center:THREE.Vector3;half:THREE.Vector3;yaw:number}
export interface BodyObstacle {x:number;y:number;z:number;radius:number;height:number}
/** 用渲染的方块模型和家具尺寸检查脚底、身体与镜头，地板只托住脚，不挡住身体。 */
export class RoomPhysics {
  readonly colliders:Collider[]=[];
  readonly radius=.28;
  readonly height=1.875;
  constructor(private room:Room,assets:Pick<Assets,'states'|'models'>){
    for(const b of [...room.blocks,...room.ceiling])for(const ref of blockModels(assets,b)){
      const model=resolveModel(assets.models,ref.model);
      for(const e of model.elements??[]){
        const points:THREE.Vector3[]=[];
        for(const x of [e.from[0],e.to[0]])for(const y of [e.from[1],e.to[1]])for(const z of [e.from[2],e.to[2]])
          points.push(transformPoint([x/16,y/16,z/16],e,ref).add(new THREE.Vector3(b.x,b.y,b.z)));
        const box=new THREE.Box3().setFromPoints(points);
        this.colliders.push({id:b.id,center:box.getCenter(new THREE.Vector3()),half:box.getSize(new THREE.Vector3()).multiplyScalar(.5),yaw:0});
      }
    }
    for(const p of propBoxes(room))this.colliders.push({id:p.id,center:new THREE.Vector3(...p.center),half:new THREE.Vector3(...p.half),yaw:p.yaw});
    for(const c of room.layout.chairs){
      // 坐垫和靠背分别检查，空的椅子可以绕开，不用整个包围盒封住椅腿间的空隙。
      const rotated=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),c.yaw).add(new THREE.Vector3(...c.position));
      this.colliders.push({id:c.id,center:rotated(0,.5,0),half:new THREE.Vector3(.23,.09,.23),yaw:c.yaw});
      this.colliders.push({id:c.id,center:rotated(0,.8,-.21),half:new THREE.Vector3(.23,.3,.04),yaw:c.yaw});
    }
  }
  private horizontal(c:Collider,x:number,z:number,r:number){
    const dx=x-c.center.x,dz=z-c.center.z,cos=Math.cos(c.yaw),sin=Math.sin(c.yaw);
    const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
    return Math.hypot(Math.max(0,Math.abs(lx)-c.half.x),Math.max(0,Math.abs(lz)-c.half.z))<r;
  }
  groundAt(x:number,z:number,ceiling:number,ignore?:string){
    let top=1;
    for(const c of this.colliders){if(c.id===ignore||!this.horizontal(c,x,z,this.radius-.02))continue;
      const y=c.center.y+c.half.y;if(y<=ceiling+.001&&y>top)top=y;
    }
    return top;
  }
  canOccupy(p:THREE.Vector3,people:BodyObstacle[]=[],ignore?:string){
    const {min,max}=this.room.bounds;
    if(p.x<min[0]+this.radius||p.x>max[0]-this.radius||p.z<min[2]+this.radius||p.z>max[2]-this.radius)return false;
    for(const c of this.colliders){if(c.id===ignore)continue;
      if(c.center.y+c.half.y>p.y+.025&&c.center.y-c.half.y<p.y+this.height-.025&&this.horizontal(c,p.x,p.z,this.radius))return false;
    }
    return !people.some(a=>a.y+a.height>p.y+.025&&a.y<p.y+this.height&&Math.hypot(p.x-a.x,p.z-a.z)<this.radius+a.radius);
  }
  move(p:THREE.Vector3,dx:number,dz:number,people:BodyObstacle[]=[],ignore?:string,step=true){
    const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));
    const tryMove=(x:number,z:number)=>{const next=p.clone().add(new THREE.Vector3(x,0,z));
      const ground=this.groundAt(next.x,next.z,p.y+(step?.6:.02),ignore);next.y=Math.max(p.y,ground);
      if(!this.canOccupy(next,people,ignore))return false;p.copy(next);return true;};
    for(let i=0;i<n;i++)if(!tryMove(dx/n,dz/n)){tryMove(dx/n,0);tryMove(0,dz/n);}
    return p;
  }
  pointBlocked(p:THREE.Vector3,r=.16){
    return this.colliders.some(c=>p.y>c.center.y-c.half.y-r&&p.y<c.center.y+c.half.y+r&&this.horizontal(c,p.x,p.z,r));
  }
  cameraBlocked(p:THREE.Vector3,r=.34){
    const {min,max}=this.room.bounds;
    if(p.x<min[0]+r||p.x>max[0]-r||p.y<min[1]+r||p.y>max[1]-r||p.z<min[2]+r||p.z>max[2]-r)return true;
    for(const c of this.colliders){
      // 墙体和屋顶按整块判断；坐垫、靠背这类薄片放宽到只在同一高度才挡镜头。
      if(c.id.includes('chair'))continue;
      if(p.y>c.center.y-c.half.y-r&&p.y<c.center.y+c.half.y+r&&this.horizontal(c,p.x,p.z,r))return true;
    }
    return false;
  }
  /** 分小步扫过路径，碰到墙或桌椅沿空闲方向滑动；加速也不能穿过薄墙。 */
  moveCamera(p:THREE.Vector3,delta:THREE.Vector3){
    const n=Math.max(1,Math.ceil(delta.length()/.12)),step=delta.clone().multiplyScalar(1/n),next=new THREE.Vector3();
    for(let i=0;i<n;i++){
      next.copy(p).add(step);
      if(!this.cameraBlocked(next)){p.copy(next);continue;}
      for(const axis of ['x','z','y'] as const){next.copy(p);next[axis]+=step[axis];if(!this.cameraBlocked(next))p.copy(next);}
    }
    return p;
  }
}
