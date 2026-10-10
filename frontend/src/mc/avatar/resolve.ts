/**
 * 搭配约束：把一份造型配置整理成能直接拼的零件清单，冲突的零件按固定规则让步，并记下让步说明。
 *  1 帽子（毛线帽 / 棒球帽 / 贝雷帽）或兜帽：头顶的发冠压薄成一层，头顶的发髻、丸子、呆毛、尖刺、飞机头去掉。
 *  2 兜帽戴上：两侧和后面的头发、马尾都收进兜帽里，只留刘海；同时不戴帽子、头戴耳机改挂脖子。
 *  3 头戴耳机 + 丸子头 / 双马尾 / 头顶发髻：耳机挪到脖子上。
 *  4 眼镜：刘海下沿不低于镜框上沿（头部 y≥19），不盖住镜片。
 *  5 长发或马尾垂到背上：卫衣背后的帽兜堆去掉（被头发盖住，避免穿插）。
 *  6 围巾：领带、领结、蝴蝶结让给围巾；挂脖耳机也去掉。
 *  7 裙子 + 长外套：外套下摆去掉（只到腰）。
 *  8 背带裤：下装颜色跟背带裤走；裙子改成裤子。
 *  9 胡子：嘴只在说话时露出来，平时是胡子底下一条缝。
 * 10 单片镜和眼镜不同时戴；护目镜、发箍、发间小花遇到兜帽不戴（兜帽盖住），发箍遇到帽子也不戴。
 * 11 披肩和围巾不同时戴（围巾在里、披肩在外会穿插），项链遇到围巾让给围巾。
 * 12 侧马尾 / 侧编辫和挂脖耳机都在肩颈一侧：挂脖耳机让给辫子。
 */
import type {Accessory,AccKind,HairStyle,Look} from './types';
import {planHair,FRINGE_FLOOR} from './hair';
export interface Resolved {
  look:Look;hat:'beanie'|'cap'|'beret'|null;hood:boolean;glasses:'square'|'round'|null;phones:'head'|'neck'|'set'|null;
  has:(k:AccKind)=>boolean;acc:Accessory[];ahoge:boolean;longBack:boolean;coatHem:boolean;notes:string[];
}
const HATS=['beanie','cap','beret'] as const;
/** 头发垂到头以下（长发、马尾） */
const LONG:HairStyle[]=['wavy','hime','ponytail','lowtail','twintails','braid','sidetail','sidelong'];
export function resolveLook(input:Look):Resolved{
  const look:Look=JSON.parse(JSON.stringify(input));const notes:string[]=[];
  let acc=[...look.acc];const has=(k:AccKind)=>acc.some(a=>a.kind===k);const drop=(k:AccKind,why:string)=>{if(has(k)){acc=acc.filter(a=>a.kind!==k);notes.push(why);}};
  const hood=has('hood');
  if(hood){for(const h of HATS)drop(h,'兜帽戴上了，不再戴'+h);if(has('headphones')){drop('headphones','兜帽戴上，头戴耳机改挂脖子');acc.push({kind:'neckphones'});}}
  const hat=(HATS.find(h=>has(h))??null) as Resolved['hat'];
  const topHair=['topknot','odango','quiff','spiky','flame','curly'].includes(look.hair.style);
  if((hat||hood)&&topHair)notes.push('戴帽子/兜帽：头顶的发型零件（'+look.hair.style+'）压平');
  if((hat||hood)&&has('ahoge'))drop('ahoge','戴帽子/兜帽：呆毛压平');
  if(has('headphones')&&['odango','twintails','topknot'].includes(look.hair.style)){drop('headphones','头戴耳机和 '+look.hair.style+' 冲突，改挂脖子');acc.push({kind:'neckphones'});}
  const glasses=has('glasses')?'square':has('roundGlasses')?'round':null;
  if(glasses){const low=Math.min(...planHair(look.hair.style,{hat:null,hood:false,glasses:false,ahoge:false}).boxes.filter(b=>b.z0>=15.9).map(b=>b.y0),99);if(low<FRINGE_FLOOR.glasses)notes.push('眼镜：刘海下沿提到镜框上沿');}
  const longBack=!hood&&LONG.includes(look.hair.style);
  if(has('scarf')){for(const k of ['tie','bowtie','ribbon','neckphones'] as const)drop(k,'围巾盖住了 '+k);}
  let coatHem=look.outer?.kind==='coat';
  if(coatHem&&look.bottom.kind==='skirt'){coatHem=false;notes.push('裙子 + 长外套：外套下摆去掉');}
  if(look.outer?.kind==='overalls'){look.bottom={...look.bottom,color:look.outer.color,kind:look.bottom.kind==='skirt'?'pants':look.bottom.kind};}
  if(has('monocle')&&(has('glasses')||has('roundGlasses')))drop('monocle','已经戴眼镜，不再戴单片镜');
  if(hood){drop('goggles','兜帽盖住了护目镜');drop('headband','兜帽盖住了发箍');drop('flower','兜帽盖住了发间小花');}
  if(hat)drop('headband','戴帽子不戴发箍');
  if(has('scarf')){drop('shawl','围巾和披肩不同时戴');drop('necklace','围巾盖住了项链');}
  if(['braid','sidetail'].includes(look.hair.style))drop('neckphones','侧辫 / 侧马尾和挂脖耳机都在肩颈一侧，耳机让给辫子');
  const phones=has('headset')?'set':has('headphones')?'head':has('neckphones')?'neck':null;
  return {look,hat,hood,glasses,phones,has,acc,ahoge:has('ahoge')&&!hat&&!hood,longBack,coatHem,notes};
}
