/**
 * 湖畔木构议事厅的方块结构（只用 v2 重画过贴图的方块）。
 *
 * 坐标：1 格 = 1 米，x 向东、z 向南，地板方块在 y=0、人踩在 y=1。湖在北面（z<0），下午的太阳在西偏南。
 *   石基座   x 5–20、z 0–16，比四周草地高 1 格；北沿（z=0）是伸进湖里的石砌驳岸。
 *   主厅     x 6–19、z 4–15，石门槛 + 深橡木包边 + 两种浅木错缝地板，柱网 x∈{6,10,15,19}、z∈{4,7,12,15}，柱高 4 格，梁在 y=5。
 *   前廊     z 1–3，露天的木平台直接临水，山墙只挑出 1 格；两角各一根灯柱（道具层）。
 *   屋顶     双坡，屋脊南北向（x=12.5），山墙正对湖面：从厅里往北看，梁下是湖，梁上的三角山花里是山和天。
 *            0.5 格一级的板岩瓦（外层）+ 云杉望板（内层，低一格），露出顺屋脊方向的檩条（道具层）。
 *   藻井     桌子正上方 x 10–15、z 7–12 升起一座八角天窗楼：井壁深橡木，上两层朝内八段格窗，顶上中间一块玻璃。
 *   西面     敞开（半高石栏 + 北边一跨的台阶），下午的低角度阳光从西檐下斜射进来，把柱影拉过地板。
 *   东面     石砌壁炉（中间一跨，炉膛开口朝西）+ 两侧格窗；烟囱穿出东坡。
 *   南面     石勒脚 + 中间一跨书架 + 两侧格窗，山花用云杉板封住（默认机位背后）。
 * 主厅内部没有柱子，镜头到八个人头的视线只会被家具挡。
 */
import {Builder} from '../../rooms/builders';

/** 近处方块地形的范围（landscape 的平面草地在这里留空） */
export const TERRAIN={x0:-1,x1:29,z0:0,z1:23};

export const HALL={
  table:{x:13,z:10},
  floorY:1,
  cols:{x:[6,10,15,19],z:[4,7,12,15]},
  beamY:5,
  caisson:{x0:10,x1:15,z0:7,z1:12,top:10},
  /** 屋面范围（含出檐） */
  roof:{x0:4,x1:21,z0:3,z1:16},
  /** 屋面外层（瓦）底面高度：西檐、东檐 5，梁上 6，屋脊 9。按 x 格查。 */
  roofU,
  /** 屋面内层（望板）底面高度：檩条顶面贴着它 */
  underside(x:number){return roofU(x)-1;},
  fire:{x:19,z:10,openX:18},
};

function roofU(x:number){const d=x<=12?12-x:x-13;return 9-d*.5;}
const slab=(b:Builder,x:number,u:number,z:number,id:string,skip:(x:number,y:number,z:number)=>boolean)=>{const y=Math.floor(u),type=u-y<.25?'bottom':'top';if(!skip(x,y,z))b.put(x,y,z,id,{type,waterlogged:'false'});};

/**
 * 厅内地面：北口（z=4）和西口（x=6）一道石门槛，把露天平台、草地和室内木地板分开；
 * 室内一圈深橡木包边（x=7/18、z=5/14），中间是两种浅木（白桦、浅橡）按 2–4 格一段错缝铺的长条地板，
 * 远看有深浅、有边界，不是一整块浅色。
 */
function floorAt(x:number,z:number){
  if(z===4||x===6||z===15||x===19)return 'stone_bricks';
  if(x===7||x===18||z===5||z===14)return 'dark_oak_planks';
  const off=(z*7)%4,seg=Math.floor((x+off)/3),h=((seg*2654435761)^(z*40503))>>>0;
  return h%5<2?'birch_planks':'oak_planks';
}

