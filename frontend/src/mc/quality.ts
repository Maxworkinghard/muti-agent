import type {Quality} from './post';
export const QUALITY_KEY='mc-stage-quality-v2';
/** 旧版低档不再作为默认沿用；新键里的低档代表用户在当前版本明确选择。 */
export function savedQuality(storage:Pick<Storage,'getItem'>):Quality|null{
  try{const q=storage.getItem(QUALITY_KEY);if(q==='high'||q==='medium'||q==='low')return q;
    const old=storage.getItem('mc-stage-quality');return old==='high'||old==='medium'?old:null;
  }catch{return null;}
}
/** 自动调节只允许高→中，低档仍留给用户手动选择。 */
export function nextAutoQuality(current:Quality,fps:number):'medium'|null{return current==='high'&&fps<45?'medium':null;}
