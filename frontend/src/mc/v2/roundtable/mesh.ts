/**
 * 带贴图坐标的合并方块（可以绕竖轴转）：驳岸叠石、粉墙、楼亭的方块屋面、石拱桥都用它拼，
 * 一种材质一个网格，贴图按每米 px 像素平铺（和方块世界一样默认 16），顶点色给每块一点深浅差别。
 */
import * as THREE from 'three';
import type {Painter} from '../../style';
import type {V2Kit} from '../kit';
import {canvasOf} from '../pixel';

const cache=new WeakMap<V2Kit,Map<string,THREE.MeshStandardMaterial>>();
/** 方块贴图同一张画做成道具材质（最近邻、平铺、开顶点色，给 TexBoxes 用），按名字缓存在这间房里。 */
export function paintedMaterial(k:V2Kit,key:string,painter:Painter,o:{rough?:number;side?:THREE.Side;size?:number}={}){
  let m0=cache.get(k);if(!m0){m0=new Map();cache.set(k,m0);}const hit=m0.get(key);if(hit)return hit;
  const t=new THREE.CanvasTexture(canvasOf(painter,o.size??16));t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  const m=new THREE.MeshStandardMaterial({map:t,vertexColors:true,roughness:o.rough??.9,metalness:0,side:o.side??THREE.FrontSide});k.owned.push(t,m);m0.set(key,m);return m;
}

export class TexBoxes {
  private pos:number[]=[];private nor:number[]=[];private uv:number[]=[];private col:number[]=[];private idx:number[]=[];
  constructor(private px=16){}
  get empty(){return this.idx.length===0;}
  /**
   * 盒子：中心 (cx, cy, cz)、尺寸 w×h×d（转之前 x、y、z 方向），绕竖轴转 yaw；tint 乘到贴图上（顶面用 tint，侧面再暗一点）。
   * faces 去掉看不见的面（'bottom' 等）。
   */
  add(cx:number,cy:number,cz:number,w:number,h:number,d:number,yaw=0,tint=new THREE.Color(1,1,1),skip:ReadonlyArray<'top'|'bottom'|'px'|'nx'|'pz'|'nz'>=['bottom']){
    const c=Math.cos(yaw),s=Math.sin(yaw),k=this.px/16,hw=w/2,hh=h/2,hd=d/2;
    // 每块的贴图起点按位置错开整像素，一排同样大小的石块不会是同一张图
    const hsh=Math.abs(Math.sin(cx*12.9898+cz*78.233+cy*37.719)*43758.5453),u0=Math.floor((hsh%1)*16)/16,v0=Math.floor((hsh*7.31%1)*16)/16;
    const P=(x:number,y:number,z:number)=>[cx+x*c+z*s,cy+y,cz-x*s+z*c];
    const R=(x:number,z:number)=>[x*c+z*s,0,-x*s+z*c];
    const faces:Array<[string,number[],number[][],number,number,number]>=[
      ['top',[0,1,0],[P(-hw,hh,hd),P(hw,hh,hd),P(hw,hh,-hd),P(-hw,hh,-hd)],w,d,1],
      ['bottom',[0,-1,0],[P(-hw,-hh,-hd),P(hw,-hh,-hd),P(hw,-hh,hd),P(-hw,-hh,hd)],w,d,.7],
      ['pz',R(0,1),[P(-hw,-hh,hd),P(hw,-hh,hd),P(hw,hh,hd),P(-hw,hh,hd)],w,h,.9],
      ['nz',R(0,-1),[P(hw,-hh,-hd),P(-hw,-hh,-hd),P(-hw,hh,-hd),P(hw,hh,-hd)],w,h,.9],
      ['px',R(1,0),[P(hw,-hh,hd),P(hw,-hh,-hd),P(hw,hh,-hd),P(hw,hh,hd)],d,h,.84],
      ['nx',R(-1,0),[P(-hw,-hh,-hd),P(-hw,-hh,hd),P(-hw,hh,hd),P(-hw,hh,-hd)],d,h,.84],
    ];
    for(const [name,n,ps,fw,fh,shade] of faces){if(skip.includes(name as 'top'))continue;const base=this.pos.length/3;
      const us=[[u0,v0],[u0+fw*k,v0],[u0+fw*k,v0+fh*k],[u0,v0+fh*k]];
      ps.forEach((p,i)=>{this.pos.push(p[0],p[1],p[2]);this.nor.push(n[0],n[1],n[2]);this.uv.push(us[i][0],us[i][1]);this.col.push(tint.r*shade,tint.g*shade,tint.b*shade);});
      this.idx.push(base,base+1,base+2,base,base+2,base+3);}
  }
  geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setIndex(this.idx);g.computeBoundingSphere();return g;}
  /** 做成一个网格（材质要开顶点色：vertexColors:true） */
  mesh(material:THREE.Material,name:string,cast=true){const m=new THREE.Mesh(this.geometry(),material);m.name=name;m.castShadow=cast;m.receiveShadow=true;return m;}
}

/**
 * 方块屋面：在矩形范围里按 cell 米一格立一根瓦柱，柱顶高度 height(x, z) 量化成 step 一级（一层层的瓦，和方块世界一个语言），
 * 柱子只有 thick 厚（屋面是一层壳，底面露出来就是檐下）。heights 返回 null 的格子不立。
 */
export function voxelRoof(b:TexBoxes,x0:number,x1:number,z0:number,z1:number,height:(x:number,z:number)=>number|null,o:{cell?:number;step?:number;thick?:number;tint?:THREE.Color}={}){
  const cell=o.cell??.25,step=o.step??.125,thick=o.thick??.2,nx=Math.round((x1-x0)/cell);
  // 每一排（z）从西往东扫，相邻格子顶高一样就并成一根长条；一排一排之间的高差就是一级级的瓦
  for(let z=z0;z<z1-1e-6;z+=cell){let start=-1,run:number|null=null;
    const flush=(end:number)=>{if(run!==null&&start>=0){const w=(end-start)*cell;b.add(x0+start*cell+w/2,run-thick/2,z+cell/2,w,thick,cell,0,o.tint,['bottom']);}};
    for(let i=0;i<=nx;i++){const h=i<nx?height(x0+(i+.5)*cell,z+cell/2):null,top=h===null?null:Math.round(h/step)*step;
      if(top!==run){flush(i);run=top;start=i;}}}
}
/** 凹曲的屋面坡（0 在檐口、1 在屋脊）：近檐口缓、近屋脊陡；脊上一点点卷棚的圆 */
export const roofCurve=(t:number)=>{const u=Math.min(1,Math.max(0,t));return u<.88?Math.pow(u,1.55):Math.pow(.88,1.55)+(1-Math.pow(.88,1.55))*Math.sin((u-.88)/.12*Math.PI/2);};
