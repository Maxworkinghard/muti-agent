/**
 * 茶叙榭厅内地面（每米 16 像素，盖在方块地面上；方块地面照旧负责走路、碰撞和光照）：
 * 柱线以内是金砖地（深灰的方砖，0.5 米一块、直缝，砖缝只深一档；房间给它一点光泽，映出外面的亮处），柱线那一圈是青石压面（错缝的长条石）。
 * 桌下不铺席子：深色、有光泽的砖地托住桌椅，是厅里“精装修”的底子；浅灰哑光的方砖读起来像毛坯水泥地。
 */
import {rng,tone} from '../pixel';
import {GARDEN} from './paint';

type Ctx=CanvasRenderingContext2D;
const rect=(c:Ctx,x:number,y:number,w:number,h:number,col:string)=>{if(w<=0||h<=0)return;c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const S=GARDEN.stone;
/** 金砖（厅内）：深灰，略带一点暖 */
const JIN={base:'#5c5a56',light:'#62605b',dark:'#575551',joint:'#53514d'};

export interface TeaFloor {/** 柱线一圈（地面图坐标，米） */edge:{x0:number;x1:number;z0:number;z1:number};seed?:number}
export function teaHallFloor(c:Ctx,w:number,d:number,o:TeaFloor){
  const W=Math.round(w*16),D=Math.round(d*16),r=rng(o.seed??401),E=o.edge;
  // 青石：整张先铺 0.5×1 米的长条石（错缝）
  for(let y=0;y<D;y+=8)for(let x=(y/8)%2?-8:0;x<W;x+=16){const col=[S.base,S.light,S.dark,S.base][Math.floor(r()*4)];rect(c,x,y,16,8,col);rect(c,x,y,15,1,tone(col,1.05));rect(c,x,y+7,16,1,S.edge);rect(c,x+15,y,1,8,S.edge);}
  // 金砖：柱线以内，直缝；深灰略带一点暖，砖缝只比砖面深一点（磨光的砖、灰缝很细）
  const X0=Math.round(E.x0*16),X1=Math.round(E.x1*16),Z0=Math.round(E.z0*16),Z1=Math.round(E.z1*16);
  rect(c,X0-1,Z0-1,X1-X0+2,Z1-Z0+2,S.edge);
  for(let y=Z0;y<Z1;y+=8)for(let x=X0;x<X1;x+=8){const v=r(),col=v<.15?JIN.dark:v<.3?JIN.light:v<.65?JIN.base:tone(JIN.base,.97);
    rect(c,x,y,Math.min(7,X1-x),Math.min(7,Z1-y),col);rect(c,x+7,y,1,Math.min(8,Z1-y),JIN.joint);rect(c,x,y+7,Math.min(8,X1-x),1,JIN.joint);}
}
