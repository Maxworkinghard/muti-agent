/**
 * v2 的道具工具：方块语言的零件（带像素贴图的长方体、八棱柱），贴图按每米 16 像素平铺，
 * 和方块世界同一个像素密度。材质按名字缓存，交给道具层统一释放、统一挂环境反射。
 */
import * as THREE from 'three';
import type {Painter} from '../style';
import {canvasOf} from './pixel';

export interface V2Kit {
  /** 名字 → 平铺像素材质（第一次用时生成） */
  mat(name:string,painter:Painter,opts?:{rough?:number;glow?:number;size?:number;transparent?:boolean;color?:string;fog?:boolean;side?:THREE.Side}):THREE.MeshStandardMaterial;
  /** 平色材质（远景、发光体） */
  flat(color:string,opts?:{rough?:number;glow?:number;emissive?:string;fog?:boolean;vertex?:boolean;side?:THREE.Side;opacity?:number}):THREE.MeshStandardMaterial;
  /** 长方体：中心坐标，贴图按面的实际尺寸平铺（px 每米像素） */
  box(parent:THREE.Object3D,w:number,h:number,d:number,m:THREE.Material|THREE.Material[],x?:number,y?:number,z?:number,px?:number):THREE.Mesh;
  /** 棱柱（sides=8 是八角），中心坐标 */
  prism(parent:THREE.Object3D,r:number,h:number,sides:number,m:THREE.Material|THREE.Material[],x?:number,y?:number,z?:number,px?:number,rot?:number):THREE.Mesh;
  owned:Array<THREE.Material|THREE.Texture>;
}
export function createV2Kit(owned:Array<THREE.Material|THREE.Texture>):V2Kit{
  const cache=new Map<string,THREE.MeshStandardMaterial>();
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  const kit:V2Kit={owned,
    mat(name,painter,o={}){const key=name+'|'+JSON.stringify(o);let m=cache.get(key);if(m)return m;
      const t=keep(new THREE.CanvasTexture(canvasOf(painter,o.size??16)));t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;
      m=keep(new THREE.MeshStandardMaterial({map:t,color:o.color??'#ffffff',roughness:o.rough??.9,metalness:0,transparent:!!o.transparent,alphaTest:o.transparent?0:.1,emissive:o.glow?'#ffffff':'#000000',emissiveMap:o.glow?t:null,emissiveIntensity:o.glow??0,fog:o.fog??true,side:o.side??THREE.FrontSide}));cache.set(key,m);return m;},
    flat(color,o={}){const key='flat|'+color+'|'+JSON.stringify(o);let m=cache.get(key);if(m)return m;
      m=keep(new THREE.MeshStandardMaterial({color,roughness:o.rough??.95,metalness:0,emissive:o.emissive??(o.glow?color:'#000000'),emissiveIntensity:o.glow??0,fog:o.fog??true,vertexColors:!!o.vertex,side:o.side??THREE.FrontSide,transparent:o.opacity!==undefined,opacity:o.opacity??1}));cache.set(key,m);return m;},
    box(parent,w,h,d,m,x=0,y=0,z=0,px=16){const g=new THREE.BoxGeometry(w,h,d),uv=g.getAttribute('uv'),k=px/16;
      const size:[number,number][]=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];for(let f=0;f<6;f++)for(let i=f*4;i<f*4+4;i++)uv.setXY(i,uv.getX(i)*size[f][0]*k,uv.getY(i)*size[f][1]*k);
      const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;},
    prism(parent,r,h,sides,m,x=0,y=0,z=0,px=16,rot=Math.PI/sides){const g=new THREE.CylinderGeometry(r,r,h,sides,1,false,rot),uv=g.getAttribute('uv'),k=px/16,idx=g.getIndex()!,seen=new Set<number>();
      for(const gr of g.groups)for(let i=gr.start;i<gr.start+gr.count;i++){const v=idx.getX(i);if(seen.has(v))continue;seen.add(v);if(gr.materialIndex===0)uv.setXY(v,uv.getX(v)*Math.PI*2*r*k,uv.getY(v)*h*k);else uv.setXY(v,uv.getX(v)*2*r*k,uv.getY(v)*2*r*k);}
      g.computeVertexNormals();const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;},
  };
  return kit;
}
/** 放到某处、绕竖轴转。 */
export const place=<T extends THREE.Object3D>(o:T,x:number,y:number,z:number,yaw=0)=>{o.position.set(x,y,z);o.rotation.y=yaw;return o;};
/** 把一组盒子按顶点颜色合并成一个网格（远景：树林、山、云），一次绘制。 */
export class ColorBoxes {
  private pos:number[]=[];private col:number[]=[];private nor:number[]=[];private idx:number[]=[];
  /** 轴对齐盒子，min/max 角点；top/side/bottom 三种颜色（顶面亮、侧面次之、底面暗）。skipBottom 省掉看不见的底面。 */
  add(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,top:THREE.Color,side:THREE.Color,bottom?:THREE.Color,skipBottom=true){
    const faces:Array<[number[],number[][],THREE.Color]>=[
      [[0,1,0],[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],top],
      [[0,0,1],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],side],
      [[0,0,-1],[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],side],
      [[1,0,0],[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],side.clone().multiplyScalar(.9)],
      [[-1,0,0],[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],side.clone().multiplyScalar(.9)],
    ];
    if(!skipBottom)faces.push([[0,-1,0],[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],bottom??side]);
    for(const [n,ps,c] of faces){const base=this.pos.length/3;for(const p of ps){this.pos.push(...p);this.nor.push(...n);this.col.push(c.r,c.g,c.b);}this.idx.push(base,base+1,base+2,base,base+2,base+3);}
  }
  geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setIndex(this.idx);g.computeBoundingSphere();return g;}
  get count(){return this.idx.length/6;}
}
