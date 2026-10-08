/**
 * 地面贴图（16 像素 / 米，和方块贴图同密度）：长条木地板、深胡桃人字拼、石木混拼。
 * 不靠噪点 / 滤镜遮丑，不提高分辨率：板宽、错缝、接缝、同板内的木纹和板与板之间的深浅都是一块一块画出来的，
 * 颜色由种子决定（同一个种子画出来完全一样），相邻两块不取同一个色。
 * 湖畔议事厅（roundtable v2）用 plankHall（带深色包边和壁炉前的石炉床）；另外两种在 avatar-lab 展示。
 */
import {rng,tone} from '../v2/pixel';

type Ctx=CanvasRenderingContext2D;
const rect=(c:Ctx,x:number,y:number,w:number,h:number,col:string)=>{if(w<=0||h<=0)return;c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
/** 从色板挑一个和上一个不同的颜色 */
const nextTone=(r:()=>number,pal:string[],prev?:string)=>{let c=pal[Math.floor(r()*pal.length)];if(c===prev)c=pal[(pal.indexOf(c)+1+Math.floor(r()*(pal.length-1)))%pal.length];return c;};

/** 中等色橡木：石木混拼里的木条用。比桌面和包边的深橡木浅一档。 */
export const OAK=['#a6825b','#ad8961','#9f7b55','#b28e66','#a37f58','#9a7652'];
/** 议事厅地板：白桦为主、浅橡点缀（参考图 1.1 / 1.3），比旧的一整片中橡木亮，墙和地毯才分得开。 */
const HALL_WOOD=['#e0cba8','#d7c4a2','#cbb892','#e6d3b0','#d2bf9a','#c4a07a','#b8926a'];
const DARK_OAK=['#5a4130','#634836','#543c2c','#5e4433'];
const WALNUT=['#5b3b29','#654330','#523424','#6c4834','#5f3e2b','#4d3121'];
const FLAG=['#97928a','#8c877f','#a19b91','#86827b','#928d84'];

/** 一块横向的板：上沿亮一道、下沿是接缝、右端是端缝，板内 1–3 道顺纹的深浅，偶尔一个节疤。 */
function plankH(c:Ctx,r:()=>number,x:number,y:number,len:number,wid:number,base:string){
  rect(c,x,y,len,wid,base);
  rect(c,x,y,len-1,1,tone(base,1.05));
  const streaks=1+Math.floor(r()*3);
  for(let i=0;i<streaks;i++){const l=5+Math.floor(r()*Math.max(1,len-8)),sx=x+1+Math.floor(r()*Math.max(1,len-l-2)),sy=y+1+Math.floor(r()*Math.max(1,wid-2));rect(c,sx,sy,Math.min(l,x+len-1-sx),1,tone(base,r()<.6?.92:1.06));}
  if(r()<.14&&len>8){const kx=x+3+Math.floor(r()*(len-7)),ky=y+1+Math.floor(r()*Math.max(1,wid-2));rect(c,kx,ky,2,1,tone(base,.72));}
  rect(c,x,y+wid-1,len,1,tone(base,.74));rect(c,x+len-1,y,1,wid,tone(base,.7));
}
/** 竖向的板（同上，转 90°） */
function plankV(c:Ctx,r:()=>number,x:number,y:number,len:number,wid:number,base:string){
  rect(c,x,y,wid,len,base);
  rect(c,x,y,1,len-1,tone(base,1.05));
  const streaks=1+Math.floor(r()*2);
  for(let i=0;i<streaks;i++){const l=4+Math.floor(r()*Math.max(1,len-7)),sy=y+1+Math.floor(r()*Math.max(1,len-l-2)),sx=x+1+Math.floor(r()*Math.max(1,wid-2));rect(c,sx,sy,1,Math.min(l,y+len-1-sy),tone(base,r()<.6?.92:1.06));}
  rect(c,x+wid-1,y,1,len,tone(base,.74));rect(c,x,y+len-1,wid,1,tone(base,.7));
}
/**
 * 石板（炉床、石木混拼）：砂浆缝 1 像素，左上两条亮边。石面上的痕迹每块不一样：没有、一道细裂、一道折线裂、
 * 缺一个角、两三个浅坑——由种子选，不是同一个记号贴满每一块。
 */
function flag(c:Ctx,r:()=>number,x:number,y:number,w:number,h:number,base:string){
  rect(c,x,y,w,h,base);rect(c,x,y,w-1,1,tone(base,1.07));rect(c,x,y,1,h-1,tone(base,1.04));
  const kind=Math.floor(r()*6),dk=tone(base,.82);
  if(w>5&&h>5){
    const cx=x+2+Math.floor(r()*(w-5)),cy=y+2+Math.floor(r()*(h-5));
    if(kind===1){const len=2+Math.floor(r()*3);for(let i=0;i<len;i++)rect(c,cx+i,cy+(i>>1),1,1,dk);}
    else if(kind===2){rect(c,cx,cy,2,1,dk);rect(c,cx+2,cy+1,1,1,dk);rect(c,cx+2,cy+2,2,1,dk);}
    else if(kind===3){const right=r()<.5;rect(c,right?x+w-3:x+1,y+h-3,2,1,tone(base,.9));rect(c,right?x+w-2:x+1,y+h-2,1,1,tone(base,.86));}
    else if(kind===4){rect(c,cx,cy,1,1,tone(base,.9));rect(c,cx+2,cy+1,1,1,tone(base,.9));if(r()<.5)rect(c,cx+1,cy+3,1,1,tone(base,.92));}
  }
  rect(c,x,y+h-1,w,1,'#5c5852');rect(c,x+w-1,y,1,h,'#5c5852');
}

export interface PlankOptions{seed?:number;/** 深橡木包边宽度（像素） */border?:number;/** 石炉床（相对地面左上角的米） */hearth?:{x0:number;x1:number;z0:number;z1:number};/** 会议毯中心和半径（相对地面左上角的米）：木板 + 地毯，参考图 3.2 */rug?:{cx:number;cz:number;r:number};}
/**
 * 长条木地板：沿 x 铺，板宽 4 像素（25 厘米），每块 1.6–3.6 米长；
 * 相邻两行的端缝至少错开 0.4 米，同一行相邻两块不同色；四周一圈深橡木包边（板沿边长方向走），炉床是错缝石板。
 */
export function plankHall(c:Ctx,w:number,d:number,o:PlankOptions={}){
  const W=Math.round(w*16),D=Math.round(d*16),r=rng(o.seed??201),B=o.border??0;
  rect(c,0,0,W,D,'#6b5137');
  let prev:number[]=[];
  for(let y=B;y<D-B;y+=4){
    const wid=Math.min(4,D-B-y),joints:number[]=[];let x=B-Math.floor(r()*40),last:string|undefined;
    while(x<W-B){
      let len=26+Math.floor(r()*32),end=x+len;
      while(prev.some(j=>Math.abs(j-end)<7))end+=4,len+=4;
      const base=nextTone(r,HALL_WOOD,last);last=base;
      const x0=Math.max(x,B),x1=Math.min(end,W-B);
      if(x1-x0>1){c.save();c.beginPath();c.rect(x0,y,x1-x0,wid);c.clip();plankH(c,r,x,y,len,wid,base);c.restore();}
      joints.push(end);x=end;
    }
    prev=joints;
  }
  if(B>0){
    // 包边：上下两条沿 x、左右两条沿 z，四角上下压左右；每条由 2 块宽 4 的板拼成，各自错缝。
    for(const [y0,horiz] of [[0,true],[D-B,true]] as const)for(let s=0;s<B;s+=4){let x=-Math.floor(r()*30),last:string|undefined;while(x<W){const len=40+Math.floor(r()*30),base=nextTone(r,DARK_OAK,last);last=base;c.save();c.beginPath();c.rect(0,y0,W,B);c.clip();plankH(c,r,x,y0+s,len,Math.min(4,B-s),base);c.restore();x+=len;}void horiz;}
    for(const x0 of [0,W-B])for(let s=0;s<B;s+=4){let y=B-Math.floor(r()*30),last:string|undefined;while(y<D-B){const len=40+Math.floor(r()*30),base=nextTone(r,DARK_OAK,last);last=base;c.save();c.beginPath();c.rect(x0,B,B,D-2*B);c.clip();plankV(c,r,x0+s,y,len,Math.min(4,B-s),base);c.restore();y+=len;}}
    // 包边内沿一道细深线，把浅色地板“框”起来
    rect(c,B,B-1,W-2*B,1,'#3c2c20');rect(c,B,D-B,W-2*B,1,'#3c2c20');rect(c,B-1,B-1,1,D-2*B+2,'#3c2c20');rect(c,W-B,B-1,1,D-2*B+2,'#3c2c20');
  }
  if(o.hearth){
    const h=o.hearth,X0=Math.round(h.x0*16),X1=Math.round(h.x1*16),Z0=Math.round(h.z0*16),Z1=Math.round(h.z1*16);
    rect(c,X0-1,Z0-1,X1-X0+2,Z1-Z0+2,'#3c2c20');
    c.save();c.beginPath();c.rect(X0,Z0,X1-X0,Z1-Z0);c.clip();
    let row=0,last:string|undefined;
    for(let y=Z0;y<Z1;y+=8,row++)for(let x=X0-(row%2?6:0);x<X1;){const fw=10+Math.floor(r()*4),base=nextTone(r,FLAG,last);last=base;flag(c,r,x,y,fw,8,base);x+=fw;}
    c.restore();
  }
  if(o.rug)drawRug(c,o.rug.cx,o.rug.cz,o.rug.r);
}

/** 八角会议毯：青底、米白边、一道暗红线、中间一块小菱形。平铺在木板上，不另做一块会挡脚的席。 */
function drawRug(c:Ctx,cx:number,cz:number,rad:number){
  const px=16,cxp=cx*px,czp=cz*px,rp=rad*px;
  const field='#3c6b62',field2='#325e56',border='#ead7b4',line='#8d3a32',motif='#f3e6c8';
  const x0=Math.max(0,Math.floor(cxp-rp)),x1=Math.ceil(cxp+rp),y0=Math.max(0,Math.floor(czp-rp)),y1=Math.ceil(czp+rp);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const ax=Math.abs(x+.5-cxp),ay=Math.abs(y+.5-czp),oct=Math.max(ax,ay,(ax+ay)*.7071);
    if(oct>rp)continue;
    let col:string;
    if(oct>rp-6)col=border;
    else if(oct>rp-8)col=line;
    else if(ax+ay<16)col=ax+ay<8?line:motif;
    else col=((x>>2)+(y>>2))%2?field:field2;
    rect(c,x,y,1,1,col);
  }
}

