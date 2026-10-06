import type {StageGate} from '../types';
/** FIFO completion credits also cover a stage finishing before the engine asks. */
export function createStageGate(){const pending=new Map<string,Array<()=>void>>(),credits=new Map<string,number>();let closed=false;
  const request=(kind:string,key:string)=>new Promise<void>(resolve=>{const id=kind+':'+key,count=credits.get(id)??0;if(closed||document.hidden){resolve();return;}if(count){credits.set(id,count-1);resolve();}else{const list=pending.get(id)??[];list.push(resolve);pending.set(id,list);}});
  const gate:StageGate={round:n=>request('round',String(n)),speech:id=>request('speech',id)};
  const done=(kind:string,key:string)=>{const id=kind+':'+key,list=pending.get(id);if(list?.length){list.shift()!();if(!list.length)pending.delete(id);}else credits.set(id,(credits.get(id)??0)+1);};
  const release=()=>{pending.forEach(list=>list.forEach(f=>f()));pending.clear();credits.clear();};
  return {gate,done,release,dispose(){closed=true;release();}};
}
