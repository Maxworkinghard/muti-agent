import {directions,fullBlock,key,type Block} from '../blockModel';
export type Point=[number,number,number];
export class Builder {
  cells=new Map<string,Block>();
  put(x:number,y:number,z:number,id:string,props:Record<string,string>={}){
    const defaults:Record<string,string>={};
    if(id.endsWith('stairs'))Object.assign(defaults,{facing:'north',half:'bottom',shape:'straight'});
    if(id.endsWith('trapdoor'))Object.assign(defaults,{facing:'north',half:'bottom',open:'false'});
    if(id.endsWith('door')&&!id.endsWith('trapdoor'))Object.assign(defaults,{facing:'east',half:'lower',hinge:'left',open:'false'});
    if(id.endsWith('log')||id.endsWith('wood')||id==='iron_chain')defaults.axis='y';
    if(id==='grass_block')defaults.snowy='false';
    if(id==='water')defaults.level='0';
    if(id.endsWith('_leaves'))Object.assign(defaults,{distance:'7',persistent:'true',waterlogged:'false'});
    if(id==='lever')Object.assign(defaults,{face:'floor',facing:'east',powered:'false'});
    if(id==='redstone_lamp')defaults.lit='false';
    if(id==='lantern')defaults.hanging='false';
    if(id==='barrel'||id==='lectern')defaults.facing=id==='barrel'?'up':'north';
    if(id==='barrel')defaults.open='false';
    if(id==='bell')Object.assign(defaults,{facing:'north',attachment:'floor'});
    if(id.endsWith('candle'))Object.assign(defaults,{candles:'3',lit:'true'});
    if(id==='spruce_hanging_sign')Object.assign(defaults,{attached:'false',rotation:'0'});
    this.cells.set(key(x,y,z),{x,y,z,id,props:{...defaults,...props}});return this;
  }
  fill(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,id:string,props:Record<string,string>={}){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)this.put(x,y,z,id,props);return this;}
  connect(){
    for(const b of this.cells.values())if(b.id.endsWith('fence')||b.id.endsWith('pane'))for(const [d,[dx,dy,dz]] of Object.entries(directions).filter(([d])=>!['up','down'].includes(d))){const n=this.cells.get(key(b.x+dx,b.y+dy,b.z+dz));b.props[d]=String(fullBlock(n)||n?.id===b.id||!!(n?.id.endsWith('pane')&&b.id.endsWith('pane')));}
    return [...this.cells.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x);
  }
}
