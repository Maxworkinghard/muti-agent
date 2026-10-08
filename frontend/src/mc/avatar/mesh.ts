import * as THREE from 'three';
import type {Rect} from './paint';
/** 一个盒子六个面的贴图：画好的区域（按“从外面看”的方向：u 向右、v 向下），或 null（看不见的面，省掉） */
export interface Faces {px?:Rect|null;nx?:Rect|null;py?:Rect|null;ny?:Rect|null;pz?:Rect|null;nz?:Rect|null}
type V3=[number,number,number];
/** 每个面：左上角、u 方向、v 方向（单位向量，乘以面的尺寸） */
const FACE:Record<keyof Faces,(a:V3,b:V3)=>{o:V3;u:V3;v:V3;n:V3}>={
  pz:(a,b)=>({o:[a[0],b[1],b[2]],u:[b[0]-a[0],0,0],v:[0,a[1]-b[1],0],n:[0,0,1]}),
  nz:(a,b)=>({o:[b[0],b[1],a[2]],u:[a[0]-b[0],0,0],v:[0,a[1]-b[1],0],n:[0,0,-1]}),
  px:(a,b)=>({o:[b[0],b[1],b[2]],u:[0,0,a[2]-b[2]],v:[0,a[1]-b[1],0],n:[1,0,0]}),
  nx:(a,b)=>({o:[a[0],b[1],a[2]],u:[0,0,b[2]-a[2]],v:[0,a[1]-b[1],0],n:[-1,0,0]}),
  py:(a,b)=>({o:[a[0],b[1],a[2]],u:[b[0]-a[0],0,0],v:[0,0,b[2]-a[2]],n:[0,1,0]}),
  ny:(a,b)=>({o:[a[0],a[1],b[2]],u:[b[0]-a[0],0,0],v:[0,0,a[2]-b[2]],n:[0,-1,0]}),
};
/** 把一堆盒子写进同一份几何体：坐标单位 T（最后统一缩放成米），每个顶点挂一根骨头。 */
export class Mesher {
  private pos:number[]=[];private nor:number[]=[];private uv:number[]=[];private si:number[]=[];private idx:number[]=[];
  constructor(private size:number){}
  get boxes(){return this.count;}private count=0;
  /** solid：所有面都用同一个纯色格（UV 收到格子中心） */
  box(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,bone:number,faces:Faces|Rect,solid=false){
    if(x1<=x0||y1<=y0||z1<=z0)return;this.count++;
    const all='x' in faces?faces as Rect:null,S=this.size;
    for(const k of ['px','nx','py','ny','pz','nz'] as const){
      const r=all??(faces as Faces)[k];if(!r)continue;
      const {o,u,v,n}=FACE[k]([x0,y0,z0],[x1,y1,z1]),base=this.pos.length/3;
      const corners:Array<[number,number]>=[[0,0],[1,0],[1,1],[0,1]];
      for(const [s,t] of corners){this.pos.push(o[0]+u[0]*s+v[0]*t,o[1]+u[1]*s+v[1]*t,o[2]+u[2]*s+v[2]*t);this.nor.push(...n);
        if(solid||all)this.uv.push((r.x+r.w/2)/S,1-(r.y+r.h/2)/S);else this.uv.push((r.x+s*r.w)/S,1-(r.y+t*r.h)/S);
        this.si.push(bone);}
      this.idx.push(base,base+3,base+2,base,base+2,base+1);
    }
  }
  geometry(skinned:boolean){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    if(skinned){const n=this.si.length,ind=new Uint16Array(n*4),w=new Float32Array(n*4);for(let i=0;i<n;i++){ind[i*4]=this.si[i];w[i*4]=1;}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ind,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w,4));}
    g.setIndex(this.idx);g.computeBoundingSphere();return g;}
}
