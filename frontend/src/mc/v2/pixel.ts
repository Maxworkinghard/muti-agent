/**
 * v2 的像素贴图工具：所有 v2 用到的贴图都在这里程序生成（16×16 方块贴图、道具贴图、远景贴图），
 * 不读取原版或任何第三方材质包的像素。画法是确定的（同一个种子画出来一样）。
 */
import type {Painter,Pixels} from '../style';

export type RGB=[number,number,number];
export const rgb=(hex:string):RGB=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as RGB;
const clamp=(n:number)=>Math.max(0,Math.min(255,Math.round(n)));
export const hex=(c:number[])=>'#'+c.map(v=>clamp(v).toString(16).padStart(2,'0')).join('');
/** 明度调整：k<1 变暗（同时略偏冷），k>1 变亮（略偏暖）。 */
export function tone(color:string,k:number){const c=rgb(color);if(k<1)return hex([c[0]*k*.97,c[1]*k*.99,c[2]*k*1.03]);return hex(c.map((v,i)=>v+(255-v)*(k-1)*(i===2?.85:1)));}
export function blend(a:string,b:string,t:number){const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v+(y[i]-v)*t));}
export function rng(seed:number){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
/** 平滑的值噪声（格点随机 + 双线性），远景地形起伏用。 */
export function valueNoise(seed:number){const cache=new Map<string,number>();const at=(i:number,j:number)=>{const k=i+','+j;let v=cache.get(k);if(v===undefined){v=rng((i*73856093)^(j*19349663)^seed)();cache.set(k,v);}return v;};
  return (x:number,z:number)=>{const i=Math.floor(x),j=Math.floor(z),fx=x-i,fz=z-j,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);const a=at(i,j),b=at(i+1,j),c=at(i,j+1),d=at(i+1,j+1);return a+(b-a)*sx+(c-a)*sz+(a-b-c+d)*sx*sz;};}
/** 从色板里按权重挑一个颜色。 */
export function pick(r:()=>number,colors:string[],weights?:number[]){const w=weights??colors.map(()=>1),sum=w.reduce((a,b)=>a+b,0);let n=r()*sum;for(let i=0;i<colors.length;i++){n-=w[i];if(n<0)return colors[i];}return colors[colors.length-1];}

/** 只在 16×16 画布上作画的小画笔（Pixels 接口外加噪点、描边）。 */
export function speckle(p:Pixels,r:()=>number,colors:string[],density:number,x0=0,y0=0,w=16,h=16){for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)if(r()<density)p.px(x,y,pick(r,colors));}
export function hline(p:Pixels,x:number,y:number,w:number,c:string){p.rect(x,y,w,1,c);}
export function vline(p:Pixels,x:number,y:number,h:number,c:string){p.rect(x,y,1,h,c);}

/**
 * v2 的材质色板。按“主次”分组：框架（深橡木）最暗、地板与家具（云杉、白桦）居中、石材偏冷灰、织物有限几种饱和色点缀。
 * 颜色是这次重建自己定的，不沿用旧房间的色板。
 */
export const PAL={
  frame:{base:'#46372d',light:'#57463a',dark:'#32271f',deep:'#221a14'},
  bark:{base:'#3b2a20',light:'#4d3829',dark:'#271b14'},
  spruce:{base:'#86684f',light:'#977a5e',dark:'#6a513d',seam:'#4b392b'},
  birch:{base:'#cdbf9f',light:'#dcd0b3',dark:'#b5a684',seam:'#8a7b5f'},
  /** 白桦（偏冷的浅木，用在望板和天花） */
  pale:{base:'#d9d2c0',light:'#e6e0d0',dark:'#bfb6a1',seam:'#968c77'},
  /** 石灰抹面（白墙） */
  plaster:{base:'#e9e4d8',light:'#f3efe6',dark:'#d6cfc0',speck:'#c9c1b0'},
  stone:{base:'#8e8e88',light:'#a7a69e',dark:'#73736e',mortar:'#5d5d59',warm:'#9a9286'},
  cobble:{base:'#85817a',light:'#a29d93',dark:'#615e58',mortar:'#4a4844'},
  moss:{base:'#5e7f37',light:'#7aa045',dark:'#466129'},
  slate:{base:'#4f5b6a',light:'#617082',dark:'#3a4350',edge:'#2c333d'},
  grass:{base:'#6c9b43',light:'#86b552',dark:'#557d34',deep:'#47692c'},
  dirt:{base:'#7b5a3d',light:'#8f6c4a',dark:'#5f442e'},
  sand:{base:'#d8c795',light:'#e6d7aa',dark:'#bfae7e'},
  gravel:{base:'#8a8580',light:'#a29d97',dark:'#6a6661'},
  leaf:{base:'#4e8a3a',light:'#68a64a',dark:'#376a2c',deep:'#2a5424'},
  cherry:{base:'#f0b2c6',light:'#fbd3df',dark:'#d98aa5',deep:'#b9668a'},
  spruceLeaf:{base:'#2f5a3c',light:'#3f6f4a',dark:'#22452e'},
  water:{deep:'#33627e',mid:'#477c98',light:'#6a9bb3',glint:'#d7e8f0',teal:'#3f8f99'},
  fabric:['#a54a3c','#3f5f8f','#c69a3c','#6f9363','#7b4e72','#3c7f7b','#b8693a','#d8ccb0'],
  paper:{base:'#efe4c8',line:'#c9b78f',ink:'#3a2c22'},
  fire:{core:'#fff1b8',hot:'#ffc24a',mid:'#ff8a2a',low:'#d8481f'},
  glow:{paper:'#ffd99a',warm:'#ffb35c'},
};

/** 把一个 Painter 画到 size×size 的新画布上（道具贴图用，方块贴图由 assets.applyPaint 画进图集）。 */
export function canvasOf(painter:Painter,size=16):HTMLCanvasElement{
  const cv=document.createElement('canvas');cv.width=cv.height=size;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;
  const p:Pixels={size,fill(color){c.fillStyle=color;c.fillRect(0,0,size,size);return p;},rect(x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);return p;},px(x,y,color){c.fillStyle=color;c.fillRect(x,y,1,1);return p;},clear(x=0,y=0,w=size,h=size){c.clearRect(x,y,w,h);return p;}};
  painter(p);return cv;
}
