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
      if(c.style!=='stool')this.colliders.push({id:c.id,center:rotated(0,.8,-.21),half:new THREE.Vector3(.23,.3,.04),yaw:c.yaw});
    }
  }
  private horizontal(c:Collider,x:number,z:number,r:number){
    const dx=x-c.center.x,dz=z-c.center.z,cos=Math.cos(c.yaw),sin=Math.sin(c.yaw);
    const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
    return Math.hypot(Math.max(0,Math.abs(lx)-c.half.x),Math.max(0,Math.abs(lz)-c.half.z))<r;
  }
  /** 工位走访在真实墙、桌椅之间找路径，不能从桌子和隔断里穿过去。 */
  path(from:[number,number,number],to:[number,number,number]):[number,number,number][] {
    const step=.5,{min,max}=this.room.bounds,cols=Math.ceil((max[0]-min[0])/step),rows=Math.ceil((max[2]-min[2])/step);
    // 办公室场景需要更大的忽略半径，因为座位可能沿着走访路径排列
    const ignoreRadius=this.room.kind==='office'?5:0.7;
    const ignored=new Set(this.room.layout.chairs.filter(c=>[from,to].some(p=>Math.hypot(p[0]-c.position[0],p[2]-c.position[2])<ignoreRadius)).map(c=>c.id));
    const valid=(x:number,z:number)=>x>min[0]+.35&&x<max[0]-.35&&z>min[2]+.35&&z<max[2]-.35&&!this.colliders.some(c=>!ignored.has(c.id)&&c.center.y+c.half.y>1.03&&c.center.y-c.half.y<2.85&&this.horizontal(c,x,z,.31));
    const id=(x:number,z:number)=>z*cols+x,point=(n:number):[number,number,number]=>[min[0]+(n%cols+.5)*step,1,min[2]+(Math.floor(n/cols)+.5)*step];
    const cell=(p:number[])=>{const x=Math.floor((p[0]-min[0])/step),z=Math.floor((p[2]-min[2])/step);let chosen=-1,best=Infinity;
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const xx=x+dx,zz=z+dz;if(xx<0||xx>=cols||zz<0||zz>=rows)continue;const n=id(xx,zz),v=point(n),d=Math.hypot(v[0]-p[0],v[2]-p[2]);
        if(d>=best||!valid(v[0],v[2]))continue;let clear=true;for(let t=0;t<=1;t+=.1)if(!valid(v[0]+(p[0]-v[0])*t,v[2]+(p[2]-v[2])*t)){clear=false;break;}if(clear){chosen=n;best=d;}}
      return chosen;};
    const start=cell(from),goal=cell(to),open=new Set([start]),came=new Map<number,number>(),cost=new Map([[start,0]]);
    if(start<0||goal<0)return [];
    const heuristic=(n:number)=>{const p=point(n);return Math.hypot(p[0]-to[0],p[2]-to[2]);};
    let found=false;
    for(let guard=0;open.size&&guard<cols*rows*3;guard++){
      let current=-1,best=Infinity;for(const n of open){const score=cost.get(n)!+heuristic(n);if(score<best){best=score;current=n;}}
      if(current===goal){found=true;break;}open.delete(current);const x=current%cols,z=Math.floor(current/cols);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const xx=x+dx,zz=z+dz;if(xx<0||xx>=cols||zz<0||zz>=rows)continue;const n=id(xx,zz),p=point(n),mid=point(current);
        if(!valid(p[0],p[2])||!valid((p[0]+mid[0])/2,(p[2]+mid[2])/2))continue;
        const g=cost.get(current)!+Math.hypot(dx,dz)*step;if(g>=(cost.get(n)??Infinity))continue;came.set(n,current);cost.set(n,g);open.add(n);
      }
    }
    if(!found)return [];
    const route:number[]=[goal];while(route.at(-1)!==start){const p=came.get(route.at(-1)!);if(p===undefined)return [];route.push(p);}
    const raw=[...route.reverse().map(point),[...to] as [number,number,number]],compact:[number,number,number][]=[];
    for(let i=0;i<raw.length;i++){const prev=i?raw[i-1]:from,p=raw[i],next=raw[i+1];if(next&&Math.abs((p[0]-prev[0])*(next[2]-p[2])-(p[2]-prev[2])*(next[0]-p[0]))<.0001&&i>0)continue;compact.push(p);}return compact;
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
