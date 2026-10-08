import type {MindView} from '../types';
import type {Avatar} from './avatar/build';
import type {Look} from './avatar/types';
import type {Expression} from './avatar/types';
export type FaceExtra='raise'|'shock'|'cheer'|'frown'|'happy'|'think'|'shy'|'angry'|'neutral';
export interface Skin {canvas:HTMLCanvasElement;texture:import('three').CanvasTexture;face(mind:MindView|undefined,t:number,speaking:boolean,reduced:boolean,extra?:FaceExtra[]):void}
/**
 * Q 版人物的脸（docs/art/02-character-looks.md）：贴图和网格由 avatar/build.ts 按造型配置生成，这里只把旧的神态触发
 * （被打断 shock、交锋挑眉 raise、队友发言 happy、欢呼 cheer、情绪 mood）翻译成表情，接口和旧皮肤一样。
 * 眨眼相位按 id 的字符算（固定，不是随机）。
 */
export function createSkin(avatar:Avatar,look:Look):Skin {
  const blinkPhase=Array.from(look.id).reduce((n,s)=>n+s.charCodeAt(0)*17,0)%4100;
  function face(m:MindView|undefined,t:number,speaking:boolean,reduced:boolean,extra:FaceExtra[]=[]){
    const f=new Set<string>([...(m?.face??[]),...extra]);for(const n of m?.mood??[])if(n.value>=(n.key==='信心'?5:3))f.add(n.key==='火气'?'brows':n.key==='压力'?'sweat':n.key==='信心'?'happy':'blush');
    const base=look.tendency.expression==='happy'?'neutral':look.tendency.expression;
    const expression:Expression=f.has('neutral')?'neutral':f.has('shock')?'surprised':f.has('cheer')||f.has('happy')?'happy':f.has('angry')||f.has('brows')||f.has('frown')?'angry':f.has('shy')?'shy':f.has('think')?'thinking':base;
    avatar.face({expression,speak:speaking?1+Math.floor(t/140)%3:0,blink:!reduced&&Math.floor((t+blinkPhase)%4100/120)===0,
      sleepy:f.has('sleepy'),grin:f.has('grin'),blush:f.has('blush')||!!look.face.marks?.includes('blush'),sweat:f.has('sweat'),raise:f.has('raise')});
  }
  return {canvas:avatar.atlas.canvas,texture:avatar.texture,face};
}
