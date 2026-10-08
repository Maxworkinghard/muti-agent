import {FONT} from './geometry';
import {seeded,shade} from '../style';
/**
 * 各房间自己的“话题板”，不再每间屋都挂同一块展板：
 * cork 软木板贴便签（圆桌会议室）、whiteboard 白板和磁贴（办公室）、chalk 黑板粉笔字（教室）、
 * sign 木牌（草地野餐）、onair 录音间的节目卡（播客）、frame 金框大板（辩论室）。
 */
export type BoardStyle='cork'|'whiteboard'|'chalk'|'sign'|'onair'|'frame';
export interface BoardInfo {title:string;theme:string;phase:string;detail:string;finished:boolean}
const INK='#3b2f3f';
/** 在 max 宽度里放下一行字，放不下就缩小字号。 */
function fit(c:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,size:number,weight=700,min=18){
  let n=size;c.font=`${weight} ${n}px ${FONT}`;while(n>min&&c.measureText(text).width>max){n-=2;c.font=`${weight} ${n}px ${FONT}`;}
  if(c.measureText(text).width>max){let t=text;while(t.length>1&&c.measureText(t+'…').width>max)t=t.slice(0,-1);text=t+'…';}
  c.fillText(text,x,y);return n;
}
/** 主题可能很长：最多拆两行。 */
function lines(c:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,size:number,gap:number,weight=700){
  c.font=`${weight} ${size}px ${FONT}`;if(c.measureText(text).width<=max){fit(c,text,x,y,max,size,weight);return;}
  const chars=[...text];let cut=chars.length;while(cut>1&&c.measureText(chars.slice(0,cut).join('')).width>max)cut--;
  fit(c,chars.slice(0,cut).join(''),x,y-gap/2,max,size,weight);fit(c,chars.slice(cut).join(''),x,y+gap/2,max,size,weight);
}
/** 像素底图：在小画布上画好，再按最近邻放大铺满，近看是清楚的格子。 */
function pixelBack(c:CanvasRenderingContext2D,W:number,H:number,cell:number,draw:(p:CanvasRenderingContext2D,w:number,h:number)=>void){
  const w=Math.ceil(W/cell),h=Math.ceil(H/cell),cv=document.createElement('canvas');cv.width=w;cv.height=h;const p=cv.getContext('2d')!;draw(p,w,h);
  c.imageSmoothingEnabled=false;c.drawImage(cv,0,0,w*cell,h*cell);c.imageSmoothingEnabled=true;
}
function note(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string,tilt:number,pin:string){
  c.save();c.translate(x+w/2,y+h/2);c.rotate(tilt);c.fillStyle='rgba(59,47,63,.18)';c.fillRect(-w/2+6,-h/2+8,w,h);c.fillStyle=color;c.fillRect(-w/2,-h/2,w,h);
  c.fillStyle=shade(color,.9);c.fillRect(-w/2,h/2-10,w,10);c.fillStyle=pin;c.beginPath();c.arc(0,-h/2+14,9,0,Math.PI*2);c.fill();c.fillStyle='rgba(255,255,255,.55)';c.beginPath();c.arc(-3,-h/2+11,3,0,Math.PI*2);c.fill();c.restore();
}
export function drawBoard(style:BoardStyle,c:CanvasRenderingContext2D,W:number,H:number,info:BoardInfo){
  c.clearRect(0,0,W,H);c.textAlign='center';c.textBaseline='middle';
  if(style==='cork'){
    pixelBack(c,W,H,8,(p,w,h)=>{p.fillStyle='#c99a5b';p.fillRect(0,0,w,h);const r=seeded(7);for(let i=0;i<w*h/7;i++){p.fillStyle=r()<.5?'#b8874b':'#d8ab6b';p.fillRect(Math.floor(r()*w),Math.floor(r()*h),1,1);}});
    // 中间一张大白卡写话题，两侧便签写进度和在座的人。
    c.save();c.translate(W*.5,H*.5);c.rotate(-.012);c.fillStyle='rgba(59,47,63,.2)';c.fillRect(-W*.29+8,-H*.38+10,W*.58,H*.76);c.fillStyle='#fffaf0';c.fillRect(-W*.29,-H*.38,W*.58,H*.76);
    c.fillStyle='#e86f6f';c.beginPath();c.arc(0,-H*.38+16,11,0,Math.PI*2);c.fill();
    c.fillStyle='#9a8f7a';fit(c,'今天聊',0,-H*.2,W*.5,30,600);c.fillStyle=INK;lines(c,info.theme||'等你带来一个话题',0,H*.04,W*.52,58,74);c.restore();
    note(c,W*.035,H*.16,W*.165,H*.6,'#ffe27a',-.05,'#4f86c6');c.fillStyle=INK;fit(c,info.finished?'聊完啦':info.phase,W*.035+W*.0825,H*.46,W*.14,34,700);
    note(c,W*.8,H*.14,W*.165,H*.62,'#ffc2cf',.04,'#57a773');c.fillStyle=INK;
    const names=info.detail.split(' · ').filter(Boolean);names.slice(0,6).forEach((n,i)=>fit(c,n,W*.8+W*.0825,H*.3+i*H*.085,W*.14,26,600));
    return;
  }
  if(style==='whiteboard'){
    c.fillStyle='#fff8ea';c.fillRect(0,0,W,H);c.fillStyle='#ebcc9e';c.fillRect(0,H-26,W,26);
    c.fillStyle='#3d8bff';fit(c,info.title,W*.14,H*.14,W*.22,30,700);
    c.fillStyle=INK;lines(c,info.theme||'等你派第一件活',W*.5,H*.36,W*.8,54,68);
    c.fillStyle='#d9534f';fit(c,info.finished?'已交付':info.phase,W*.5,H*.62,W*.6,34,700);
    c.fillStyle='#4a7d5a';fit(c,info.detail,W*.5,H*.8,W*.86,28,600);
    for(const [x,col] of [[.06,'#e86f6f'],[.92,'#4f86c6'],[.88,'#f2c14e']] as const){c.fillStyle=col;c.fillRect(W*x-14,H*.08-14,28,28);}
    return;
  }
  if(style==='chalk'){
    pixelBack(c,W,H,8,(p,w,h)=>{p.fillStyle='#2f4a3c';p.fillRect(0,0,w,h);const r=seeded(3);for(let i=0;i<w*h/12;i++){p.fillStyle=r()<.5?'#34503f':'#2a4336';p.fillRect(Math.floor(r()*w),Math.floor(r()*h),2,1);}});
    c.fillStyle='rgba(255,255,255,.88)';fit(c,info.title+' · 今日讨论',W*.5,H*.16,W*.8,34,600);
    c.fillStyle='#ffffff';lines(c,info.theme||'等待开课',W*.5,H*.44,W*.84,60,76);
    c.fillStyle='#ffe58a';fit(c,info.finished?'下课啦':info.phase,W*.5,H*.7,W*.6,36,700);
    c.fillStyle='rgba(255,255,255,.7)';fit(c,info.detail,W*.5,H*.86,W*.86,26,500);
    return;
  }
  if(style==='sign'){
    pixelBack(c,W,H,8,(p,w,h)=>{p.fillStyle='#b98450';p.fillRect(0,0,w,h);for(let y=0;y<h;y+=Math.ceil(h/3)){p.fillStyle='#9a6b3f';p.fillRect(0,y,w,1);p.fillStyle='#cf9a63';p.fillRect(0,y+1,w,1);}p.fillStyle='#8a5c35';p.fillRect(0,0,w,1);p.fillRect(0,h-1,w,1);p.fillRect(0,0,1,h);p.fillRect(w-1,0,1,h);});
    c.fillStyle='#fff3d6';lines(c,info.theme||'今天野餐聊点啥？',W*.5,H*.42,W*.86,60,74);
    c.fillStyle='#3f2a1c';fit(c,info.finished?'散场啦':info.phase,W*.5,H*.8,W*.7,34,700);
    return;
  }
  if(style==='onair'){
    c.fillStyle='#2d3c5a';c.fillRect(0,0,W,H);c.strokeStyle='#d9b36a';c.lineWidth=8;c.strokeRect(10,10,W-20,H-20);
    c.fillStyle='#d9b36a';fit(c,'本期话题',W*.5,H*.2,W*.6,30,700);
    c.fillStyle='#fff6e6';lines(c,info.theme||'今天聊点什么？',W*.5,H*.5,W*.84,56,70);
    c.fillStyle='#9fc2e8';fit(c,info.finished?'本期录完':info.phase,W*.5,H*.8,W*.7,30,600);
    return;
  }
  // frame：辩论室的金框大板
  c.fillStyle='#fbf1d8';c.fillRect(0,0,W,H);c.fillStyle='#f3e2bc';c.fillRect(0,H*.78,W,H*.22);
  c.fillStyle='#8a6a2f';fit(c,'辩题',W*.5,H*.13,W*.3,32,700);
  c.fillStyle=INK;lines(c,info.theme||'等待辩题',W*.5,H*.38,W*.86,58,72);
  const [pro,con]=info.detail.split(' | ');c.fillStyle='#3d8bff';fit(c,'正方 '+(pro??''),W*.27,H*.66,W*.42,30,700);c.fillStyle='#ff4d9a';fit(c,'反方 '+(con??''),W*.73,H*.66,W*.42,30,700);
  c.fillStyle='#6b5a3a';fit(c,info.finished?'辩论结束':info.phase,W*.5,H*.89,W*.6,30,600);
}
