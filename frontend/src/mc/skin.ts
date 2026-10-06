import * as THREE from 'three';
import type {PersonaVisual,MindView} from '../types';
export interface Skin {canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;face(mind:MindView|undefined,t:number,speaking:boolean,reduced:boolean,extra?:Array<'raise'|'shock'|'cheer'|'frown'|'happy'>):void}
/** 高清皮肤（第 11.3 节）：256×256，布局按 64×64 等比放大 4 倍，脸 32×32，画得出眼神光、眉形、嘴型和衣褶。
 *  绘制坐标仍按 64 格写（允许 0.25 的分数，S=4 时正好 1 个高清像素），由 S 统一放大，player.ts 的 UV 不用改。 */
export function createSkin(id:string,v:PersonaVisual,side:string):Skin {
  const S=4,canvas=document.createElement('canvas');canvas.width=canvas.height=64*S;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  let seed=Array.from(id).reduce((n,s)=>Math.imul(n,31)+s.charCodeAt(0),7)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const toneCache=new Map<string,string>();
  const tone=(color:string,f:number)=>{const key=color+'|'+Math.round(f*100);let out=toneCache.get(key);if(!out){const n=new THREE.Color(color);out='#'+[n.r,n.g,n.b].map(x=>Math.round(Math.min(1,Math.max(0,THREE.ColorManagement.workingToColorSpace(new THREE.Color(x,x,x),THREE.SRGBColorSpace).r*f))*255).toString(16).padStart(2,'0')).join('');toneCache.set(key,out);}return out;};
  // 整张静态噪点画布：矩形按位置取用，表情重画不会闪，也不用逐像素算颜色。
  const noise=document.createElement('canvas');noise.width=noise.height=64*S;{const nc=noise.getContext('2d')!;for(let y=0;y<noise.height;y++)for(let x=0;x<noise.width;x++){const r=random();if(r<.5){nc.fillStyle=r<.25?'rgba(255,255,255,.045)':'rgba(0,0,0,.045)';nc.fillRect(x,y,1,1);}}}
  const rectangle=(x:number,y:number,w:number,h:number,color:string,shade=1)=>{c.fillStyle=tone(color,shade);c.fillRect(x*S,y*S,w*S,h*S);c.drawImage(noise,x*S,y*S,w*S,h*S,x*S,y*S,w*S,h*S);};
  // 小块特征直接画，alpha 用来做柔和的暗部和高光。
  const px=(x:number,y:number,w:number,h:number,color:string,alpha=1)=>{c.globalAlpha=alpha;c.fillStyle=color;c.fillRect(x*S,y*S,w*S,h*S);c.globalAlpha=1;};
  // 每个人的默认神态、眨眼节奏和穿衣风格都由 id 决定（第 12.12 节第 2、9 条）。
  const hash=Array.from(id).reduce((n,s)=>Math.imul(n,31)+s.charCodeAt(0),7)>>>0;
  const variant=hash%3,style=(hash>>>5)%4;
  const box=(u:number,vv:number,w:number,h:number,d:number,color:string)=>{rectangle(u+d,vv,w,d,color,1.08);rectangle(u+d+w,vv,w,d,color,.9);rectangle(u,vv+d,d,h,color,.94);rectangle(u+d,vv+d,w,h,color);rectangle(u+d+w,vv+d,d,h,color,.94);rectangle(u+2*d+w,vv+d,w,h,color,.94);};
  box(0,0,8,8,8,v.hair);box(16,16,8,12,4,v.shirt);box(40,16,4,12,4,v.shirt);box(32,48,4,12,4,v.shirt);
  // 服装（第 12.12 节第 9 条）：按人物穿不同的衣服——开衫、连帽卫衣、毛衣、卷袖衬衫，
  // 有领口、口袋、袖口、接缝和明暗；裤子是深色牛仔/卡其，队别只是一条挂绳胸牌。不再是一排白扣子加方块徽章。
  const pants=['#2f3b52','#4a4438','#33313a','#3a3244'][(hash>>>3)%4],jacket=tone(v.shirt,.6),sleeve=style===0?jacket:v.shirt;
  function armSleeve(u:number,y:number){box(u,y,4,12,4,sleeve);if(style===3){rectangle(u,y+9,4,3,v.skin);px(u,y+8.75,4,.5,tone(v.shirt,.85));}else{rectangle(u,y+10.75,4,.75,tone(sleeve,.8));rectangle(u+4,y+12,4,4,v.skin);rectangle(u+4,y+11,4,1,v.accent);px(u+4.25,y+12.25,.6,.6,'#fff',.25);}}
  if(style===0){
    // 开衫外套：两侧是外套色，中间露衬衫，V 字领口，接缝和下摆。
    rectangle(20,20,2.25,12,jacket);rectangle(25.75,20,2.25,12,jacket);rectangle(22.25,20,3.5,12,v.shirt);
    px(22.25,20,.4,12,tone(jacket,.8));px(25.35,20,.4,12,tone(jacket,.8));
    rectangle(21,20,6,.75,tone(jacket,1.12));px(23.1,20.75,.9,.9,v.skin);
    rectangle(20,31.25,8,.75,tone(jacket,.78));rectangle(21.25,29,1.5,1.5,tone(jacket,.85));rectangle(25.25,29,1.5,1.5,tone(jacket,.85));
  }else if(style===1){
    // 连帽卫衣：帽兜堆在后背（帽子层），胸前两根抽绳，袋鼠兜。
    rectangle(21.75,20.5,.5,3,v.accent);rectangle(25.75,20.5,.5,3,v.accent);px(21.85,23.4,.3,.3,v.accent);px(25.85,23.4,.3,.3,v.accent);
    rectangle(21.5,28.25,5,2.5,tone(v.shirt,.82));px(21.5,28.25,5,.3,tone(v.shirt,.7));px(24,28.4,.4,2.2,tone(v.shirt,.72));
    rectangle(20,31.4,8,.6,tone(v.shirt,.85));
    rectangle(32,36,8,5,tone(v.shirt,.9));px(32,36,8,.6,tone(v.shirt,.76));
  }else if(style===2){
    // 毛衣：圆领罗纹，下摆罗纹。
    rectangle(21.5,20,5,.75,v.accent);rectangle(20,20,.75,12,tone(v.shirt,.88));rectangle(27.25,20,.75,12,tone(v.shirt,.88));
    for(let x=20;x<28;x+=1){px(x,30.75,.5,1.25,tone(v.shirt,.78));}
    rectangle(20,31.25,8,.5,tone(v.shirt,.72));
  }else{
    // 卷袖衬衫：中间一道门襟，胸口一个小贴袋，前臂卷起露肤色。
    px(23.75,20,.5,12,tone(v.shirt,.8));px(23.25,20,.25,12,tone(v.shirt,1.15));
    rectangle(25.5,23.5,1.5,1.75,tone(v.shirt,.85));px(25.5,23.5,1.5,.25,tone(v.shirt,.72));
    rectangle(20,20,8,.75,tone(v.shirt,.92));
  }
  armSleeve(40,16);armSleeve(32,48);
  for(const [u,y] of [[0,16],[16,48]]){box(u,y,4,12,4,pants);rectangle(u+4,y+14,4,2,'#29252b');rectangle(u+4,y+15,4,1,'#151318');}
  // 队别：全队统一的挂绳胸牌（第 12.12 节第 9 条），主持是金色的。
  const teamHex=side==='pro'?'#4e79a1':side==='con'?'#c45f53':'#c9973a';
  rectangle(23.4,20.4,.45,2.4,teamHex);rectangle(22.85,22.6,1.55,.9,'#f6f2e8');px(22.85,22.6,1.55,.22,teamHex);
  if(style===1){rectangle(20,20,8,.75,v.accent);}
  if(v.extras?.includes('scarf')){rectangle(20,36,8,2,v.accent);rectangle(22,38,2,5,v.accent);px(22.25,38.25,.4,1.2,'#fff',.12);}
  if(v.hairStyle==='long'){rectangle(52,8,8,8,v.hair);rectangle(32,36,8,5,v.hair);rectangle(32,8,8,8,v.hair);rectangle(48,8,4,8,v.hair);}
  if(v.hairStyle==='bun'){rectangle(54,10,4,4,v.hair);px(54.5,10.5,1,1,'#fff',.1);}
  if(['cap','hood','beanie'].includes(v.hairStyle??'')){box(32,0,8,8,8,v.hairStyle==='beanie'?v.accent:v.shirt);c.clearRect(41*S,9*S,6*S,7*S);}
  if(['spiky','curly'].includes(v.hairStyle??'')){for(let i=0;i<8;i++)if(i%2===0)rectangle(40+i,8,1,2,v.hair);rectangle(52,8,8,2,v.hair);}
  if(v.extras?.includes('scarf')){rectangle(20,36,8,2,v.accent);rectangle(22,38,2,5,v.accent);px(22.25,38.25,.4,1.2,'#fff',.12);}
  // 头顶的几道发丝高光，位置由人物 id 决定。
  for(const [x,y,w,h] of [[9,1,1,2],[12.5,.5,1,3],[10.5,2.25,1,1.25]])px(x,y,w,h,'#fff',.08);
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  const lash=tone(v.hair,.55),brow=tone(v.hair,.62),iris='#2E2836',pupil='#16141F',lip=tone(v.skin,.5),lipDark=tone(v.skin,.34),tooth='#F5EFE8';
  // 每个人的默认神态和眨眼节奏都不同（第 12.12 节第 2 条）：有的嘴角微翘、有的抿着，眉毛高低差半格。
  const browY=10.75+(hash%2)*.25,blinkPhase=hash%4100;
  let last='';
  function face(m:MindView|undefined,t:number,speaking:boolean,reduced:boolean,extra:Array<'raise'|'shock'|'cheer'|'frown'|'happy'>=[]){
    const f=new Set([...(v.extras??[]),...(m?.face??[]),...extra]);for(const n of m?.mood??[])if(n.value>=(n.key==='信心'?5:3))f.add(n.key==='火气'?'brows':n.key==='压力'?'sweat':n.key==='信心'?'happy':'blush');
    const mouth=speaking?Math.floor(t/140)%3:-1,blink=!reduced&&Math.floor((t+blinkPhase)%4100/120)===0,signature=[...f].sort().join(',')+mouth+blink;
    if(signature===last)return;last=signature;
    // 脸底：肤色、刘海、发丝、下颌两侧和下巴的暗部。
    rectangle(8,8,8,8,v.skin);
    const fringe=['side','middle'].includes(v.hairStyle??'')?1:2;rectangle(8,8,8,fringe,v.hair);
    if(v.hairStyle==='side'){rectangle(8,9,3,1,v.hair);px(10.5,9,.5,1,tone(v.hair,.8),.7);}
    if(v.hairStyle==='middle'){rectangle(8,9,3,1,v.hair);rectangle(13,9,3,1,v.hair);}
    px(9.25,8.25,.5,1.5,'#fff',.08);px(12.75,8.5,.5,1.25,'#fff',.08);
    px(8,13.25,.4,2.25,'#000',.05);px(15.6,13.25,.4,2.25,'#000',.05);px(8.5,15.25,7,.75,'#000',.06);
    // 眉形：放松的精神眉（第 12.12 节第 2 条：默认不皱眉），位置每人差半格；火气时眉梢压向鼻梁；挑眉时整条抬高。
    if(f.has('brows')){px(8.75,browY-.25,1.75,.5,brow);px(9.25,browY+.25,2.75,.75,brow);px(13,browY+.25,2.75,.75,brow);px(13.5,browY-.25,1.75,.5,brow);}
    else if(f.has('raise')){px(8.75,browY-.5,3,.5,brow);px(9.25,browY,2,.5,brow);px(12.25,browY-.5,3,.5,brow);px(12.75,browY,2,.5,brow);}
    else{px(8.75,browY,3,.5,brow);px(9.25,browY+.5,2,.5,brow);px(12.25,browY,3,.5,brow);px(12.75,browY+.5,2,.5,brow);}
    // 眼睛：眼线、白眼仁、瞳孔、眼神光；眨眼和 sleepy 合上一条肤色的缝；惊讶时眼睛睁大（白眼仁加高）。
    const shock=f.has('shock');
    for(const e of [8.75,12.75]){
      px(e,12,2.5,.25,lash);
      if(blink||f.has('sleepy')){px(e,12.25,2.5,.5,tone(v.skin,.62));}
      else{
        px(e,shock?12.05:12.25,2.5,shock?1:.75,'#FFFFFF');
        const inner=e===8.75?10:13;px(inner,shock?12.05:12.25,1,shock?1:.75,iris);px(inner+(shock?.3:.25),shock?12.15:12.25,shock?.45:.5,shock?.6:.5,pupil);px(inner,shock?12.05:12.25,.3,.3,'#FFFFFF');
        px(e,shock?12.9:12.75,.25,.25,v.skin);px(e+2.25,shock?12.9:12.75,.25,.25,v.skin);
      }
    }
    if(f.has('blush')){px(8,13,1.5,.75,'#D98782',.85);px(9.5,13.25,.5,.5,'#E8A39E',.5);px(14.5,13,1.5,.75,'#D98782',.85);px(14,13.25,.5,.5,'#E8A39E',.5);}
    // 嘴：说话三帧（小口、圆口、扁口），grin 露牙齿，happy 嘴角上翘，憋屈抿平；惊讶张小圆口，大笑大张嘴眯眼，失望嘴角下垂。
    if(mouth===0){px(11,13.875,2,1.125,lip);px(11.5,14.125,1,.625,lipDark);px(11.25,15.125,1.5,.25,'#fff',.12);}
    else if(mouth===1){px(10.75,13.625,2.5,1.875,lip);px(11.25,14.125,1.5,1,lipDark);px(11.5,14.75,1,.375,'#B26B62');px(10.75,13.625,.25,.25,v.skin);px(13,13.625,.25,.25,v.skin);px(10.75,15.25,.25,.25,v.skin);px(13,15.25,.25,.25,v.skin);}
    else if(mouth===2){px(9.75,14.25,4.5,.5,lip);px(10,14.25,4,.2,tooth,.9);}
    else if(shock){px(10.75,13.75,2.5,1.5,lip);px(11.25,14.25,1.5,.75,'#5e2f2c');px(11.5,14.35,1,.35,tooth,.85);}
    else if(f.has('cheer')){px(9.5,13.5,5,2.25,lip);px(9.9,13.7,4.2,.45,tooth,.95);px(10.5,14.6,3,.9,'#B26B62');px(9.5,13.5,.25,.25,lip);px(14.25,13.5,.25,.25,lip);px(9.25,13.25,.25,.25,lip,.6);px(14.5,13.25,.25,.25,lip,.6);}
    else if(f.has('grin')){px(9.75,13.875,4.5,.875,lip);px(10,13.9,4,.3,tooth,.9);px(9.5,13.625,.25,.25,lip);px(14.25,13.625,.25,.25,lip);}
    else if(f.has('frown')){px(10.5,14.6,3,.5,lip);px(10.25,14.25,.35,.35,lip,.8);px(13.4,14.25,.35,.35,lip,.8);}
    else{px(10.5,14.25,3,.5,lip);px(10.25,14.375,.25,.25,lip,.7);px(13.5,14.375,.25,.25,lip,.7);
      // 默认的放松嘴（第 12.12 节第 2 条）：0 号嘴角微翘，1 号平直但放松，2 号浅笑——不再是抿成一条线的凶相。
      if(variant===0){px(10.25,13.975,.3,.3,lip);px(13.45,13.975,.3,.3,lip);}
      else if(variant===2){px(10.25,13.85,.35,.35,lip,.85);px(13.4,13.85,.35,.35,lip,.85);px(11.75,14.1,.5,.2,lip,.4);}
      if(f.has('happy')){px(10.25,13.875,.25,.25,lip);px(13.5,13.875,.25,.25,lip);}if(f.has('blush')){px(10.75,14.375,2.5,.25,lipDark);}}
    // 帽子层：清出脸的位置再画眼镜和汗滴。
    c.clearRect(40*S,10*S,8*S,6*S);
    if(v.extras?.includes('glasses')){
      px(40.25,11,7.5,.5,'#34323C');px(40.5,11.1,2,.15,'#fff',.3);px(40.25,11,.5,3.5,'#34323C');px(47.25,11,.5,3.5,'#34323C');px(43.5,11.25,1.5,.4,'#34323C');px(40.25,14.25,3,.4,'#34323C');px(44.75,14.25,3,.4,'#34323C');
      px(40.75,11.5,2.5,2.75,'#B8E3FF',.1);px(44.75,11.5,2.5,2.75,'#B8E3FF',.1);
    }
    if(f.has('sweat')){px(45.5,10,.75,1.5,'#87CAEF');px(45.25,11.5,.5,.4,'#87CAEF');px(45.6,10.2,.25,.5,'#fff',.6);}
    texture.needsUpdate=true;
  }
  face(undefined,500,false,false);return {canvas,texture,face};
}
