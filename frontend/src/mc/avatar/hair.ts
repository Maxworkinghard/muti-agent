/**
 * 发型零件库。每种发型由几块“发团”拼成，坐标是头部局部 T（x 左右，+x 是人物的左边；y 从颈部 0 到头顶 36；z 向前，脸在 z=+16）：
 *   发冠 dome   头顶上一层，按 2 T 一级往里收成阶梯状的圆顶，比头宽出 side、往后多出 back、往前探出 front；
 *   侧发 side   贴着头两侧，按竖条切开，每条的下沿不一样（鬓角、耳后、颈后），所以下沿是一级级的台阶；
 *   后发 back   后脑勺，同样按竖条切开，发梢参差；
 *   刘海 fringe 脸前一束一束的发片，每束往下收尖（或齐平、或圆头），束与束前后错开一格，读得出层次；
 *   附加件      马尾、双马尾、发髻、丸子、尖刺、卷团、飞机头、呆毛、发圈。
 * 大块发团的表面不是纯色：build.ts 按每个面在头上的位置调用 hairTexel 逐像素画发丝（同一缕头发跨盒子是连着的），
 * 一缕缕的分界是一道细的暗线、从中段长到发梢，侧面和后面有一道断开的光泽带，发梢压暗。没有随机数：
 * 发缕宽度、光泽带起伏都按坐标算，同一个发型永远长一样。
 * 头部以下的长发、马尾也挂在头骨上，垂在后脑勺正下方（z ≤ -9），坐下时落在椅背后面，不穿过椅背和后背。
 */
import {HEAD} from './rig';
import type {HairStyle} from './types';

export type FaceKey='px'|'nx'|'py'|'ny'|'pz'|'nz';
/** 纯色档：0 本色 1 暗 2 亮 3 最暗（里层、发梢）4 发圈 / 发饰色 */
export type Tone=0|1|2|3|4;
export interface HairBox {x0:number;y0:number;z0:number;x1:number;y1:number;z1:number;
  /** paint：按位置画发丝贴图；数字：纯色（立体方块的明暗） */
  look:'paint'|Tone;
  /** 下沿是发梢（贴图最下面压暗、参差） */
  tip?:boolean;
  /** 不画的面（贴着头、藏在别的发团里） */
  hide?:FaceKey[];
}
export type HairTexture='straight'|'wave'|'curl'|'buzz';
export interface HairPlan {
  boxes:HairBox[];
  /** 头发外轮廓离头盒子的距离（帽子、耳机按它往外放） */
  outer:{side:number;top:number;back:number;front:number};
  /** 脸上的发际线：头部局部 y，这条线以上的脸画成头发（刘海背后的暗部）；按列 x 取 */
  hairline:(x:number)=>number;
  /** 头顶分缝的位置（x），没有分缝是 null */
  part:number|null;
  texture:HairTexture;
}
export interface HairOpts {hat:'beanie'|'cap'|'beret'|null;hood:boolean;glasses:boolean;ahoge:boolean;tuck?:boolean}

const {hx,hz,h}=HEAD;
/** 发型说明（docs/art/02-character-looks.md 用） */
export const HAIR_LABEL:Record<HairStyle,string>={
  tidy:'清爽侧分短发',spiky:'刺猬头',curly:'蓬松卷发',bob:'齐刘海波波头',sweep:'侧分长刘海',curtain:'中分',lowtail:'后梳低马尾',
  wavy:'大波浪长发',ponytail:'高马尾',twintails:'双马尾',topknot:'头顶发髻',odango:'双丸子头',crew:'寸头',quiff:'飞机头',
  flame:'冲天炮',shaggy:'乱中长发',hime:'姬发式长直发',
};
/** 刘海最低能到哪（头部局部 y）：眉毛在 19–21，眼睛 9–18，眼镜框上沿 19 */
export const FRINGE_FLOOR={glasses:19,normal:13};

interface Clump {x0:number;x1:number;tip:number;shape?:'point'|'flat'|'round';lean?:-1|0|1;depth?:number}

