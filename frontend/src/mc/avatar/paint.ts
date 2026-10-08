/** 人物贴图集：每个人一张 256×256 的画布，1 像素 = 1 T（1/48 米）。盒子的每个面要么占一块画好的区域，要么取一个纯色格。 */
export interface Rect {x:number;y:number;w:number;h:number}
const rgb=(c:string):[number,number,number]=>{const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];};
const hex=(r:number,g:number,b:number)=>'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
/** 明暗：f<1 变暗（同时略微偏冷/偏饱和），f>1 往白里提 */
export function tone(c:string,f:number){const [r,g,b]=rgb(c);if(f<=1)return hex(r*f,g*f,b*Math.min(1,f*1.06));const t=f-1;return hex(r+(255-r)*t,g+(255-g)*t,b+(255-b)*t);}
export function mix(a:string,b:string,t:number){const x=rgb(a),y=rgb(b);return hex(x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t);}
export interface Pen {w:number;h:number;rect(x:number,y:number,w:number,h:number,c:string,a?:number):Pen;px(x:number,y:number,c:string,a?:number):Pen;fill(c:string):Pen;clear(x:number,y:number,w:number,h:number):Pen}
export class Atlas {
  readonly size=256;readonly canvas:HTMLCanvasElement;readonly ctx:CanvasRenderingContext2D;
  private sx=0;private sy=0;private sh=0;private rects:Rect[]=[];private solids=new Map<string,Rect>();
  constructor(){this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=this.size;this.ctx=this.canvas.getContext('2d')!;this.ctx.imageSmoothingEnabled=false;}
  /** 架子式装箱，四周留 1 像素的边（bleed 时用边缘像素填上，远处 mipmap 不串色） */
  alloc(w:number,h:number):Rect{w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
    if(this.sx+w+2>this.size){this.sx=0;this.sy+=this.sh;this.sh=0;}
    if(this.sy+h+2>this.size)throw new Error('人物贴图集放不下了');
    const r={x:this.sx+1,y:this.sy+1,w,h};this.sx+=w+2;this.sh=Math.max(this.sh,h+2);this.rects.push(r);return r;}
  /** 纯色格（2×2，UV 取中心） */
  solid(c:string):Rect{let r=this.solids.get(c);if(!r){r=this.alloc(2,2);this.pen(r).fill(c);this.solids.set(c,r);}return r;}
  pen(r:Rect):Pen{const c=this.ctx,self:Pen={w:r.w,h:r.h,
    rect(x,y,w,h,col,a=1){const x0=Math.max(0,x),y0=Math.max(0,y),x1=Math.min(r.w,x+w),y1=Math.min(r.h,y+h);if(x1<=x0||y1<=y0)return self;c.globalAlpha=a;c.fillStyle=col;c.fillRect(r.x+x0,r.y+y0,x1-x0,y1-y0);c.globalAlpha=1;return self;},
    px(x,y,col,a=1){return self.rect(x,y,1,1,col,a);},
    fill(col){return self.rect(0,0,r.w,r.h,col);},
    clear(x,y,w,h){c.clearRect(r.x+x,r.y+y,w,h);return self;}};return self;}
  /** 把每块区域的边缘像素往外复制一圈 */
  bleed(only?:Rect){const c=this.ctx;for(const r of only?[only]:this.rects){
    c.drawImage(this.canvas,r.x,r.y,r.w,1,r.x,r.y-1,r.w,1);c.drawImage(this.canvas,r.x,r.y+r.h-1,r.w,1,r.x,r.y+r.h,r.w,1);
    c.drawImage(this.canvas,r.x,r.y-1,1,r.h+2,r.x-1,r.y-1,1,r.h+2);c.drawImage(this.canvas,r.x+r.w-1,r.y-1,1,r.h+2,r.x+r.w,r.y-1,1,r.h+2);}}
}