/**
 * 深胡桃人字拼（90° 直角人字）：每块 12×3 像素（75×19 厘米），横板和竖板沿对角线两条台阶交错。
 * 铺法：横板 H(s,m) 在 (s·k+2mL, s·k)，竖板 V(s,m) 在 (L+s·k+2mL, s·k−(L−k))，正好铺满不重叠。
 */
export function walnutHerringbone(c:Ctx,w:number,d:number,seed=307){
  const W=Math.round(w*16),D=Math.round(d*16),r=rng(seed),k=3,L=12;
  rect(c,0,0,W,D,'#2e1d14');
  let last:string|undefined;
  for(let m=-Math.ceil((W+D)/(2*L))-2;m<=Math.ceil(W/(2*L))+2;m++)for(let s=-2;s<=Math.ceil((D+L)/k)+2;s++){
    const hx=s*k+2*m*L,hy=s*k;
    if(hx<W&&hx+L>0&&hy<D&&hy+k>0){const b=nextTone(r,WALNUT,last);last=b;plankH(c,r,hx,hy,L,k,b);}
    const vx=L+s*k+2*m*L,vy=s*k-(L-k);
    if(vx<W&&vx+k>0&&vy<D&&vy+L>0){const b=nextTone(r,WALNUT,last);last=b;plankV(c,r,vx,vy,L,k,b);}
  }
}