export function planHair(style:HairStyle,o:HairOpts):HairPlan{
  const boxes:HairBox[]=[];
  const put=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,look:HairBox['look']='paint',extra:Partial<HairBox>={})=>{if(x1-x0<.2||y1-y0<.2||z1-z0<.2)return;boxes.push({x0,y0,z0,x1,y1,z1,look,...extra});};
  const covered=o.hat||o.hood;
  let part:number|null=null,texture:HairTexture='straight';
  let outer={side:2,top:4,back:3,front:2};
  /**
   * 圆顶：一级 2 T，insets[i] 是第 i 级往里收多少（左右、后面；前面收一半）；
   * 每一级的四个竖角再切掉一块（后角切得多、前角切得少），从上面和斜后方看是圆的，不是一块方砖。
   */
  const dome=(top:number,side:number,back:number,front:number,insets:number[])=>{
    const t=covered?Math.min(top,2):top;outer={side,top:t,back,front};
    const levels=Math.max(1,Math.round(t/2));
    for(let i=0;i<levels;i++){const k=covered?0:insets[i]??insets[insets.length-1],y0=h+i*2,y1=Math.min(h+t,y0+2),hide:FaceKey[]=i===0?[]:['ny'];
      const X=hx+side-k,Zb=-hz-back+k,Zf=hz+front-Math.ceil(k/2),cb=covered?2.5:Math.min(6,3+i*2),cf=covered?1.5:Math.min(2.5,1.5+i*.5);
      put(-X+cb,y0,Zb,X-cb,y1,Zf,'paint',{hide});
      for(const s of [-1,1])put(s>0?X-cb:-X,y0,Zb+cb,s>0?X:-X+cb,y1,Zf-cf,'paint',{hide:[...hide,s>0?'nx':'px']});}
  };
  /**
   * 两侧竖条：profile(z) 给下沿，front 是侧发前沿超出脸面多少。每三条有一条厚 1 T（一缕往外翘），
   * 靠后脑的两条薄 1 T（和后发的圆角接上）。
   */
  const sides=(side:number,profile:(z:number)=>number,front=1,cuts:number[]=[4,5,4,6,5,4,4])=>{
    for(const s of [-1,1]){let z=hz+front,i=0;while(z>-hz+.01){const w=Math.min(cuts[i%cuts.length],z+hz);const z0=z-w,mid=(z+z0)/2;const bottom=Math.min(h-1,profile(mid));
      const t=Math.max(1,side+(i%3===1&&!covered?1:0)-(mid<-hz+5?1:0));
      const x0=s>0?hx:-hx-t,x1=s>0?hx+t:-hx;put(x0,bottom,z0,x1,h,z,'paint',{tip:true,hide:bottom<0?['py']:[s>0?'nx':'px','py']});z=z0;i++;}}
  };
  /**
   * 后脑竖条：profile(x) 给下沿。条与条交替厚 1 T（一缕一缕），两边最外的两条薄 2 T（后脑两角是圆的）。
   */
  const back=(backT:number,side:number,profile:(x:number)=>number,cuts:number[]=[5,4,6,4,5,5,4,6,5])=>{
    let x=-hx-side,i=0;const end=hx+side;while(x<end-.01){const w=Math.min(cuts[i%cuts.length],end-x);const x1=x+w,mid=(x+x1)/2;const bottom=profile(mid);
      const t=Math.max(1,backT+(i%2&&!covered?1:0)-(Math.abs(mid)>hx+side-6?2:0));
      put(x,bottom,-hz-t,x1,h,-hz,'paint',{tip:true,hide:bottom<0?['py']:['pz','py']});x=x1;i++;}
  };
  /** 刘海：每束从发冠前沿（y=h）垂下来，下沿收尖 / 齐平 / 圆头；depth 交替让束与束前后错开 */
  const fringe=(clumps:Clump[])=>{
    const floor=o.glasses?FRINGE_FLOOR.glasses:FRINGE_FLOOR.normal;
    clumps.forEach((c,i)=>{const tip=Math.max(floor,o.hood?Math.max(c.tip,20):c.tip),d=c.depth??(i%2?2.6:2),z0=hz,z1=hz+d,w=c.x1-c.x0,shape=c.shape??'point',lean=c.lean??0;
      if(tip>=h-1)return;
      if(shape==='flat'||w<3){put(c.x0,tip,z0,c.x1,h,z1,'paint',{tip:true,hide:['nz']});return;}
      const body=shape==='round'?tip+1.5:tip+3;put(c.x0,body,z0,c.x1,h,z1,'paint',{hide:['nz']});
      if(shape==='round'){put(c.x0+1,tip,z0,c.x1-1,body,z1-.4,'paint',{tip:true,hide:['nz','py']});return;}
      const mid=tip+1.5,sh=lean*Math.min(1.5,w/5);
      put(c.x0+1+sh,mid,z0,c.x1-1+sh,body,z1-.3,'paint',{tip:true,hide:['nz','py']});
      const cw=Math.max(1.6,w*.32),cx=(c.x0+c.x1)/2+lean*w*.3;put(cx-cw/2,tip,z0,cx+cw/2,mid,z1-.6,3,{hide:['nz','py']});
    });
  };
  /** 刘海背后的暗部画到哪：每列取盖住这一列的那束的下沿往上 3 T */
  let line:(x:number)=>number=()=>h-4;
  const fringeLine=(clumps:Clump[])=>{line=x=>{const c=clumps.find(c=>x>=c.x0&&x<c.x1)??clumps.reduce((a,b)=>Math.abs((a.x0+a.x1)/2-x)<Math.abs((b.x0+b.x1)/2-x)?a:b);const floor=o.glasses?FRINGE_FLOOR.glasses:FRINGE_FLOOR.normal;return Math.min(h-2,Math.max(floor,c.tip)+3);};};
  const useFringe=(clumps:Clump[])=>{fringe(clumps);fringeLine(clumps);};
  const tie=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number)=>put(x0,y0,z0,x1,y1,z1,4);
  const blob=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,t:Tone=0)=>put(x0,y0,z0,x1,y1,z1,t);
  /** 尖刺：从 (x,y,z) 往上长 height，越往上越细，lean 往后倒（-z） */
  const spike=(x:number,y:number,z:number,height:number,base:number,lean:number,light=false)=>{const n=3;for(let i=0;i<n;i++){const w=base*(1-i/(n+.4)),y0=y+i*height/n,y1=y+(i+1)*height/n,zz=z-lean*i*height/n*.55;put(x-w/2,y0,zz-w/2,x+w/2,y1,zz+w/2,i===n-1?(light?2:0):i===0?1:0);}};
  /** 卷团：贴在发团外表面上的小方块，交替亮暗 */
  const curl=(x:number,y:number,z:number,s:number,t:Tone)=>put(x-s/2,y-s/2,z-s/2,x+s/2,y+s/2,z+s/2,t);

  switch(style){
    case 'tidy':{ // 清爽侧分：分缝在人物右侧（-x），刘海整片往人物左边扫，耳朵露出来
      part=-7;dome(5,2,3,2,[0,2,4.5]);
      sides(2,z=>z>11?15:z>-3?(o.tuck===false?12:19):z>-9?11:8);
      back(3,2,x=>Math.round(4+Math.abs(x)*.28));
      useFringe([{x0:-hx-1,x1:-12,tip:27,lean:1},{x0:-12,x1:-7,tip:25,lean:1},{x0:-7,x1:-1,tip:21,lean:1},{x0:-1,x1:5,tip:21,lean:1},{x0:5,x1:11,tip:22,lean:1},{x0:11,x1:hx+1,tip:24,lean:1}]);
      break;}
    case 'spiky':{ // 刺猬头：头顶一簇簇往后倒的尖刺，两鬓往外支，刘海锯齿
      dome(3,2,3,2,[0,1]);
      sides(2,z=>z>11?16:z>-3?18:10);
      back(3,2,x=>((Math.floor((x+20)/4))%2?4:8));
      useFringe([{x0:-hx-1,x1:-12,tip:24},{x0:-12,x1:-6,tip:21,lean:-1},{x0:-6,x1:0,tip:20},{x0:0,x1:6,tip:21,lean:1},{x0:6,x1:12,tip:22},{x0:12,x1:hx+1,tip:24,lean:1}]);
      if(!covered){
        for(const [x,z,ht,lean] of [[-12,8,8,.4],[-4,10,10,.5],[5,9,9,.4],[13,6,7,.3],[-9,-2,10,.8],[2,-1,12,.9],[11,-4,9,.8],[-3,-11,8,1],[8,-12,7,1]] as const)spike(x,h+3,z,ht,6,lean,ht>9);
        for(const s of [-1,1]){put(s>0?hx+2:-hx-6,26,2,s>0?hx+6:-hx-2,29,6,1);put(s>0?hx+5:-hx-8,27,3,s>0?hx+8:-hx-5,28.5,5,0);}
      }
      break;}
    case 'curly':{ // 蓬松卷发：一层发冠打底，外面一圈大卷团（顶上、两侧、后脑），轮廓是一团一团的；侧发到下巴，刘海圆头
      texture='curl';dome(5,3,4,2,[0,2,4.5]);
      sides(3,z=>z>8?12:z>-4?10:8,1);
      back(4,3,()=>6);
      useFringe([{x0:-hx-2,x1:-11,tip:24,shape:'round'},{x0:-11,x1:-4,tip:22,shape:'round'},{x0:-4,x1:3,tip:23,shape:'round'},{x0:3,x1:10,tip:21,shape:'round'},{x0:10,x1:hx+2,tip:24,shape:'round'}]);
      if(!covered){let n=0;const lump=(x:number,y:number,z:number,sz:number,cap:'top'|'none'='none')=>{const t:Tone=(n++%3===1?1:0);curl(x,y,z,sz,t);if(cap==='top')put(x-sz/2+1.5,y+sz/2,z-sz/2+1.5,x+sz/2-1.5,y+sz/2+1.5,z+sz/2-1.5,2);};
        // 顶上一圈大卷团（大小、高低都不一样，互相压着）
        for(const [x,z,sz,dy] of [[-12,9,8,0],[-3,11,7,1],[7,10,8,0],[14,5,7,-1],[-15,-1,8,-1],[-5,1,9,1],[5,-1,8,1.5],[14,-5,7,0],[-11,-10,8,0],[0,-11,8,.5],[10,-12,7,0]] as const)lump(x,h+4.5+dy,z,sz,'top');
        // 两侧：上面三团、下面两团，前后错开
        for(const sx of [-1,1])for(const [y,z,sz] of [[30,8,6],[29,-3,6],[27,-12,6],[20,2,5],[19,-8,6],[12,-4,5],[11,-12,5]] as const)lump(sx*(hx+3+sz/2-1),y,z,sz);
        // 后脑：错开的三排，越往下越小
        for(const [x,y,sz] of [[-13,30,8],[-3,31,8],[7,30,8],[15,28,6],[-9,22,7],[2,21,8],[12,21,6],[-14,14,6],[-5,12,7],[5,13,6],[13,12,6]] as const)lump(x,y,-hz-5-(sz-6)/2,sz);}
      break;}
    case 'bob':{ // 齐刘海波波头：两侧和后面齐到下巴，下沿往外翘一点
      dome(5,3,4,2,[0,2,4.5]);
      sides(3,z=>z>8?4:3,1,[4,4,5,5,4,6,4]);
      for(const s of [-1,1])put(s>0?hx+3:-hx-4,3,-hz,s>0?hx+4:-hx-3,7,hz+1,'paint',{tip:true});
      back(4,3,()=>3);
      useFringe([-hx-1,-12,-6,0,6,12].map((x0,i,a)=>({x0,x1:i===a.length-1?hx+1:a[i+1],tip:i%2?20:21,shape:'flat' as const})));
      break;}
    case 'sweep':{ // 侧分长刘海：一侧刘海斜着盖到眼角，另一侧短、别在耳后
      part=-9;dome(5,2,3,2,[0,2,4.5]);
      sides(2,z=>z>9?14:z>-3?17:10);
      back(3,2,x=>Math.round(7+Math.abs(x)*.12));
      useFringe([{x0:-hx-1,x1:-10,tip:26,lean:1},{x0:-10,x1:-4,tip:23,lean:1},{x0:-4,x1:2,tip:21,lean:1},{x0:2,x1:8,tip:18,lean:1},{x0:8,x1:13,tip:15,lean:1},{x0:13,x1:hx+1,tip:13,lean:1}]);
      break;}
    case 'curtain':{ // 中分：两片刘海从中缝往两边分开，外侧长到眉尾，两侧到下颌
      part=0;dome(5,3,3,2,[0,2,4.5]);
      sides(3,z=>z>9?(o.tuck?8:5):z>-3?(o.tuck?19:5):7);
      back(3,3,()=>5);
      useFringe([{x0:-hx-1,x1:-13,tip:16,lean:-1},{x0:-13,x1:-8,tip:20,lean:-1},{x0:-8,x1:-3,tip:24,lean:-1},{x0:-3,x1:0,tip:28,shape:'flat'},{x0:0,x1:3,tip:28,shape:'flat'},{x0:3,x1:8,tip:24,lean:1},{x0:8,x1:13,tip:20,lean:1},{x0:13,x1:hx+1,tip:16,lean:1}]);
      break;}
    case 'lowtail':{ // 后梳低马尾：额头露出来，头发全梳到后面，在后颈扎一束垂下去
      // 发际线是一级级往中间收的“美人尖”：两边高、中间低，三条梳向后的发片前后错开
      dome(3,2,3,1,[0,2]);line=x=>Math.abs(x)<4?28:Math.abs(x)<10?30:32;
      sides(2,z=>z>11?19:z>-3?19:9);
      back(3,2,x=>Math.abs(x)<5?8:4);
      put(-4,28,hz-.5,4,h,hz+1.6,'paint',{hide:['nz']});for(const s of [-1,1])put(s>0?4:-10,30,hz-.5,s>0?10:-4,h,hz+1.2,'paint',{hide:['nz']});for(const s of [-1,1])put(s>0?10:-hx-.5,32,hz-.5,s>0?hx+.5:-10,h,hz+.9,'paint',{hide:['nz']});
      tie(-4.5,3,-hz-5.5,4.5,9,-hz-2);
      put(-4.5,-6,-hz-7,4.5,4,-hz-1.5,'paint',{tip:true});put(-3.6,-14,-hz-6.4,3.6,-6,-hz-2,'paint',{tip:true});put(-2.2,-18,-hz-5.6,2.2,-14,-hz-2.6,3);
      break;}
    case 'wavy':{ // 大波浪长发：侧发过下巴，后面垂到肩下，下沿一卷一卷
      texture='wave';dome(5,4,4,2,[0,2,4.5]);
      sides(4,z=>z>8?2:z>-4?-2:-5,1);
      back(4,4,x=>-9-((Math.floor((x+22)/5))%2?2:0));
      useFringe([{x0:-hx-2,x1:-9,tip:20,lean:-1},{x0:-9,x1:-2,tip:22,lean:-1},{x0:-2,x1:5,tip:22,lean:1},{x0:5,x1:12,tip:21,lean:1},{x0:12,x1:hx+2,tip:18,lean:1}]);
      for(const s of [-1,1])for(const [y,z] of [[0,10],[-3,2],[-5,-8]] as const)curl(s*(hx+2),y,z,4,1);
      break;}
    case 'ponytail':{ // 高马尾：后脑偏上扎一束，往后翘再垂下来
      dome(5,2,3,2,[0,2,4.5]);
      sides(2,z=>z>11?16:z>-3?18:10);
      back(3,2,x=>Math.round(6+Math.abs(x)*.15));
      useFringe([{x0:-hx-1,x1:-11,tip:23,lean:-1},{x0:-11,x1:-4,tip:21,lean:-1},{x0:-4,x1:3,tip:22},{x0:3,x1:10,tip:21,lean:1},{x0:10,x1:hx+1,tip:24,lean:1}]);
      tie(-4,23,-hz-5,4,29,-hz-2);
      put(-4.5,17,-hz-10,4.5,29,-hz-4,'paint');put(-4,6,-hz-12,4,18,-hz-6,'paint');put(-3.4,-3,-hz-11.5,3.4,7,-hz-6.5,'paint',{tip:true});put(-2,-8,-hz-10.5,2,-3,-hz-7.5,3);
      break;}
    case 'twintails':{ // 双马尾：两边耳后各扎一束，垂到肩下
      dome(5,2,3,2,[0,2,4.5]);
      sides(2,z=>z>11?15:z>-3?17:10);
      back(3,2,x=>Math.round(6+Math.abs(x)*.15));
      useFringe([{x0:-hx-1,x1:-12,tip:21},{x0:-12,x1:-6,tip:20,shape:'flat'},{x0:-6,x1:0,tip:21,shape:'flat'},{x0:0,x1:6,tip:20,shape:'flat'},{x0:6,x1:12,tip:21,shape:'flat'},{x0:12,x1:hx+1,tip:21}]);
      for(const s of [-1,1]){const X=(a:number,b:number):[number,number]=>s>0?[a,b]:[-b,-a];
        const t=X(hx+1,hx+5);tie(t[0],23,-6,t[1],29,0);
        const a=X(hx+2,hx+9);put(a[0],10,-7,a[1],26,1,'paint');const b=X(hx+3,hx+9.5);put(b[0],-2,-6.5,b[1],11,.5,'paint',{tip:true});const c=X(hx+4.5,hx+8.5);put(c[0],-8,-5.5,c[1],-2,-.5,3);}
      break;}
    case 'topknot':{ // 头顶发髻：头发全往上收，头顶扎一个髻，额头露出来
      dome(3,2,3,1,[0,2]);line=x=>31-(Math.abs(x)<3?2:0)+(Math.abs(x)>12?-2:0);
      sides(2,z=>z>11?20:z>-3?19:10);
      back(3,2,x=>Math.round(5+Math.abs(x)*.2));
      put(-hx-.5,31,hz-.5,hx+.5,h,hz+1.2,'paint',{hide:['nz','py']});
      if(!covered){tie(-4.5,h+3,-7,4.5,h+5,2);put(-5.5,h+5,-8,5.5,h+12,3,'paint');put(-3.5,h+12,-6,3.5,h+14,1,2);}
      break;}
    case 'odango':{ // 双丸子：头顶两侧各一个圆髻，扎发圈
      dome(5,2,3,2,[0,2,4.5]);
      sides(2,z=>z>11?15:z>-3?16:10);
      back(3,2,x=>Math.round(6+Math.abs(x)*.15));
      useFringe([{x0:-hx-1,x1:-11,tip:22,lean:-1},{x0:-11,x1:-4,tip:21},{x0:-4,x1:3,tip:22},{x0:3,x1:10,tip:21},{x0:10,x1:hx+1,tip:22,lean:1}]);
      if(!covered)for(const s of [-1,1]){const x=s*11;tie(x-5,h+4,-4,x+5,h+5.5,6);put(x-5.5,h+5.5,-5,x+5.5,h+12,7,'paint');put(x-3.5,h+12,-3,x+3.5,h+13.5,5,2);}
      break;}
    case 'crew':{ // 寸头：贴着头皮一层，没有刘海，发际线一刀齐
      texture='buzz';dome(2,1,2,0,[0]);line=x=>29-(Math.abs(x)>14?2:0);
      sides(1,z=>z>11?21:z>-3?20:12,0,[5,8,8,8,8]);
      back(2,1,x=>Math.round(8+Math.abs(x)*.12),[8,8,8,8,8,8]);
      put(-hx-.3,29,hz-.3,hx+.3,h,hz+.7,'paint',{hide:['nz','py']});
      break;}
    case 'quiff':{ // 飞机头：两侧推短，前额一大块往上往前翘
      dome(3,1,2,1,[0,1]);line=()=>30;
      sides(1,z=>z>11?21:z>-3?20:12,0,[5,8,8,8,8]);
      back(2,1,x=>Math.round(8+Math.abs(x)*.12),[8,8,8,8,8,8]);
      put(-hx-.3,30,hz-.3,hx+.3,h,hz+1,'paint',{hide:['nz','py']});
      if(!covered){put(-13,h+.05,4,13,h+6,hz+5,'paint');put(-11,h+6,6,11,h+9,hz+6,'paint');put(-9,h+1,hz+5,9,h+7,hz+7.5,'paint',{tip:true});put(-6,h+9,8,6,h+10.5,hz+3,2);}
      break;}
    case 'flame':{ // 冲天炮：额前头发全往上翻，一簇簇往上往后炸开
      dome(3,2,3,2,[0,1]);line=x=>29-(Math.abs(x)<5?1:0);
      sides(2,z=>z>11?17:z>-3?19:10);
      back(3,2,x=>((Math.floor((x+20)/4))%2?5:9));
      put(-hx-.5,29,hz-.5,hx+.5,h,hz+1.5,'paint',{hide:['nz','py']});
      if(!covered){for(const [x,z,ht,lean,base] of [[-12,10,10,.7,6],[-4,12,14,.8,7],[5,11,12,.8,7],[13,9,9,.6,6],[-9,0,12,1.1,6],[1,1,16,1.2,7],[10,-2,11,1.1,6],[-3,-10,9,1.3,6],[8,-11,8,1.3,5]] as const)spike(x,h+3,z,ht,base,lean,true);
        for(const x of [-10,-3,4,11])spike(x,28,hz+1,9,5,.9,false);}
      break;}
    case 'shaggy':{ // 乱中长发：盖住耳朵，下沿参差，刘海一缕缕长短不齐
      dome(5,4,4,2,[0,2,4.5]);
      sides(4,z=>[8,12,6,10,5,9,7][Math.floor((hz+1-z)/4.6)%7]??8,1,[4,5,4,5,4,5,5]);
      back(4,4,x=>[6,3,8,4,7,2,6,4,5][Math.floor((x+22)/5)%9]??5);
      useFringe([{x0:-hx-2,x1:-12,tip:21,lean:-1},{x0:-12,x1:-7,tip:18},{x0:-7,x1:-2,tip:22,lean:1},{x0:-2,x1:3,tip:19},{x0:3,x1:8,tip:23,lean:-1},{x0:8,x1:13,tip:19,lean:1},{x0:13,x1:hx+2,tip:21,lean:1}]);
      break;}
    case 'hime':{ // 姬发式：齐刘海、两颊一刀切的鬓发，后面长发垂到背上
      dome(5,2,4,2,[0,2,4.5]);
      sides(2,z=>z>9?3:z>-3?12:-4);
      back(4,2,()=>-12);
      useFringe([-hx-1,-12,-6,0,6,12].map((x0,i,a)=>({x0,x1:i===a.length-1?hx+1:a[i+1],tip:20,shape:'flat' as const})));
      for(const s of [-1,1])put(s>0?hx-1:-hx-3,2,9,s>0?hx+3:-hx+1,22,hz+1.5,'paint',{tip:true});
      break;}
  }
  if(o.ahoge&&!covered){const t=h+outer.top;put(-1,t,-1,1,t+4,1,0);put(-1,t+4,0,1,t+6,3,0);put(-1,t+5,3,1,t+7,6,2);}
  // 兜帽戴上：只剩脸前的刘海（收在帽沿里面），其余头发都在兜帽里
  if(o.hood){const keep=boxes.filter(b=>b.z0>=hz-.01&&b.x0>=-hx+.5&&b.x1<=hx-.5);boxes.length=0;boxes.push(...keep);outer={side:0,top:0,back:0,front:0};}
  return {boxes,outer,hairline:line,part,texture};
}

