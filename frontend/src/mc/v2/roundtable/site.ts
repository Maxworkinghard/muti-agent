/**
 * 圆桌「水上园林茶叙榭」的总平面（第二轮，1 格 = 1 米，x 向东、z 向南，人走在 y=1，水面 y=0.15）。
 * 方块结构、道具、水面、远景都从这里取位置；设计说明见 docs/design/ROUNDTABLE_GARDEN.md 第 1 节。
 *
 *   主榭      台基 x 9–23、z 6–19，南沿落在南岸驳岸线上，北、西、东三面临水。
 *   南院      南岸 x −6–36、z 19–27，方砖地；南墙 z 27，月洞门和榭的南门同一条轴线（x 16）。
 *   主水面    POND 轮廓以内（约 x −12–48、z −25–19），西面水口往外流成河道。
 *   北岸      假山（山顶方亭）、临水两层楼、沿北墙的游廊；北墙 z −44，墙外是林冠和别家屋脊。
 *   东岸      半岛伸进水面，六角亭在半岛尖上；水廊从榭东面出去接到亭的西面。
 *   西面      水口石拱桥；小岛（曲桥从月台过去）；河道往西，尽头远远一座小塔。
 */
export const WATER=.15;
/** 园里地面（人走的高度） */
export const GROUND=1;

export const HALL={
  /** 台基格子（y=0 一层方块），格子 x 9–22、z 6–18，世界坐标 9–23 × 6–19 */
  x0:9,x1:22,z0:6,z1:18,
  /** 柱子所在的格子（栅栏柱，中心在 +0.5） */
  postX:[10,13,18,21] as const,postZ:[7,10,14,17] as const,
  /** 柱顶高度、檐口（最外一圈瓦的底面） */
  postTop:5,eave:5,
  /** 圆桌中心（厅心） */
  table:{x:16,z:12.5},
  /** 歇山两侧收山：东西两端各 1 格是披檐，往里是卷棚山面 */
  gable:1,
};
/** 柱心坐标（米） */
export const POST_X=HALL.postX.map(x=>x+.5),POST_Z=HALL.postZ.map(z=>z+.5);

/** 北月台与石埠头（格子） */
export const TERRACE={x0:12,x1:19,z0:2,z1:5};

/** 水廊：三段矩形甲板（格子），廊柱立在两侧，柱距约 3 米。 */
export interface Segment {x0:number;x1:number;z0:number;z1:number;along:'x'|'z'}
export const CORRIDOR:Segment[]=[
  {x0:22,x1:27,z0:11,z1:13,along:'x'},
  {x0:25,x1:27,z0:3,z1:13,along:'z'},
  {x0:25,x1:32,z0:3,z1:5,along:'x'},
];
/** 六角亭：中心、柱圈半径、台基半径（米）。东面半岛的尖上，西面接水廊、东面接岸。 */
export const PAVILION={x:35.5,z:4,r:2.3,base:3.3};

/** 曲桥（贴水的石板桥，格子矩形）：月台西端折两折到小岛 */
export const BRIDGE:Array<{x0:number;x1:number;z0:number;z1:number}>=[
  {x0:8,x1:11,z0:3,z1:4},
  {x0:6,x1:7,z0:0,z1:4},
  {x0:2,x1:5,z0:0,z1:1},
];

/** 南院（格子）：方砖地；南墙在 z=27，月洞门中心 x=16（和榭的南门、桌心同一轴线） */
export const COURT={x0:-6,x1:36,z0:19,z1:26};
/** 园墙（格子坐标）：北、东、南三面粉墙；西面是河道，只在河道两岸各有一段墙头收住 */
export const WALLS={north:-44,east:52,south:27,west:-16,gateSouth:16,gateNorth:40};
/** 漏窗（2×1 米，墙身中段）：所在墙、沿墙起点、花样（0 海棠方格、1 套方、2 水纹） */
export const LATTICE_WINDOWS:Array<{wall:'north'|'south'|'east';at:number;kind:number}>=[
  {wall:'south',at:4,kind:0},{wall:'south',at:26,kind:1},{wall:'north',at:26,kind:2},{wall:'north',at:31,kind:0},{wall:'north',at:46,kind:1},{wall:'east',at:-30,kind:2},
];

/**
 * 主水面的岸线（世界坐标，米，一圈多边形，水在里面）。驳岸、水面深浅、植物的位置都从这里算。
 * 从主榭西南角沿南岸往西 → 水口南岸 → 出园（x=−17）→ 水口北岸 → 西北岸 → 假山脚 → 两层楼平台 → 东岸 → 半岛 → 南岸东段 → 主榭东南角。
 */
