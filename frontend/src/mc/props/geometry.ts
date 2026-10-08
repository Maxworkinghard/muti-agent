import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export type Keep=<T extends THREE.Material|THREE.Texture>(x:T)=>T;
/** 平色零件合并后仍保留逐顶点的原色和粗糙度。 */
export function createFlatBatch(){
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  mat.onBeforeCompile=shader=>{shader.vertexShader='attribute float flatRoughness;varying float vFlatRoughness;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFlatRoughness=flatRoughness;');shader.fragmentShader='varying float vFlatRoughness;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vFlatRoughness;');};
  mat.customProgramCacheKey=()=>'mc-flat-batch';return mat;
}
export const FONT='"PingFang SC","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';
export const rbox=(w:number,h:number,d:number,r=.01,seg=3)=>new RoundedBoxGeometry(w,h,d,seg,Math.max(.0005,Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4)));
export function mesh(geo:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0,cast=true){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;return m;}
export function textCanvas(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void){const el=document.createElement('canvas');el.width=w;el.height=h;draw(el.getContext('2d')!);const t=new THREE.CanvasTexture(el);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
/**
 * 不会动的零件按材质合并成一个网格（相对 base 的坐标）：几百个小零件各画一次太慢，
 * 每多一遍阴影或环境光遮蔽就多几百次绘制。会动的部件（dynamic 里的）和它们的子物体不合并。
 */
export function mergeStatic(base:THREE.Object3D,dynamic:ReadonlySet<THREE.Object3D>=new Set(),flatMaterial?:THREE.MeshStandardMaterial){
  base.updateMatrixWorld(true);
  const inverse=base.matrixWorld.clone().invert(),buckets=new Map<string,{material:THREE.Material;cast:boolean;meshes:THREE.Mesh[]}>();
  const visit=(o:THREE.Object3D)=>{for(const child of o.children){if(dynamic.has(child))continue;
    if(child instanceof THREE.Mesh&&!Array.isArray(child.material)&&child.renderOrder===0&&!child.children.length){
      const mat=child.material,flat=!!flatMaterial&&mat instanceof THREE.MeshStandardMaterial&&!mat.map&&!mat.normalMap&&!mat.roughnessMap&&!mat.metalnessMap&&!mat.alphaMap&&!mat.transparent&&mat.opacity===1&&mat.alphaTest===0&&mat.metalness===0&&mat.emissive.getHex()===0&&!mat.vertexColors&&mat.side===THREE.FrontSide&&mat.onBeforeCompile===THREE.Material.prototype.onBeforeCompile;
      const material=flat?flatMaterial!:mat,key=material.uuid+':'+child.castShadow;
      const bucket=buckets.get(key)??{material,cast:child.castShadow,meshes:[] as THREE.Mesh[]};bucket.meshes.push(child);buckets.set(key,bucket);
    }
    visit(child);}};
  visit(base);
  for(const {material,cast,meshes} of buckets.values()){if(meshes.length<2)continue;
    const geometries=meshes.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();for(const name of Object.keys(g.attributes))if(!['position','normal','uv','propGlow','color','flatRoughness'].includes(name))g.deleteAttribute(name);
      if(material===flatMaterial){const source=m.material as THREE.MeshStandardMaterial,n=g.getAttribute('position').count,colors=new Float32Array(n*3),roughness=new Float32Array(n);for(let i=0;i<n;i++){colors.set(source.color.toArray(),i*3);roughness[i]=source.roughness;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('flatRoughness',new THREE.BufferAttribute(roughness,1));}
      g.clearGroups();return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld));});
    const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;
    for(const m of meshes)m.removeFromParent();
    const one=new THREE.Mesh(merged,material);one.castShadow=cast;one.receiveShadow=true;base.add(one);}
}
export function teamColor(side:string){return side==='pro'?'#3d8bff':side==='con'?'#ff4d9a':'#f0c84a';}