/** 发丝贴图的配色：本色、暗、亮、最暗、发圈 */
export function hairColors(base:string,tie:string,tone:(c:string,f:number)=>string,mix:(a:string,b:string,t:number)=>string):[string,string,string,string,string]{
  const n=parseInt(base.slice(1),16),lum=(.2126*((n>>16)&255)+.7152*((n>>8)&255)+.0722*(n&255))/255;
  // 黑发的光泽偏冷（蓝紫），浅色头发的光泽往白里提
  const light=lum<.22?mix(base,'#a6b4d4',.46):mix(base,'#fff6e0',.3);
  return [base,tone(base,.8),light,tone(base,lum<.22?.7:.62),tie];
}
const hsh=(a:number,b:number)=>(((Math.floor(a)*73856093)^(Math.floor(b)*19349663))>>>0)%1000;
/** 一缕头发的边界：沿着 s（侧面是 z，前后、头顶是 x）按 4–7 T 宽分缕，返回到最近边界的距离和缕号 */
function lock(s:number,salt:number){const widths=[5,4,6,4,7,5,4,6],P=41;let a=((s+60+salt*7)%P+P)%P,i=0;while(a>=widths[i%widths.length]){a-=widths[i%widths.length];i++;}return {d:a,i,w:widths[i%widths.length]};}
/**
 * 发丝贴图的一个像素：face 是哪个面，(x,y,z) 是这个像素在头部局部坐标里的位置，box 是所在发团。
 * 返回调色板下标（0 本色 1 暗 2 亮 3 最暗）。
 */