/**
 * 石木混拼：一行一行铺，每行 1 米高：石板 12×12 像素（75 厘米）+ 右边一根 4 像素宽的竖木条，行与行之间一根通长的横木条；
 * 隔一行整行错开半格（像砌砖的错缝），石板在两组灰里按种子取色、相邻不同色，不是一张规整的方格网。
 */
export function stoneWoodMix(c:Ctx,w:number,d:number,seed=409){
  const W=Math.round(w*16),D=Math.round(d*16),r=rng(seed),P=16,S=12;
  rect(c,0,0,W,D,'#6b5137');
  let last:string|undefined,lastFlag:string|undefined;
  for(let gy=0;gy*P<D;gy++){
    for(let x=-P;x<W;x+=2*P){const b=nextTone(r,OAK,last);last=b;plankH(c,r,x+(gy%2?P/2:0),gy*P+S,2*P,4,b);}
    const pal=gy%2?FLAG:FLAG.slice().reverse();
    for(let x=-(gy%2?P/2:0);x<W;x+=P){const y=gy*P,f=nextTone(r,pal,lastFlag);lastFlag=f;flag(c,r,x,y,S,S,f);
      const b=nextTone(r,OAK,last);last=b;plankV(c,r,x+S,y,S,4,b);const nail=r();if(nail<.7)rect(c,x+S+1,y+S+1,2,2,nail<.45?'#4a4640':'#8a847a');}
  }
}
