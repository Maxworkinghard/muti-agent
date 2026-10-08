/** Q 版人物模块入口：按人物 id 取造型（looks.ts 没配的人按 persona.visual 推一份，不用哈希）。 */
import type {PersonaVisual} from '../../types';
import {LOOKS} from './looks';
import type {Accessory,HairStyle,Look} from './types';
export {buildAvatar,type Avatar} from './build';
export {LOOKS} from './looks';
export * from './rig';
export {makeBody,sitPose,BODY,HEAD_SHAPES,SIT_LABEL,SEAT,type Body,type SitPose} from './body';
export type {Look} from './types';
const STYLE:Record<string,HairStyle>={short:'tidy',long:'wavy',bun:'topknot',cap:'crew',spiky:'spiky',curly:'curly',side:'sweep',middle:'curtain',hood:'shaggy',beanie:'bob'};
/** 没有专门配置的人：直接按设定的 visual 拼一份最朴素的造型（T 恤 + 长裤 + 球鞋），所有字段都标成 config 或默认。 */
export function lookFromVisual(id:string,name:string,v:PersonaVisual):Look{
  const ex=v.extras??[],acc:Accessory[]=[];
  if(ex.includes('glasses'))acc.push({kind:'glasses'});if(ex.includes('scarf'))acc.push({kind:'scarf',color:v.accent});
  if(v.hairStyle==='cap')acc.push({kind:'cap',color:v.shirt});if(v.hairStyle==='hood')acc.push({kind:'hood',color:v.shirt});if(v.hairStyle==='beanie')acc.push({kind:'beanie',color:v.accent});
  return {id,name,skin:v.skin,body:{type:'standard',sit:'standard'},hair:{style:STYLE[v.hairStyle??'short']??'tidy',color:v.hair},
    face:{eyes:ex.includes('sleepy')?'sleepy':'round',iris:'#3a3040',brows:ex.includes('brows')?'thick':'soft',mouth:ex.includes('grin')?'grin':'smile',marks:[...(ex.includes('blush')?['blush' as const]:[]),...(ex.includes('sweat')?['sweat' as const]:[])]},
    top:{kind:'tee',color:v.shirt,trim:v.accent},bottom:{kind:'pants',color:'#3a3f4a'},shoes:{kind:'sneakers',color:'#e8e4da'},acc,
    tendency:{expression:ex.includes('happy')?'happy':'neutral',gesture:1,lean:0,tilt:0},
    basis:{skin:'config',body:'inferred',hairColor:'config',hairStyle:'config',top:'config',acc:'config'},why:'没有单独配置：按设定 visual 直接拼出来的默认造型。'};
}
export function lookFor(id:string,name:string,v:PersonaVisual):Look{return LOOKS[id]??lookFromVisual(id,name,v);}
