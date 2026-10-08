/**
 * 发型零件库：每种发型 = 一层贴着头的体素壳（2 T 一格）+ 刘海轮廓 + 表面起伏 + 附加件（发髻、马尾、双马尾、呆毛……）。
 * 坐标是头部局部 T：x 左右（+x 是人物的左边）、Y 从颈部 0 到头顶 30、z 向前（脸在 z=+14）。
 * 头以下（Y<0）的长发挂在上半身骨头上，贴着后背（z -7…-5），坐下时不穿过椅背。
 * 色调按“发束”（每 3 列一束）取，两侧和后脑一圈断续的高光环，发尾和发梢暗一档：没有随机数，同一发型永远长一样。
 */
import type {HairStyle} from './types';
export interface HairShape {
  /** 头顶、两侧、后脑的厚度（T，2 的倍数） */
  top:number;side:number;back:number;
  /** 侧发下沿：脸侧（z=+14）和后侧（z=-14）的 Y；后发下沿 Y（负数 = 垂到背上） */
  sideFront:number;sideBack:number;backLen:number;
  /** 刘海下沿（按列中心 x），返回 99 表示这一列没有刘海 */
  fringe:(x:number)=>number;
  /** 垂到背上的长发半宽（Y 越低越宽） */
  backWidth?:(y:number)=>number;
  /** 表面起伏 */
  texture?:'curl'|'spike'|'flame'|'shag'|'wave';
  /** 拐角圆滑度（ox+oy+oz 的上限） */
  round?:number;
  /** 露耳朵：耳朵前后两格的侧发只到耳朵上沿 */
  tuck?:boolean;
}
export interface HairVoxel {x0:number;y0:number;z0:number;x1:number;y1:number;z1:number;tone:number;bone:2|3}
/** tone：0 本色 1 暗 2 亮 3 发梢深色 4 发圈 / 发饰色 */
export const HAIR_TONES=5;
const h2=(a:number,b:number)=>(((a*73856093)^(b*19349663))>>>0)%997;
/**
 * 刘海按“发束”下垂：每 3 列（6 T）一束，中间一列最长、两边短一格，像笔尖；每束的长度由种子决定（不是随机数）。
 * base 是最长一束的下沿，depth 是束尖比两边长多少（尖刺头更尖），vary 是束与束长短差几档（每档 2 T）。
 */
const clump=(x:number,base:number,depth:number,seed:number,vary=2)=>{const c=Math.floor((x+17)/6),p=Math.floor((x+17)/2)%3;return base+(h2(c,seed)%(vary+1))*2+(p===1?0:depth);};