export function hairTexel(plan:HairPlan,face:FaceKey,x:number,y:number,z:number,box:HairBox):number{
  const tex=plan.texture;
  if(face==='ny')return 3;
  // 寸头：贴头皮的短发，只有很淡的颗粒（暗点稀疏），顶上稍亮
  if(tex==='buzz'){const d=hsh(x*3+y*5,z*3+(face==='py'?7:0));if(face==='py')return d%37===0?1:d%29===0?2:0;return d%41===0?1:y<box.y0+1?1:0;}
  const fromTip=y-box.y0;
  if(face==='py'){
    // 头顶：发缕前后走向，分缝一道暗线，前三分之一一道弧形光泽（连成一片，只在缕缝处断一个像素）
    if(plan.part!==null&&Math.abs(x-plan.part)<.6&&z>-6)return 3;
    const k=lock(x,3);if(k.d<1&&z<hz-8&&hsh(x,z)%4!==0)return 1;
    const arc=hz-7+Math.abs(x)*.12+(k.i%2?.6:0);if(z>arc&&z<arc+2.2)return k.d<1?0:2;
    if(tex==='curl'&&hsh(x+3,z)%9===0)return 2;
    return z<-hz+2?1:0;
  }
  // 侧面、前面、后面：发缕竖着走
  const s=face==='px'||face==='nx'?z*(face==='px'?-1:1):face==='nz'?-x:x;
  const wav=tex==='wave'?Math.round(Math.sin(y/3.2)*1.2):0;
  const k=lock(s+wav,face==='pz'?1:face==='nz'?2:0);
  if(box.tip&&fromTip<1)return 3;
  if(box.tip&&fromTip<2&&(k.d<1||k.i%2===1))return 3;
  // 刘海（脸前的发片）：每片左上角一道竖的高光，下半截暗一档
  if(face==='pz'&&box.z0>=hz-.01){const lx=x-box.x0;if(lx>=1&&lx<2&&y>h-7&&y<h-1)return 2;if(k.d<1&&y<h-4)return 1;return fromTip<3&&box.tip?1:0;}
  // 缕与缕之间的暗线：从这一缕的“分叉点”往下长到发梢
  const split=h-9-((k.i*7)%7);
  if(k.d<1&&y<split)return 1;
  // 光泽：侧面和后面每缕靠左两列各一道短竖高光（3 T 和 2 T，错开 1 T），高低按缕错开——一缕一缕的反光，不是一圈虚线
  if(face!=='pz'&&k.w>=4){const band=h-10+((k.i*5)%3);if(k.d>=1&&k.d<2&&y>band&&y<band+4)return 2;if(k.d>=2&&k.d<3&&y>band+1&&y<band+3)return 2;}
  if(tex==='curl'&&hsh(s*2,y*2)%13===0)return y>h-14?2:1;
  // 下半截暗一档（侧面背光），发梢附近再暗
  if(box.tip&&fromTip<4&&k.i%3===0)return 1;
  return y<10?1:0;
}