export const POND:Array<[number,number]>=[
  [9,19],[5,19.6],[1,18.8],[-3,17],[-6.5,14.2],[-8.6,10.5],[-9.4,7],[-10.5,5.2],[-13,4.6],[-17,5],
  [-17,-5],[-13,-4.4],[-10.6,-4.8],[-9.8,-8],[-8.2,-12.5],[-5.5,-16.4],[-1.5,-19.6],[3,-22],
  [7,-23.6],[11,-24.4],[15,-24.2],[19,-23.4],[23,-22.8],[26.5,-22.2],[28,-24],[38,-24],[40,-22.4],[43,-20.5],[45.6,-17],[47,-12.5],[47.4,-7],
  [46.6,-3],[44,-.8],[41,-.6],[38.6,.4],[37.2,1.6],[37,6.4],[38.6,7.6],[41.2,8.6],[44.6,9.4],[46.2,12.6],[45.4,15.8],[42.6,18.2],[38.4,19.4],[33,19.8],[28,19.4],[23,19],
];
/** 河道（出园以后）：中心线和半宽，往西越来越宽；尽头小丘上一座小塔（借景） */
export const CANAL:Array<{x:number;z:number;half:number}>=[
  {x:-17,z:0,half:5},{x:-40,z:-3,half:6},{x:-70,z:-9,half:7},{x:-110,z:-18,half:8},{x:-150,z:-26,half:9},{x:-190,z:-33,half:10},
];
export const PAGODA={x:-205,z:-36};
/** 水口石拱桥：跨过水口，南端接南岸小路、北端接西北岸 */
export const ARCH={x:-9.6,z0:-6.2,z1:6.8,width:2.3,crown:2.85};

/** 北岸假山：一块不规则的山体（世界坐标多边形），山顶方亭 */
export const HILL={outline:[[2,-24],[8,-25.2],[15,-25.4],[21,-24.6],[25.5,-24.6],[26.5,-30],[25,-37],[18,-41],[9,-41],[3,-37.5],[.5,-30]] as Array<[number,number]>,peak:{x:13.5,z:-32,h:5}};
export const HILL_PAVILION={x:13.5,z:-32,half:1.7};
/** 临水两层楼（格子）：楼身 x 29–37、z −33…−27，南面平台伸到水边 */
export const LOU={x0:29,x1:37,z0:-33,z1:-27,terrace:{z0:-26,z1:-25}};
/** 沿北墙的游廊（格子）：x 24–48 贴着北墙内侧，单坡顶 */
export const NORTH_CORRIDOR={x0:20,x1:48,z0:-43,z1:-41};

/** 垂柳：只在水边（西南岸、西北岸、东岸各一株，东北湾一株）；lean 是树干往哪边倾（朝水面），s 是大小。西南岸那株让开从厅里经水口看河道尽头小塔的视线 */
export const WILLOWS:Array<{x:number;z:number;lean:[number,number];s:number;seed:number}>=[
  {x:-8.4,z:15.4,lean:[.7,-.5],s:1.05,seed:21},{x:-6.4,z:-18.6,lean:[.4,.8],s:.95,seed:22},{x:47.6,z:11.6,lean:[-1,.1],s:.9,seed:23},{x:43.6,z:-21.8,lean:[-.5,.7],s:.85,seed:24},
];
/**
 * 阔叶大树：南院西南角的大榉树（傍晚的斜阳穿过它的树冠落进榭里）、院东角一棵桂、假山后两棵、北廊东头、东岸两棵、假山上一棵鸡爪槭、
 * 西北角一棵香樟、南墙月洞门外一棵桂（园外，门里看得见）。树干落在山上的，种在山体高度上。
 */
export const CANOPY:Array<{x:number;z:number;h:number;spread:number;palette:'zelkova'|'osmanthus'|'camphor'|'elm'|'maple';cell:number;lean?:[number,number];seed:number}>=[
  {x:-3.4,z:24.2,h:13,spread:11,lean:[.45,-.35],palette:'zelkova',cell:.42,seed:31},{x:33.6,z:24.4,h:6.5,spread:5,palette:'osmanthus',cell:.34,seed:32},
  {x:5.5,z:-39.5,h:12,spread:10,palette:'camphor',cell:.5,seed:33},{x:22.5,z:-38.6,h:11,spread:9,palette:'elm',cell:.5,seed:34},
  {x:42.5,z:-37,h:12,spread:9,palette:'camphor',cell:.5,seed:35},{x:49.4,z:-9.5,h:10,spread:8,palette:'zelkova',cell:.5,seed:36},
  {x:49,z:21.5,h:9,spread:7,palette:'camphor',cell:.48,seed:37},{x:17.4,z:-28.8,h:4.2,spread:3.8,palette:'maple',cell:.28,seed:38},
  {x:-11.6,z:-31,h:10,spread:8,palette:'camphor',cell:.46,seed:40},{x:13,z:31.5,h:6,spread:5,palette:'osmanthus',cell:.36,seed:39},
];

/** 默认机位：厅内西南角，略高于站立人眼，越过圆桌看北面、东面的水和北岸中景。 */
export const VIEW={camera:[11.35,3.05,16.55] as [number,number,number],target:[17.6,1.85,8.9] as [number,number,number],fov:52};

/** 点在不在多边形里（射线法） */
export function inside(poly:Array<[number,number]>,x:number,z:number){let inn=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inn=!inn;}return inn;}
/** 点到多边形边的最短距离 */
export function edgeDistance(poly:Array<[number,number]>,x:number,z:number){let d=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ax,az]=poly[j],[bx,bz]=poly[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(ax+dx*t-x,az+dz*t-z));}return d;}
