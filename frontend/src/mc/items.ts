import * as THREE from 'three';
import {resolveModel} from './blockModel';
import type {Assets} from './assets';
/** Front/back plus the exposed edge of every opaque pixel, one mesh per held item. */
export function createItem(assets:Assets,id='writable_book',display='thirdperson_righthand'):THREE.Mesh {
  const model=resolveModel(assets.itemModels,'item/'+id),ref=model.textures?.layer0;const texture=typeof ref==='string'?ref.replace('minecraft:',''):ref?.sprite.replace('minecraft:','');
  const tile=assets.itemAtlas.textures[texture??'item/'+id];if(!tile)throw new Error('缺少物品贴图：'+id);
  const canvas=document.createElement('canvas');canvas.width=tile.width;canvas.height=tile.width;const ctx=canvas.getContext('2d')!;ctx.drawImage(assets.itemTexture.image as CanvasImageSource,tile.x,tile.y,tile.width,tile.width,0,0,tile.width,tile.width);const pixels=ctx.getImageData(0,0,tile.width,tile.width).data;
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  const add=(points:number[][],coords:number[][])=>{const base=pos.length/3;points.forEach((p,i)=>{pos.push(...p);uv.push((tile.x+coords[i][0])/assets.itemAtlas.width,1-(tile.y+coords[i][1])/assets.itemAtlas.height);});indices.push(base,base+1,base+2,base,base+2,base+3);};
  const n=tile.width,d=1/32;
  add([[-.5,-.5,d],[.5,-.5,d],[.5,.5,d],[-.5,.5,d]],[[0,n],[n,n],[n,0],[0,0]]);add([[.5,-.5,-d],[-.5,-.5,-d],[-.5,.5,-d],[.5,.5,-d]],[[n,n],[0,n],[0,0],[n,0]]);
  const opaque=(x:number,y:number)=>x>=0&&x<n&&y>=0&&y<n&&pixels[(y*n+x)*4+3]>0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(opaque(x,y)){const l=x/n-.5,r=(x+1)/n-.5,t=.5-y/n,b=.5-(y+1)/n;for(const [dx,dy,points] of [[-1,0,[[l,b,-d],[l,b,d],[l,t,d],[l,t,-d]]],[1,0,[[r,b,d],[r,b,-d],[r,t,-d],[r,t,d]]],[0,-1,[[l,t,d],[r,t,d],[r,t,-d],[l,t,-d]]],[0,1,[[l,b,-d],[r,b,-d],[r,b,d],[l,b,d]]]] as Array<[number,number,number[][]]>)if(!opaque(x+dx,y+dy))add(points,Array.from({length:4},()=>[x+.5,y+.5]));}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:assets.itemTexture,alphaTest:.1,side:THREE.DoubleSide})),transform=model.display?.[display];
  const scale=transform?.scale??[.55,.55,.55];mesh.scale.set(...scale as [number,number,number]);mesh.position.set(...(transform?.translation??[0,3,1]).map(n=>n/16) as [number,number,number]);mesh.rotation.set(...(transform?.rotation??[0,0,0]).map(n=>n*Math.PI/180) as [number,number,number]);return mesh;
}