export function buildHall():Builder{
  const b=new Builder();
  const {cols,beamY}=HALL,C=HALL.caisson;
  // ——基座与地面
  for(let x=5;x<=20;x++)for(let z=0;z<=16;z++){
    const edge=x===5||x===20||z===0||z===16;
    if(edge){b.put(x,0,z,(x*7+z*3)%5===0?'mossy_stone_bricks':'stone_bricks');continue;}
    if(z<=3){b.put(x,0,z,'stripped_spruce_log',{axis:'x'});continue;}
    b.put(x,0,z,floorAt(x,z));
  }
  // 驳岸：北沿往下一格，泡在水里。
  for(let x=5;x<=20;x++)b.put(x,-1,0,(x%3===0)?'mossy_stone_bricks':'stone_bricks');
  // 壁炉前的石炉床。
  for(let z=8;z<=11;z++){b.put(17,0,z,'cobblestone');b.put(18,0,z,'cobblestone');}
  // 西面北边一跨的入口台阶（中间一跨留给茶台和半高石栏）。
  for(const z of [5,6])b.put(5,0,z,'stone_brick_stairs',{facing:'east',half:'bottom',shape:'straight',waterlogged:'false'});

  // ——柱子（深橡木原木）：主厅一圈 4 格高；前廊只在两个外角立柱，挑起山墙出檐。
  const col=(x:number,z:number,h:number)=>{for(let y=1;y<=h;y++)b.put(x,y,z,'dark_oak_log',{axis:'y'});};
  for(const x of cols.x)for(const z of [4,15])col(x,z,z===4&&(x===10||x===15)?5:4);
  for(const z of [7,12])for(const x of [6,19])col(x,z,4);

  // ——墙：东墙（壁炉 + 格窗）、南墙（书架 + 格窗）、西面半高石栏。
  const wallBay=(cells:Array<[number,number]>,mid:'pane'|'books')=>{for(const [x,z] of cells){b.put(x,1,z,'stone_bricks');for(const y of [2,3])b.put(x,y,z,mid==='pane'?'glass_pane':'bookshelf',mid==='pane'?{waterlogged:'false'}:{});b.put(x,4,z,'calcite');}};
  wallBay([[19,5],[19,6],[19,13],[19,14]],'pane');
  wallBay([[7,15],[8,15],[9,15],[16,15],[17,15],[18,15]],'pane');
  wallBay([[11,15],[12,15],[13,15],[14,15]],'books');
  for(const z of [8,9,10,11,13,14])b.put(6,1,z,'stone_brick_slab',{type:'bottom',waterlogged:'false'});
  // 壁炉：炉膛 x 18–19、z 9–10，开口朝西；两侧和后背是石头，烟囱从 x 19–20 穿出东坡。
  for(const z of [8,11])for(let y=1;y<=4;y++){b.put(18,y,z,'stone_bricks');b.put(19,y,z,'stone_bricks');b.put(20,y,z,'cobblestone');}
  for(const z of [9,10]){for(const y of [3,4]){b.put(18,y,z,y===3?'cobblestone':'stone_bricks');b.put(19,y,z,'cobblestone');}for(let y=1;y<=4;y++)b.put(20,y,z,'cobblestone');}
  for(const x of [19,20])for(const z of [9,10])for(let y=5;y<=9;y++)b.put(x,y,z,y===9?'stone_bricks':'cobblestone');

  // ——梁（去皮深橡木，横放）：主厅一圈 + 两道纵梁两道横梁，围出藻井的口；东西两道边梁一直伸到前廊外角。
  // 北口（z=4）和藻井北边（z=7）中间一跨的梁抬高一格到 y=6：从厅里朝湖看，横梁下的开口高一米，远山和天露出来。
  const raised=(x:number,z:number)=>(z===4||z===7)&&x>=10&&x<=15;
  for(let x=6;x<=19;x++)for(const z of [4,7,12,15]){
    if(raised(x,z)){if(z===7&&(x===10||x===15))b.put(x,beamY,z,'stripped_dark_oak_log',{axis:'z'});continue;}
    b.put(x,beamY,z,'stripped_dark_oak_log',{axis:'x'});}
  for(let x=10;x<=15;x++)b.put(x,beamY+1,4,'stripped_dark_oak_log',{axis:'x'});
  for(let z=5;z<=14;z++)for(const x of [6,10,15,19]){if([7,12].includes(z))continue;b.put(x,beamY,z,'stripped_dark_oak_log',{axis:'z'});}

  // ——藻井：一圈井壁，四角各填一格成八角，朝内的八段在上两层开格窗，顶上中间一块玻璃天窗。
  const inC=(x:number,z:number)=>x>=C.x0&&x<=C.x1&&z>=C.z0&&z<=C.z1;
  const ring=(x:number,z:number)=>inC(x,z)&&(x===C.x0||x===C.x1||z===C.z0||z===C.z1);
  const corner=(x:number,z:number)=>(x===C.x0+1||x===C.x1-1)&&(z===C.z0+1||z===C.z1-1);
  const window=(x:number,z:number)=>((x===C.x0||x===C.x1)&&(z===9||z===10))||((z===C.z0||z===C.z1)&&(x===12||x===13));
  for(let x=C.x0;x<=C.x1;x++)for(let z=C.z0;z<=C.z1;z++){
    if(!ring(x,z)&&!corner(x,z))continue;
    const edgeCorner=(x===C.x0||x===C.x1)&&(z===C.z0||z===C.z1);
    for(let y=6;y<C.top;y++){const pane=ring(x,z)&&!edgeCorner&&y>=C.top-2;b.put(x,y,z,pane?'glass_pane':edgeCorner?'stripped_dark_oak_log':y===C.top-3?'stripped_dark_oak_log':'calcite',pane?{waterlogged:'false'}:edgeCorner?{axis:'y'}:y===C.top-3?{axis:x===C.x0||x===C.x1?'z':'x'}:{});}
  }
  for(let x=C.x0;x<=C.x1;x++)b.put(x,beamY+1,C.z0,'stripped_dark_oak_log',{axis:'x'});
  for(let x=C.x0;x<=C.x1;x++)for(let z=C.z0;z<=C.z1;z++){
    const center=(x===12||x===13)&&(z===9||z===10);
    b.put(x,C.top,z,center?'glass':ring(x,z)?'calcite':'birch_planks');
  }
  // 天窗楼的四坡小屋顶：外圈一圈板岩瓦楼梯朝外落水，里圈一层瓦，中间 2×2 玻璃天窗抬高一格。
  for(let x=C.x0;x<=C.x1;x++)for(let z=C.z0;z<=C.z1;z++){
    const y=C.top+1,center=(x===12||x===13)&&(z===9||z===10);
    if(center){b.put(x,y,z,'glass');continue;}
    if(ring(x,z)){const facing=z===C.z0?'south':z===C.z1?'north':x===C.x0?'east':'west';
      const corner=(x===C.x0||x===C.x1)&&(z===C.z0||z===C.z1);
      const shape=!corner?'straight':(x===C.x0&&z===C.z0)||(x===C.x1&&z===C.z1)?'outer_right':'outer_left';
      b.put(x,y,z,'deepslate_tile_stairs',{facing,half:'bottom',shape,waterlogged:'false'});}
    else b.put(x,y,z,'deepslate_tile_slab',{type:'bottom',waterlogged:'false'});
  }

  // ——屋面：外层板岩瓦、内层云杉望板（低一格），屋脊压一道瓦。藻井、烟囱、梁占的格子跳过。
  const taken=(x:number,y:number,z:number)=>b.cells.has(`${x},${y},${z}`);
  const skip=(x:number,y:number,z:number)=>inC(x,z)||taken(x,y,z);
  const R=HALL.roof;
  for(let x=R.x0;x<=R.x1;x++)for(let z=R.z0;z<=R.z1;z++){
    const u=roofU(x);
    slab(b,x,u,z,'deepslate_tile_slab',skip);
    slab(b,x,u-1,z,'birch_slab',skip);
    if(x===12||x===13)slab(b,x,u+.5,z,'deepslate_tile_slab',skip);
  }
  // 南山墙：梁上到望板之间用云杉板封住，中间一根深色童柱。北山墙敞开，看得到山和天。
  for(let x=7;x<=18;x++){const top=roofU(x)-1,post=x===10||x===15||x===12||x===13;for(let y=6;y<top;y++)if(!taken(x,y,15))b.put(x,y,15,post?'stripped_dark_oak_log':'calcite',post?{axis:'y'}:{});}

  // ——近处地形：基座四周 x -1–28、z 0–22 用方块铺（草地为主，夹几块苔藓、粗土），北沿一条砂砾岸，
  //    西侧台阶外一条碎石小路。更远处由 landscape 的平面草地接上。
  const T=TERRAIN;
  for(let x=T.x0;x<T.x1;x++)for(let z=T.z0;z<T.z1;z++){
    if(x>=5&&x<=20&&z<=16)continue;
    const h=((x*73856093)^(z*19349663))>>>0,v=h%97;
    const shore=z===0,path=z>=5&&z<=6&&x<5&&x>=-1;
    b.put(x,-1,z,shore?(v%3?'gravel':'sand'):path?(v%4?'gravel':'coarse_dirt'):v<5?'moss_block':v<8?'coarse_dirt':'grass_block');
  }
  // 草地上零星的草丛（不挡路、不进基座）。
  for(let x=T.x0;x<T.x1;x++)for(let z=1;z<T.z1;z++){if(x>=4&&x<=21&&z<=17)continue;const h=((x*2654435761)^(z*40503))>>>0;if(h%11===0&&!(z>=5&&z<=6&&x<5))b.put(x,0,z,h%5===0?'fern':'short_grass');}

  // ——近景：岸边、草地上的花丛和几棵树。
  const plant=(x:number,z:number,id:string)=>{b.put(x,-1,z,'grass_block');b.put(x,0,z,id);};
  const flowers=['short_grass','poppy','short_grass','oxeye_daisy','fern','cornflower','dandelion','short_grass'];
  // 西侧草地沿石栏的一溜花境（窄窄一条，不挡视线），南侧零星几簇。
  for(const [x,z,i] of [[4,8,0],[4,9,1],[3,9,2],[4,10,3],[4,12,4],[4,13,5],[3,13,6],[4,14,7],[3,4,3],[21,6,1],[21,13,0],[22,13,4],[21,14,3],[8,17,0],[9,17,6],[15,17,2],[16,17,5],[17,18,0]] as const)plant(x,z,flowers[i]);
  // 樱花树：东北岸，从前廊看出去在湖的右边；花瓣落在地上。
  const tree=(x:number,z:number,h:number,log:string,leaves:string,r:number)=>{for(let y=0;y<h;y++)b.put(x,y,z,log,{axis:'y'});
    for(let y=h-1;y<=h+2;y++){const rr=y===h+2?r-1:y===h-1?r-1:r;for(let dx=-rr;dx<=rr;dx++)for(let dz=-rr;dz<=rr;dz++){if(Math.abs(dx)+Math.abs(dz)>rr+(y===h?1:0))continue;if(dx===0&&dz===0&&y<h)continue;if(!taken(x+dx,y,z+dz))b.put(x+dx,y,z+dz,leaves);}}};
  b.put(24,-1,2,'grass_block');tree(24,2,5,'cherry_log','cherry_leaves',3);
  for(const [x,z] of [[21,1],[22,4],[25,3],[24,0]] as const){b.put(x,-1,z,'grass_block');if(!taken(x,0,z))b.put(x,0,z,'pink_petals',{facing:'north',flower_amount:'3'});}
  b.put(25,-1,10,'grass_block');tree(25,10,6,'oak_log','oak_leaves',2);
  b.put(1,-1,13,'grass_block');tree(1,13,7,'spruce_log','spruce_leaves',2);
  return b;
}