export const HAIR:Record<HairStyle,{label:string;shape:HairShape;extras?:(s:HairShape)=>HairVoxel[]}>={
  // 1 清爽短发：侧分，刘海斜着扫到一边，露耳朵，后脑收短。
  tidy:{label:'清爽侧分短发',shape:{top:4,side:2,back:4,sideFront:16,sideBack:8,backLen:6,round:5,tuck:true,fringe:x=>x<-7?24:Math.round(22-(x+7)*.12)}},
  // 2 刺猬头：头顶一簇簇尖刺，刘海锯齿。
  spiky:{label:'刺猬头',shape:{top:4,side:2,back:4,sideFront:16,sideBack:8,backLen:6,round:5,tuck:true,texture:'spike',fringe:x=>clump(x,20,4,1)}},
  // 3 蓬松卷发：两格厚的壳，表面一团团鼓起，下沿卷边。
  curly:{label:'蓬松卷发',shape:{top:6,side:4,back:6,sideFront:10,sideBack:4,backLen:2,round:8,texture:'curl',fringe:x=>clump(x,19,2,2)}},
  // 4 齐刘海波波头：两侧到下巴，后面齐平。
  bob:{label:'齐刘海波波头',shape:{top:4,side:2,back:4,sideFront:2,sideBack:2,backLen:2,round:5,fringe:()=>20}},
  // 5 侧分长刘海：一侧刘海斜盖到眼角，另一侧别到耳后。
  sweep:{label:'侧分长刘海',shape:{top:4,side:2,back:4,sideFront:8,sideBack:6,backLen:4,round:5,fringe:x=>x>4?Math.max(14,Math.round(22-(x-4)*.7)):x<-8?26:22}},
  // 6 中分：刘海从中缝往两边分，两侧垂到下巴。
  curtain:{label:'中分',shape:{top:4,side:2,back:4,sideFront:4,sideBack:2,backLen:0,round:5,fringe:x=>Math.abs(x)<3?28:Math.round(26-Math.abs(x)*.45)}},
  // 7 低马尾：前面整齐后梳，后面一束扎在后颈垂到背上。
  lowtail:{label:'低马尾',shape:{top:4,side:2,back:4,sideFront:12,sideBack:6,backLen:4,round:5,tuck:true,fringe:x=>x<-4?26:24},},
  // 8 大波浪长发：长到背中，下面更宽，表面波浪。
  wavy:{label:'大波浪长发',shape:{top:4,side:4,back:4,sideFront:-4,sideBack:-6,backLen:-18,round:6,texture:'wave',backWidth:y=>12+Math.min(4,Math.round(-y/6)),fringe:x=>x>2?22:x<-10?20:24}},
  // 9 高马尾。
  ponytail:{label:'高马尾',shape:{top:4,side:2,back:4,sideFront:12,sideBack:8,backLen:6,round:5,tuck:true,fringe:x=>clump(x,21,2,3)}},
  // 10 双马尾。
  twintails:{label:'双马尾',shape:{top:4,side:2,back:4,sideFront:10,sideBack:8,backLen:6,round:5,fringe:()=>20}},
  // 11 头顶丸子：头发全部往上收，头顶一个发髻。
  topknot:{label:'头顶丸子',shape:{top:4,side:2,back:4,sideFront:14,sideBack:8,backLen:6,round:5,tuck:true,fringe:x=>Math.abs(x)<5?26:22}},
  // 12 双丸子头。
  odango:{label:'双丸子头',shape:{top:4,side:2,back:4,sideFront:10,sideBack:6,backLen:4,round:5,fringe:()=>20}},
  // 13 寸头：贴头皮的一层，没有刘海。
  crew:{label:'寸头',shape:{top:2,side:2,back:2,sideFront:18,sideBack:10,backLen:8,round:3,tuck:true,fringe:()=>26}},
  // 14 飞机头：前额往上往前翘起一大块。
  quiff:{label:'飞机头',shape:{top:4,side:2,back:2,sideFront:16,sideBack:10,backLen:6,round:4,tuck:true,fringe:()=>99}},
  // 15 冲天炮：发丝往上往后炸开，像点着的引信。
  flame:{label:'冲天炮',shape:{top:4,side:2,back:4,sideFront:16,sideBack:10,backLen:6,round:5,tuck:true,texture:'flame',fringe:x=>clump(x,22,4,4)}},
  // 16 乱糟糟的中长发：下沿参差，盖住耳朵。
  shaggy:{label:'乱中长发',shape:{top:4,side:4,back:4,sideFront:6,sideBack:2,backLen:0,round:6,texture:'shag',fringe:x=>clump(x,17,2,5)+(x>6?-2:0)}},
  // 17 姬发式：齐刘海、两侧齐下巴的鬓发、后面长发垂到腰。
  hime:{label:'姬发式长直发',shape:{top:4,side:2,back:4,sideFront:2,sideBack:-6,backLen:-22,round:5,backWidth:()=>12,fringe:()=>20}},
};
/** 附加件（马尾、发髻……）的体素 */
const B=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,tone=0,bone:2|3=3):HairVoxel=>({x0,y0,z0,x1,y1,z1,tone,bone});
export function hairExtras(style:HairStyle,s:HairShape,opts:{hat:boolean;ahoge:boolean}):HairVoxel[]{
  const out:HairVoxel[]=[],T=30+s.top;
  if(style==='ponytail'){out.push(B(-4,18,-20,4,24,-16,4));
    out.push(B(-5,10,-24,5,22,-18),B(-4,2,-25,4,12,-19,1),B(-4,-6,-23,4,4,-17,0,2),B(-3,-12,-21,3,-4,-15,3,2));}
  if(style==='lowtail'){out.push(B(-4,0,-17,4,4,-13,4),B(-4,-12,-9,4,0,-5,0,2),B(-3,-18,-9,3,-12,-5,3,2),B(-5,-2,-15,5,2,-7,1));}
  if(style==='twintails')for(const sx of [-1,1]){
    const t=(a:number,b:number,y0:number,y1:number,z0:number,z1:number,tone=0,bone:2|3=3)=>out.push(sx>0?B(a,y0,z0,b,y1,z1,tone,bone):B(-b,y0,z0,-a,y1,z1,tone,bone));
    t(16,21,20,26,-3,3,4);t(18,26,8,22,-4,4);t(19,27,-4,10,-4,4,1);t(20,27,-12,-2,-3,3,0,2);t(21,26,-18,-10,-2,2,3,2);}
  if(style==='topknot'&&!opts.hat){out.push(B(-5,T,-5,5,T+2,5,4),B(-6,T+2,-6,6,T+8,6),B(-4,T+8,-4,4,T+10,4,2));}
  if(style==='odango'&&!opts.hat)for(const sx of [-1,1]){const x=sx*12;out.push(B(x-5,T-2,-5,x+5,T+6,5),B(x-4,T+6,-4,x+4,T+8,4,2),B(x-6,T-3,-6,x+6,T-1,6,4));}
  if(style==='quiff'&&!opts.hat){out.push(B(-14,28,10,14,36,18),B(-12,32,14,12,38,20,2),B(-10,36,10,10,40,18,1),B(-16,26,12,16,30,16));}
  if(style==='hime'){for(const sx of [-1,1]){const x0=sx>0?15:-19,x1=sx>0?19:-15;out.push(B(x0,-6,8,x1,18,15,1));}}
  if(opts.ahoge&&!opts.hat){out.push(B(-1,T,0,1,T+4,2),B(-1,T+4,2,1,T+6,4),B(-1,T+5,4,1,T+7,7,2));}
  return out;
}
/** 体素壳：逐格判断在不在头发里，然后按竖列把同色的连续格合成一个盒子 */
export function hairShell(s:HairShape,o:{hat:boolean;hood:boolean;glasses:boolean}):HairVoxel[]{
  const top=o.hat||o.hood?0:s.top,side=o.hood?0:s.side,back=o.hood?0:s.back;
  const fringe=(x:number)=>{const f=s.fringe(x);return o.glasses&&f<20?20:o.hat&&f<18?18:f;};
  const cells=new Map<string,number>();const put=(i:number,j:number,k:number,t:number)=>cells.set(i+','+j+','+k,t);
  const lowY=Math.min(s.backLen,s.sideBack,s.sideFront,0)-2;
  for(let x=-25;x<=25;x+=2)for(let y=lowY+1;y<=30+Math.max(top,2)+13;y+=2)for(let z=-25;z<=25;z+=2){
    const ax=Math.abs(x),ox=Math.max(0,ax-16),oy=Math.max(0,y-30),ozf=Math.max(0,z-14),ozb=Math.max(0,-z-14);
    if(ox===0&&oy===0&&ozf===0&&ozb===0&&y>0)continue;
    const corner=(ox>0?1:0)+(oy>0?1:0)+(ozf>0||ozb>0?1:0),r=s.round??6;
    if(corner>=2&&ox+oy+ozf+ozb>r)continue;
    let inside=false;
    if(y<0){
      // 头以下：后背一层（可能更宽），再加一圈颈后连接带
      if(s.backLen<0&&!o.hood){const half=s.backWidth?.(y)??12;if(y>=s.backLen&&z===-5&&ax<=half)inside=true;if(y>-3&&z<=-5&&z>=-13&&ax<=14)inside=true;}
      if(!inside&&!o.hood&&ox>0&&ox<=side&&z<=12&&z>=-14){const lim=s.sideFront+(s.sideBack-s.sideFront)*(14-z)/28;if(y>=lim&&lim<0)inside=true;}
    }else if(ozf>0){
      // 刘海：脸前面一层；头顶前沿也算刘海根
      if(ozf<=2&&ox===0&&y>=fringe(x)&&y<=30+top)inside=true;
      if(ozf<=2&&oy>0&&oy<=top)inside=true;
    }else if(oy>0){
      if(oy<=top&&ox<=side&&ozb<=back)inside=true;
    }else if(ox>0){
      if(ox<=side&&ozb<=back){const lim=s.sideFront+(s.sideBack-s.sideFront)*(14-z)/28;let low=lim;
        if(s.tuck&&z>=-4&&z<=6)low=Math.max(low,18);
        if(s.texture==='shag')low+=h2(x,z)%3*2-2;
        if(y>=low)inside=true;}
    }else if(ozb>0){
      if(ozb<=back){let low=s.backLen;if(s.texture==='shag')low+=h2(x,7)%3*2-2;if(y>=Math.max(low,0)||(y>=low&&y>=0))inside=true;}
    }
    if(!inside)continue;
    // 色调：按发束（每 3 列一束）取，少数几束暗一档；两侧和后脑在 Y 22–24 有一圈断续的“天使环”高光，
    // 头顶前半圈每束中间一格亮；耳朵以下的发尾暗一档。这样读成“一缕一缕的头发 + 光泽”，而不是竖条纹。
    const run=ox>0?z:x,bundle=Math.floor((run+17)/6),pos=Math.floor((run+17)/2)%3,face=ox>0?(x>0?50:-50):ozb>0?100:0;
    let t=h2(bundle+face,11)%4===0?1:0;
    if(y>=22&&y<=24&&(ox>0||ozb>0)&&pos!==0&&oy===0)t=2;
    if(oy>0&&z>=0&&z<=8&&pos===1&&(x+17)%6!==0)t=2;
    if(y<10&&oy===0&&(ox>0||ozb>0||y<0)&&t===0)t=1;
    put(x,y,z,t);
  }
  // 表面起伏
  const has=(x:number,y:number,z:number)=>cells.has(x+','+y+','+z);
  if(!o.hat&&!o.hood){
    if(s.texture==='spike'||s.texture==='flame'){const flame=s.texture==='flame';
      for(let x=-15;x<=15;x+=2)for(let z=-13;z<=13;z+=2){const sel=((x+15)/2+((z+13)/2)*2)%3===0;if(!sel)continue;
        const h=flame?8+h2(x,z)%3*4:4+h2(x,z)%3*2;const y0=31+top;
        for(let d=0;d<h;d+=2){const w=d<h/2?1:0;const zz=flame?z-Math.round(d*.6/2)*2:z;for(let dx=-w*2;dx<=w*2;dx+=2)for(let dz=-w*2;dz<=w*2;dz+=2)put(x+dx,y0+d,zz+dz,d>=h-2?2:0);}}}
    if(s.texture==='curl'||s.texture==='wave'){const lumps:Array<[number,number,number]>=[];
      for(const key of cells.keys()){const [x,y,z]=key.split(',').map(Number);const ox=Math.abs(x)-16;const sel=s.texture==='curl'?((x+y*3+z*5+99)>>1)%5===0:((y+(x>>2)*2+60)>>1)%6===0;
        if(!sel)continue;if(y>30&&!has(x,y+2,z))lumps.push([x,y+2,z]);else if(ox>0&&!has(x+Math.sign(x)*2,y,z))lumps.push([x+Math.sign(x)*2,y,z]);else if(z<-14&&!has(x,y,z-2))lumps.push([x,y,z-2]);}
      for(const [x,y,z] of lumps)put(x,y,z,1);}
  }
  // 每列最下面一格是深色发梢；按列合并
  const cols=new Map<string,Array<[number,number]>>();
  for(const [key,t] of cells){const [x,y,z]=key.split(',').map(Number);const c=x+','+z;let a=cols.get(c);if(!a)cols.set(c,a=[]);a.push([y,t]);}
  const out:HairVoxel[]=[];
  for(const [c,arr] of cols){const [x,z]=c.split(',').map(Number);arr.sort((a,b)=>a[0]-b[0]);
    // 发梢：每段连续的最下面一格
    for(let i=0;i<arr.length;i++)if((i===0||arr[i-1][0]!==arr[i][0]-2)&&arr[i][1]===0&&(arr[i][0]<30||Math.abs(x)>16||Math.abs(z)>14))arr[i][1]=3;
    let start=0;
    for(let i=1;i<=arr.length;i++){
      const brk=i===arr.length||arr[i][0]!==arr[i-1][0]+2||arr[i][1]!==arr[start][1]||(arr[i][0]<0)!==(arr[start][0]<0);
      if(brk){const y0=arr[start][0]-1,y1=arr[i-1][0]+1;out.push({x0:x-1,y0,z0:z-1,x1:x+1,y1,z1:z+1,tone:arr[start][1],bone:y1<=0?2:3});start=i;}
    }
  }
  return out;
}
