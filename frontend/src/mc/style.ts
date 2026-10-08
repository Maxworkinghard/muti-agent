/**
 * 我的世界房间的画面风格：照二维场景的像素插画来做——平涂色块、1 像素的亮边和暗边、清楚的接缝，
 * 不用写实木纹、法线和粗糙度贴图。每个房间给出自己的光线（Look）、方块贴图（paint）和地面图（floorArt）。
 */
export type Painter=(p:Pixels)=>void;
export interface Pixels {readonly size:number;fill(c:string):Pixels;rect(x:number,y:number,w:number,h:number,c:string):Pixels;px(x:number,y:number,c:string):Pixels;clear(x?:number,y?:number,w?:number,h?:number):Pixels}
/** 一个房间的光线和底色。 */
export interface Look {
  /** 俯视剖面时墙外、窗外看到的底色；露天场景用天空 */
  background:string;
  /** 露天：画天空和云 */
  outdoor?:boolean;
  /** 半球光：上方颜色、下方颜色、强度——负责整体亮度，让颜色接近二维原图 */
  sky:string;ground:string;ambient:number;
  /** 太阳：方向（方位角从 +x 逆时针、仰角，单位度）、强度、阴影浓淡 */
  sun:{color:string;intensity:number;azimuth:number;elevation:number;shadow:number};
  exposure:number;
  /** 游戏光照网格当间接光的强度（方块边角的明暗仍由顶点遮蔽表现） */
  indirect:number;
  /** 屋顶挡太阳：天花板在镜头里藏起来，但照样投影，阳光只从窗户照进来，在地上落出光斑 */
  roof?:boolean;
  /** 真实方块贴图的生物群系染色（草、树叶、白桦、云杉）；不设就用原版平原的颜色 */
  tint?:{grass?:string;foliage?:string;birch?:string;spruce?:string};
  /** 户外远处的薄雾：颜色和起止距离（米） */
  haze?:string;fog?:[number,number];
  /** 户外天穹的天顶颜色（设了就画渐变天穹和像素白云，不用物理天空和原版云层） */
  skyTop?:string;
  /** 调色时的饱和度倍数：默认 1.2（给平涂色板提一点色）；原版方块贴图本身就艳，设 1 就是不再额外加饱和 */
  saturation?:number;
}
const clamp=(n:number)=>Math.max(0,Math.min(255,Math.round(n)));
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=(c:number[])=>'#'+c.map(v=>clamp(v).toString(16).padStart(2,'0')).join('');
/** k<1 压暗，k>1 提亮（提亮按到白色的距离算，不会冲出色相）。 */
export function shade(color:string,k:number){const c=rgb(color);return hex(k<1?c.map(v=>v*k):c.map(v=>v+(255-v)*(k-1)));}
export function mix(a:string,b:string,t:number){const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v+(y[i]-v)*t));}
/** 确定的伪随机：同一张贴图每次画出来都一样。 */
export function seeded(seed:number){let s=seed>>>0||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

/** 在 16×16 的画布上作画。 */
export function paintTile(painter:Painter,size=16):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  const p:Pixels={size,
    fill(color){c.fillStyle=color;c.fillRect(0,0,size,size);return p;},
    rect(x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);return p;},
    px(x,y,color){c.fillStyle=color;c.fillRect(x,y,1,1);return p;},
    clear(x=0,y=0,w=size,h=size){c.clearRect(x,y,w,h);return p;}};
  painter(p);return canvas;
}

/** 常用图样。参数都是颜色，暗边、亮边按底色自动算。 */
export const pattern={
  /** 平涂：墙面、顶面 */
  flat:(base:string):Painter=>p=>{p.fill(base);},
  /** 平涂加一圈很淡的亮边暗边：桌柜、门框这种要看出块面的 */
  block:(base:string,edge=.9):Painter=>p=>{p.fill(base).rect(0,0,16,1,shade(base,1.06)).rect(0,0,1,16,shade(base,1.04)).rect(0,15,16,1,shade(base,edge)).rect(15,0,1,16,shade(base,edge+.03));},
  /** 竖条纹墙纸 */
  stripes:(base:string,stripe:string,every=4,width=1):Painter=>p=>{p.fill(base);for(let x=1;x<16;x+=every)p.rect(x,0,width,16,stripe);},
  /** 护墙板：外框加内凹面 */
  panel:(base:string,frame=shade(base,.8),inner=shade(base,.92)):Painter=>p=>{p.fill(base).rect(0,0,16,1,shade(base,1.1)).rect(0,15,16,1,frame).rect(2,3,12,10,frame).rect(3,4,10,8,inner);},
  /** 窗玻璃：浅蓝玻璃、窗框和一道高光 */
  glass:(frame:string,pane='#9fd3ea',shine='#e6f6fb'):Painter=>p=>{p.fill(pane).rect(0,0,16,1,frame).rect(0,15,16,1,frame).rect(0,0,1,16,frame).rect(15,0,1,16,frame).rect(7,0,2,16,frame);
    for(let i=0;i<4;i++){p.px(2+i,9-i*2,shine).px(3+i,9-i*2,shine).px(10+i,11-i*2,shine);}},
};
