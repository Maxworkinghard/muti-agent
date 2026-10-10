import {directions,fullBlock,key,type Block} from './blockModel';
import type * as THREE from 'three';
export interface LightGrid {block:Map<string,number>;sky:Map<string,number>;bounds:{min:[number,number,number];max:[number,number,number]};sample(x:number,y:number,z:number):[number,number]}
export const emission=(b:Block)=>b.id==='light'?Number(b.props.level??15):b.id==='lantern'||b.id==='sea_lantern'?15:b.id==='redstone_lamp'&&b.props.lit==='true'?15:b.id.includes('torch')?14:b.id.endsWith('candle')&&b.props.lit==='true'?3*Number(b.props.candles??1):0;
export function propagate(blocks:Block[]):LightGrid {
  const cells=new Map(blocks.map(b=>[key(b.x,b.y,b.z),b]));const block=new Map<string,number>(),sky=new Map<string,number>();
  // 网格至少包住旧房间的 −1…23 × −1…25；方块往负方向铺得更远（园林的北岸、西岸）时一起放大，不然那边的方块查不到天光、一片死黑。
  let x0=-1,z0=-1,x1=23,y1=12,z1=25;for(const b of blocks){if(b.x-2<x0)x0=b.x-2;if(b.z-2<z0)z0=b.z-2;if(b.x+2>x1)x1=b.x+2;if(b.y+3>y1)y1=b.y+3;if(b.z+2>z1)z1=b.z+2;}
  const min:[number,number,number]=[x0,0,z0],max:[number,number,number]=[x1,y1,z1];
  const bounded=(x:number,y:number,z:number)=>x>=min[0]&&x<=max[0]&&y>=min[1]&&y<=max[1]&&z>=min[2]&&z<=max[2];
  function spread(map:Map<string,number>,queue:Array<[number,number,number,number]>,skylight=false){for(let i=0;i<queue.length;i++){const [x,y,z,n]=queue[i];for(const [dx,dy,dz] of Object.values(directions)){const xx=x+dx,yy=y+dy,zz=z+dz,k=key(xx,yy,zz);const value=skylight&&dy===-1&&n===15?15:n-1;if(value<1||!bounded(xx,yy,zz)||fullBlock(cells.get(k))||(map.get(k)??0)>=value)continue;map.set(k,value);queue.push([xx,yy,zz,value]);}}}
  const q:Array<[number,number,number,number]>=[];
  for(const b of blocks){const n=emission(b);if(n){block.set(key(b.x,b.y,b.z),n);q.push([b.x,b.y,b.z,n]);}}spread(block,q);
  const sq:Array<[number,number,number,number]>=[];
  for(let x=min[0];x<=max[0];x++)for(let z=min[2];z<=max[2];z++){sky.set(key(x,max[1],z),15);sq.push([x,max[1],z,15]);}spread(sky,sq,true);
  return {block,sky,bounds:{min,max},sample(x,y,z){const k=key(Math.floor(x),Math.floor(y),Math.floor(z));return [block.get(k)??0,sky.get(k)??0];}};
}
export function updateLightTable(texture:THREE.DataTexture,day=1){const data=texture.image.data as Uint8Array;for(let s=0;s<16;s++)for(let b=0;b<16;b++){const curve=(n:number)=>{const f=n/15,v=f/(4-3*f);return v+(1-(1-v)**4-v)*.5;};const bl=curve(b),sl=curve(s)*day;const light=[Math.max(bl,sl*.94),Math.max(bl*.96,sl*.98),Math.max(bl*.9,sl)];for(let c=0;c<3;c++)data[(s*16+b)*4+c]=Math.round(Math.max(.07,light[c])*255);data[(s*16+b)*4+3]=255;}texture.needsUpdate=true;}
