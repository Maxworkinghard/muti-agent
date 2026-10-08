import type {McSceneKind} from '../../types';
import {Builder,type Point} from './builders';
import type {Room} from './debate';
import {mix,pattern,shade,type Look,type Painter} from '../style';
/**
 * 新画风的房间外壳：像二维原图那样从前上方往里看（剖面俯视）。
 * 方块只当形状用，颜色由房间色板重画——SLOT 是每种表面借用的方块，TEXTURE 是对应要重画的贴图。
 * 墙高 4 格：第 1 格踢脚、2～3 格墙面、第 4 格檐口；天花板在 5 格，俯视时藏起来。
 * 墙顶只在两条长边描线（南北墙、东西墙各用一种檐口方块），从上面看是一圈连续的细墙沿。
 * 墙比旧房间矮一格：从前上方看过去，侧墙不再像一个深盒子，比例接近二维原图里那圈薄墙。
 * 南墙（朝镜头）只留 1 格高的矮墙，上面几格放进 cutaway，镜头进屋时才显示。
 */
export const SLOT={floor:'smooth_stone',wall:'white_concrete',base:'light_gray_concrete',cap:'sandstone',capSide:'red_sandstone',post:'brown_concrete',ceiling:'smooth_quartz',glass:'glass_pane',light:'light'} as const;
export const TEX={floor:'block/smooth_stone',wall:'block/white_concrete',base:'block/light_gray_concrete',capSide:'block/sandstone',capTop:'block/sandstone_top',capBottom:'block/sandstone_bottom',capSide2:'block/red_sandstone',capTop2:'block/red_sandstone_top',capBottom2:'block/red_sandstone_bottom',post:'block/brown_concrete',ceiling:'block/quartz_block_bottom',glass:'block/glass',glassEdge:'block/glass_pane_top'};
interface Palette {floor:string;wall:string;base:string;cap:string;/** 墙顶描边，二维原图里墙沿那道深色线 */outline:string;post:string;ceiling:string;frame:string}
/** 外壳表面的贴图画法；房间可以再追加自己的。 */
function shellPaint(p:Palette,extra:Record<string,Painter>={}):Record<string,Painter>{
  return {[TEX.floor]:pattern.flat(p.floor),[TEX.wall]:pattern.flat(p.wall),[TEX.base]:q=>{q.fill(p.base).rect(0,0,16,2,shade(p.base,1.12)).rect(0,14,16,2,shade(p.base,.85));},
    [TEX.capSide]:q=>{q.fill(p.cap).rect(0,0,16,2,shade(p.cap,1.1)).rect(0,13,16,3,shade(p.cap,.86));},[TEX.capTop]:q=>{const top=shade(p.cap,.9),line=mix(p.outline,top,.2);q.fill(top).rect(0,0,16,1,line).rect(0,15,16,1,line);},
    [TEX.capTop2]:q=>{const top=shade(p.cap,.9),line=mix(p.outline,top,.2);q.fill(top).rect(0,0,1,16,line).rect(15,0,1,16,line);},
    [TEX.capSide2]:q=>{q.fill(p.cap).rect(0,0,16,2,shade(p.cap,1.1)).rect(0,13,16,3,shade(p.cap,.86));},[TEX.capBottom2]:pattern.flat(shade(p.cap,.9)),[TEX.capBottom]:pattern.flat(shade(p.cap,.9)),
    [TEX.post]:pattern.block(p.post),[TEX.ceiling]:pattern.flat(p.ceiling),[TEX.glass]:pattern.glass(p.frame),[TEX.glassEdge]:pattern.flat(p.frame),...extra};
}
interface StudioOptions {
  kind:McSceneKind;title:string;w:number;d:number;
  /** 平涂色板（重画方块贴图用）；真实方块的房间（shell）不用 */
  palette?:Palette;look:Look;
  /** 真实方块的房间：外壳各部位直接用哪种方块，不重画贴图（白墙、木地板、深色原木梁柱这种），posts 是隔几格立一根的柱子 */
  shell?:{floor?:string;base?:string;wall?:string;top?:string;ceiling?:string;glass?:string;posts?:string;postEvery?:number};
  /** 往房间里加方块（书架、盆栽、灯笼、地毯……），在连接方块之前调用 */
  build?:(b:Builder,cut:Builder)=>void;
  material?:Room['material'];
  /** 墙上的窗洞：沿墙的起止格（含）和上下格 */
  windows?:Array<{wall:'north'|'west'|'east';from:number;to:number;y0?:number;y1?:number}>;
  /** 南面矮墙上留的门口（x 起止，含） */
  door?:[number,number];
  /** 默认机位：离南墙多远、多高（米），看向房间哪一点 */
  view?:{back:number;height:number;target?:Point;fov?:number};
  /** 自下而上四层墙用的方块（默认踢脚、墙面、墙面、檐口）；播客间这种护墙板要高一点的可以换 */
  rows?:[string,string,string,string];
  /** 正面机位（播客间）：南面连矮墙也不要，像舞台一样敞开 */
  open?:boolean;
  floorArt?:Room['floorArt'];paint?:Record<string,Painter>;
}
export function studio(o:StudioOptions):Room {
  const {w,d}=o,b=new Builder(),cut=new Builder(),top=new Builder(),cx=(w+2)/2,cz=(d+2)/2,sh=o.shell;
  const S={floor:sh?.floor??SLOT.floor,base:sh?.base??SLOT.base,wall:sh?.wall??SLOT.wall,cap:sh?.top??SLOT.cap,capSide:sh?.top??SLOT.capSide,ceiling:sh?.ceiling??SLOT.ceiling,glass:sh?.glass??SLOT.glass};
  // 原木、木头当横梁时顺着墙的方向躺下（南北墙沿 x，东西墙沿 z）。
  const lay=(id:string,alongX:boolean):Record<string,string>=>/_(log|wood|stem|hyphae)$/.test(id)?{axis:alongX?'x':'z'}:{};
  // 敞开的正面（播客间、正面机位的房间）地面往外多铺两格，画面下沿不露地板断面。
  b.fill(0,w+1,0,0,0,d+1+(o.open?2:0),S.floor);
  const wallAt=(x:number,z:number)=>{const alongX=z===0||z===d+1,cap=alongX?S.cap:S.capSide;for(let y=1;y<=4;y++){const id=y===4?cap:o.rows?o.rows[y-1]:y===1?S.base:S.wall,props=lay(id,alongX);
    if(z===d+1&&y>1)cut.put(x,y,z,id,props);else b.put(x,y,z,id,props);}};
  for(let x=0;x<=w+1;x++){wallAt(x,0);wallAt(x,d+1);}for(let z=1;z<=d;z++){wallAt(0,z);wallAt(w+1,z);}
  // 柱子：四个墙角和沿墙每隔几格一根，竖着的原木（真实方块的房间用，像白墙配深色木框）。
  if(sh?.posts){const every=sh.postEvery??4,post=(x:number,z:number)=>{for(let y=1;y<=4;y++)(z===d+1&&y>1?cut:b).put(x,y,z,sh.posts!,{axis:'y'});};
    for(let x=0;x<=w+1;x+=every)for(const z of [0,d+1])post(x,z);for(const z of [0,d+1])post(w+1,z);for(let z=every;z<=d;z+=every)for(const x of [0,w+1])post(x,z);}
  // 南面矮墙：顶面也是深色描边，门口留空。
  for(let x=0;x<=w+1;x++){if(o.open){b.cells.delete(`${x},1,${d+1}`);cut.put(x,1,d+1,S.cap,lay(S.cap,true));}else b.put(x,1,d+1,S.cap,lay(S.cap,true));}
  if(o.door)for(let x=o.door[0];x<=o.door[1];x++){b.cells.delete(`${x},1,${d+1}`);for(let y=2;y<=4;y++)cut.cells.delete(`${x},${y},${d+1}`);cut.put(x,4,d+1,S.cap,lay(S.cap,true));}
  for(const win of o.windows??[])for(let i=win.from;i<=win.to;i++)for(let y=win.y0??2;y<=(win.y1??3);y++){
    const [x,z]=win.wall==='north'?[i,0]:win.wall==='west'?[0,i]:[w+1,i];b.put(x,y,z,S.glass);}
  // 天花板连同墙顶一圈：俯视时整个藏起来，墙顶露出深色描边。
  top.fill(0,w+1,5,5,0,d+1,S.ceiling);
  o.build?.(b,cut);
  // 看不见的光源：给游戏光照网格补亮（人物、家具的间接光），不画灯具。
  for(let x=2;x<=w;x+=4)for(let z=2;z<=d;z+=4)b.put(x,4,z,SLOT.light);
  const view=o.view??{back:4,height:13},target=view.target??[cx,1.2,cz-.5];
  return {kind:o.kind,title:o.title,blocks:b.connect(),cutaway:cut.connect(),ceiling:top.connect(),anchors:[],host:[cx,1,2.4],
    layout:{tables:[],chairs:[],desk:[],podium:{position:[cx,1,2.4],yaw:0},board:{position:[cx,2.95,1.05],width:Math.min(w-6,5),height:1.6},phaseLamps:[]},
    camera:[cx,view.height,d+1+view.back],cameraTarget:target,fit:[],judge:[cx,2.5,d-.6],judgeTarget:[cx,1.6,cz-1],
    lights:[],banners:[],windows:[],floor:[{y:1.011,x0:1,x1:w+1,z0:1,z1:d+1}],bounds:{min:[1,1,1],max:[w+1,5,d+1]},
    look:o.look,paint:o.palette&&!sh?shellPaint(o.palette,o.paint):o.paint,floorArt:o.floorArt,fov:view.fov,material:o.material};
}
/** 地面图的常用画法（每米 16 像素）。 */
export const floors={
  /** 长条木地板 */
  planks(c:CanvasRenderingContext2D,w:number,d:number,base:string,seam:string,light:string,board=12){
    c.fillStyle=base;c.fillRect(0,0,w*16,d*16);
    for(let x=0,col=0;x<w*16;x+=board,col++){c.fillStyle=seam;c.fillRect(x,0,1,d*16);c.fillStyle=light;c.fillRect(x+1,0,1,d*16);
      for(let z=(col%3)*22;z<d*16;z+=66){c.fillStyle=seam;c.fillRect(x,z,board,1);}}
  },
  /** 地毯：圆角块面、一道边框 */
  rug(c:CanvasRenderingContext2D,x:number,z:number,w:number,d:number,fill:string,border:string,inset=6){
    c.fillStyle=shade(fill,.82);c.fillRect(x*16-1,z*16-1,w*16+2,d*16+2);c.fillStyle=fill;c.fillRect(x*16,z*16,w*16,d*16);
    c.strokeStyle=border;c.lineWidth=2;c.strokeRect(x*16+inset,z*16+inset,w*16-inset*2,d*16-inset*2);
  },
};
