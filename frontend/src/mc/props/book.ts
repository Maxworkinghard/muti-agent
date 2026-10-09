import * as THREE from 'three';
import {mesh,rbox} from './geometry';
/** 人物共用的书与笔，保留圆桌及人物动作所需的物品几何。 */
export function createHandBook(assets?:{itemAtlas:{width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>};itemTexture:THREE.Texture},shared=(name:string,make:()=>THREE.MeshStandardMaterial)=>make()):THREE.Group {
  const g=new THREE.Group();
  const tile=assets?.itemAtlas.textures['item/writable_book'];
  if(assets&&tile){
    const uv=(geo:THREE.BufferGeometry)=>{const uvA=geo.getAttribute('uv');for(let i=0;i<uvA.count;i++)uvA.setXY(i,(tile.x+uvA.getX(i)*tile.width)/assets.itemAtlas.width,1-(tile.y+(1-uvA.getY(i))*tile.height)/assets.itemAtlas.height);return geo;};
    const mat=shared('item:'+assets.itemTexture.uuid,()=>new THREE.MeshStandardMaterial({map:assets.itemTexture,alphaTest:.1,side:THREE.DoubleSide,roughness:.9}));
    for(const ry of [0,Math.PI/2]){const quad=mesh(uv(new THREE.PlaneGeometry(.24,.24)),mat,0,.12,0,false);quad.rotation.y=ry;quad.castShadow=false;g.add(quad);}
  }else{
    g.add(mesh(rbox(.2,.03,.26,.004),shared('cover',()=>new THREE.MeshStandardMaterial({color:'#6b4a37',roughness:.9})),0,.02,0,false));
    g.add(mesh(rbox(.17,.012,.23,.004),shared('paper',()=>new THREE.MeshStandardMaterial({color:'#f6f2e8',roughness:.9})),0,.045,0,false));
  }
  const pen=new THREE.Group();pen.name='pen';pen.userData.pen=true;
  pen.add(mesh(new THREE.CylinderGeometry(.006,.006,.13,8),shared('pen',()=>new THREE.MeshStandardMaterial({color:'#3d3a42',roughness:.8})),0,0,0,false));
  g.add(pen);
  g.userData.pen=pen;
  return g;
}
