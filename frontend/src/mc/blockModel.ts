import * as THREE from 'three';
import {assetId,type Assets,type Model,type ModelRef,type ModelElement} from './assets';
export interface Block {x:number;y:number;z:number;id:string;props:Record<string,string>}
export const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export const hash=(x:number,y:number,z:number)=>((Math.imul(x,73428767)^Math.imul(y,912931)^Math.imul(z,438289))>>>0);
export function matches(condition:Record<string,unknown>|undefined,props:Record<string,string>):boolean {
  if(!condition)return true;
  return Object.entries(condition).every(([k,v])=>k==='OR'?(v as Record<string,unknown>[]).some(c=>matches(c,props)):k==='AND'?(v as Record<string,unknown>[]).every(c=>matches(c,props)):String(v).split('|').includes(props[k]));
}
function pick(value:ModelRef|ModelRef[],seed:number):ModelRef {if(!Array.isArray(value))return value;let n=seed%value.reduce((s,v)=>s+(v.weight??1),0);for(const v of value){n-=v.weight??1;if(n<0)return v;}return value[0];}
export function blockModels(assets:Pick<Assets,'states'>,block:Block):ModelRef[]{
  const state=assets.states[block.id];if(!state)throw new Error('找不到方块状态：'+block.id);
  const seed=hash(block.x,block.y,block.z),out:ModelRef[]=[];
  if(state.variants){const entry=Object.entries(state.variants).find(([k])=>!k||k.split(',').every(p=>{const [a,b]=p.split('=');return block.props[a]===b;}));if(!entry)throw new Error('方块属性不合法：'+block.id+' '+JSON.stringify(block.props));out.push(pick(entry[1],seed));}
  for(const part of state.multipart??[])if(matches(part.when,block.props))out.push(pick(part.apply,seed));
  return out;
}
export function resolveModel(models:Record<string,Model>,id:string,seen=new Set<string>()):Model {
  id=assetId(id);if(seen.has(id))throw new Error('模型循环：'+id);const child=models[id];if(!child) {if(id==='builtin/entity'||id==='builtin/generated')return {};throw new Error('找不到模型：'+id);}
  const parent=child.parent?resolveModel(models,child.parent,new Set([...seen,id])):{};
  return {...parent,...child,textures:{...parent.textures,...child.textures},display:{...parent.display,...child.display},elements:child.elements??parent.elements};
}
export function resolveTexture(model:Model,ref:string):string {const seen=new Set<string>();while(ref.startsWith('#')){if(seen.has(ref))throw new Error('贴图变量循环：'+ref);seen.add(ref);const next=model.textures?.[ref.slice(1)];if(!next)throw new Error('找不到贴图变量：'+ref);ref=typeof next==='string'?next:next.sprite;}return assetId(ref);}
export const directions:Record<string,number[]>={up:[0,1,0],down:[0,-1,0],north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]};
export function facePoints(e:ModelElement,face:string):number[][] {
  const [x,y,z]=e.from.map(n=>n/16),[X,Y,Z]=e.to.map(n=>n/16);
  return ({south:[[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],north:[[X,y,z],[x,y,z],[x,Y,z],[X,Y,z]],east:[[X,y,Z],[X,y,z],[X,Y,z],[X,Y,Z]],west:[[x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z]],up:[[x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z]],down:[[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]]} as Record<string,number[][]>)[face];
}
export function transformPoint(point:number[],e:ModelElement,ref:ModelRef):THREE.Vector3 {
  const v=new THREE.Vector3(...point as [number,number,number]);
  if(e.rotation){const r=e.rotation,o=new THREE.Vector3(...r.origin.map(n=>n/16) as [number,number,number]),axis=new THREE.Vector3(...({x:[1,0,0],y:[0,1,0],z:[0,0,1]}[r.axis]) as [number,number,number]);v.sub(o);if(r.rescale){const scale=1/Math.cos(r.angle*Math.PI/180);for(const a of ['x','y','z'] as const)if(a!==r.axis)v[a]*=scale;}v.applyAxisAngle(axis,r.angle*Math.PI/180).add(o);}
  v.subScalar(.5);v.applyAxisAngle(new THREE.Vector3(1,0,0),-(ref.x??0)*Math.PI/180);v.applyAxisAngle(new THREE.Vector3(0,1,0),-(ref.y??0)*Math.PI/180);return v.addScalar(.5);
}
export function fullBlock(b:Block|undefined):boolean {return !!b && !/(stairs|slab|pane|fence|door|carpet|lantern|chain|lever|candle|bell|banner|lectern|sign|shelf|flower|grass|leaves|azalea)/.test(b.id);}
export function defaultUv(e:ModelElement,f:string):number[]{const [x,y,z]=e.from,[X,Y,Z]=e.to;return ({up:[x,z,X,Z],down:[x,16-Z,X,16-z],north:[16-X,16-Y,16-x,16-y],south:[x,16-Y,X,16-y],west:[z,16-Y,Z,16-y],east:[16-Z,16-Y,16-z,16-y]} as Record<string,number[]>)[f];}
