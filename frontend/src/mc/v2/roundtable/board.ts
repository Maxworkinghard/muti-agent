/**
 * 议事厅的话题匾：挂在北面横梁下的一块木框纸匾，朝 +z（朝着桌子和默认机位）。
 * 米白宣纸底（放大的像素纤维），左上角小字是厅名，中间是大字议题（最多两行），
 * 左下是朱红的阶段，右下一方朱印，底边一行小字是在座的人。只用画布绘制，不依赖任何图片。
 */
import type {BoardInfo} from '../../props/boards';
import {FONT} from '../../props/geometry';
import {rng} from '../pixel';

const INK='#2c231d',MUTED='#6d5f50',SEAL='#a3382a',PAPER='#efe5cc';
function fitText(c:CanvasRenderingContext2D,text:string,max:number,size:number,weight=700,min=20){let n=size;c.font=`${weight} ${n}px ${FONT}`;while(n>min&&c.measureText(text).width>max){n-=2;c.font=`${weight} ${n}px ${FONT}`;}
  if(c.measureText(text).width<=max)return text;let t=text;while(t.length>1&&c.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…';}
/** 议题按宽度拆成一到两行。 */
function split(c:CanvasRenderingContext2D,text:string,max:number,size:number):{lines:string[];size:number}{
  c.font=`700 ${size}px ${FONT}`;if(c.measureText(text).width<=max)return {lines:[text],size};
  const chars=[...text];let cut=chars.length;while(cut>1&&c.measureText(chars.slice(0,cut).join('')).width>max)cut--;
  const rest=chars.slice(cut).join('');if(c.measureText(rest).width<=max||size<=48)return {lines:[chars.slice(0,cut).join(''),rest],size};
  return split(c,text,max,size-6);
}
export function drawHallBoard(c:CanvasRenderingContext2D,W:number,H:number,info:BoardInfo){
  // 纸底：8 像素一格的纤维噪点，近看是清楚的像素格。
  const cell=8,w=Math.ceil(W/cell),h=Math.ceil(H/cell),cv=document.createElement('canvas');cv.width=w;cv.height=h;const p=cv.getContext('2d')!,r=rng(301);
  p.fillStyle=PAPER;p.fillRect(0,0,w,h);for(let i=0;i<w*h*.18;i++){p.fillStyle=r()<.5?'#e6dabd':'#f5eddb';p.fillRect(Math.floor(r()*w),Math.floor(r()*h),1+Math.floor(r()*2),1);}
  // 双线边框：外深墨、内一道淡赭。
  p.fillStyle=INK;p.fillRect(2,2,w-4,1);p.fillRect(2,h-3,w-4,1);p.fillRect(2,2,1,h-4);p.fillRect(w-3,2,1,h-4);
  p.fillStyle='#b99a6e';p.fillRect(4,4,w-8,1);p.fillRect(4,h-5,w-8,1);p.fillRect(4,4,1,h-8);p.fillRect(w-5,4,1,h-8);
  c.imageSmoothingEnabled=false;c.drawImage(cv,0,0,w*cell,h*cell);c.imageSmoothingEnabled=true;
  const pad=W*.055;
  c.textBaseline='middle';
  // 厅名
  c.fillStyle=MUTED;c.textAlign='left';c.fillText(fitText(c,info.title,W*.4,Math.round(H*.1),700),pad,H*.17);
  // 议题
  const theme=info.theme||'今日议题待定';const s=split(c,theme,W*.78,Math.round(H*.28));
  c.fillStyle=INK;c.textAlign='center';c.font=`700 ${s.size}px ${FONT}`;
  const mid=H*.5;s.lines.forEach((line,i)=>{const y=mid+(i-(s.lines.length-1)/2)*s.size*1.12;c.fillText(fitText(c,line,W*.8,s.size),W/2,y);});
  // 阶段（朱红）、在座的人
  c.textAlign='left';c.fillStyle=SEAL;c.fillText(fitText(c,info.finished?'议毕':info.phase,W*.34,Math.round(H*.1),700),pad,H*.84);
  c.textAlign='center';c.fillStyle=MUTED;c.fillText(fitText(c,info.detail,W*.42,Math.round(H*.075),400),W*.55,H*.85);
  // 朱印
  const sz=H*.2,x=W-pad-sz,y=H*.74-sz/2;c.fillStyle=SEAL;c.fillRect(x,y,sz,sz);c.fillStyle=PAPER;c.fillRect(x+sz*.08,y+sz*.08,sz*.84,sz*.84);c.fillStyle=SEAL;c.fillRect(x+sz*.14,y+sz*.14,sz*.72,sz*.72);
  c.fillStyle=PAPER;c.textAlign='center';c.font=`700 ${Math.round(sz*.55)}px ${FONT}`;c.fillText('议',x+sz/2,y+sz/2+2);
  c.textAlign='left';c.textBaseline='alphabetic';
}
