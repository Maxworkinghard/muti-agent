import type {McSceneKind} from '../../types';
import {SCENES} from '../../data/scenes';
import {Builder,type Point} from './builders';
import {buildDebateRoom,type Room,type ActorAnchor} from './debate';

export const MC_SCENE_KINDS:McSceneKind[]=['debate','roundtable','office','classroom','meadow','podcast'];
export const MC_SCENE_NAMES:Record<McSceneKind,string>={debate:'辩论室',roundtable:'圆桌会议室',office:'办公室',classroom:'教室',meadow:'草地野餐',podcast:'播客访谈间'};
const anchor=(x:number,z:number,yaw:number,i:number,standing=false):ActorAnchor=>({seat:[x,standing?1:1.5,z],stand:[x,1,z],homeYaw:yaw,mic:'seat-'+i,chair:standing?undefined:'chair-'+i});

/** 共用暖色墙、木框和游戏灯具；每个场景单独提供布局与座位，不借用辩论室的队伍。 */
function shell(kind:McSceneKind,w:number,d:number):Room {
  const b=new Builder(),c=new Builder(),cx=(w+2)/2;
  b.fill(0,w+1,0,0,0,d+1,'spruce_planks');
  for(let y=1;y<6;y++){
    const id=y===1||y===5?'oak_planks':'smooth_sandstone';
    b.fill(0,w+1,y,y,0,0,id).fill(0,w+1,y,y,d+1,d+1,id).fill(0,0,y,y,1,d,id).fill(w+1,w+1,y,y,1,d,id);
  }
  for(const x of [0,w+1])for(const z of [0,Math.floor(d/2),d+1])b.fill(x,x,1,5,z,z,'oak_planks');
  const windows:Room['windows']=[];
  for(const x of [0,w+1])for(const z of [3,d-6]){b.fill(x,x,2,3,z,z+2,'glass_pane');if(x===0)windows.push({y0:2,y1:4,z0:z,z1:z+3,floor:1});}
  b.fill(0,w+1,6,6,0,0,'smooth_quartz').fill(0,w+1,6,6,d+1,d+1,'smooth_quartz').fill(0,0,6,6,1,d,'smooth_quartz').fill(w+1,w+1,6,6,1,d,'smooth_quartz');
  c.fill(1,w,6,6,1,d,'smooth_quartz');
  const lights:Room['lights']=[];
  for(const x of [Math.round(w*.25),Math.round(w*.75)])for(const z of [Math.round(d*.25),Math.round(d*.65)]){
    c.fill(x,x,6,6,z,z+1,'sea_lantern');lights.push({position:[x+.5,5.84,z+.5],length:2,intensity:4,distance:14,kind:'ceiling',shadow:false});
  }
  const door=Math.floor(cx);
  for(const x of [door-1,door])for(const y of [1,2])b.put(x,y,d+1,'iron_door',{facing:'north',half:y===1?'lower':'upper',hinge:x===door-1?'left':'right'});
  for(const x of [1,w-1])b.fill(x,x+1,1,3,1,1,'bookshelf');
  for(const x of [1,w])for(const z of [5,d-3])b.put(x,1,z,'potted_fern');
  const podium:Point=[cx,1,2.4];
  return {kind,title:MC_SCENE_NAMES[kind],blocks:b.connect(),ceiling:c.connect(),anchors:[],host:podium,
    layout:{tables:[],chairs:[],desk:[],podium:{position:podium,yaw:0},board:{position:[cx,4.4,1.08],width:Math.min(w-5,10),height:1.8},phaseLamps:[]},
    camera:[cx,4.6,d-.5],cameraTarget:[cx,2.1,d*.38],fit:[],judge:[cx,2.6,d-1.4],judgeTarget:[cx,2.2,d*.4],
    lights,banners:[],windows,floor:[{y:1.011,x0:1,x1:w+1,z0:1,z1:d+1}],bounds:{min:[1,1,1],max:[w+1,6,d+1]}};
}
function seat(room:Room,a:ActorAnchor,i:number,style?:'stool'|'armchair'){
  room.anchors.push(a);if(a.chair)room.layout.chairs.push({id:a.chair,side:'judge',position:[a.seat[0],1,a.seat[2]],yaw:a.homeYaw,slide:.18,actor:i,style});
}
function table(room:Room,id:string,x:number,z:number,length:number,depth:number,height=.95,shape?:'round'){
  room.layout.tables.push({id,side:'judge',center:[x,1,z],length,depth,height,skirtYaw:0,shape});
}
function finish(room:Room):Room {
  if(!room.outdoor){const ceiling=new Builder();for(const b of room.ceiling)ceiling.put(b.x,b.y,b.z,b.id,b.props);
    // 座位上方的小灯只作填光，主灯笼仍负责明显的方向与投影。
    for(const a of room.anchors){const x=Math.floor(a.seat[0]),z=Math.floor(a.seat[2]);ceiling.put(x,6,z,'sea_lantern');room.lights.push({position:[x+.5,5.84,z+.5],length:1,intensity:.9,distance:8,kind:'ceiling',shadow:false});}
    room.ceiling=ceiling.connect();}
  room.fit=room.anchors.flatMap(a=>[a.seat,a.stand].map(p=>[p[0],p[1]+1.8,p[2]] as Point));
  return room;
}
function roundtable():Room {
  const r=shell('roundtable',18,20),cx=10,cz=9;
  table(r,'round-table',cx,cz,5.6,5.6,.95,'round');
  for(let i=0;i<8;i++){const angle=-Math.PI/2+i*Math.PI/4,x=cx+4.65*Math.cos(angle),z=cz+4.65*Math.sin(angle);seat(r,anchor(x,z,Math.atan2(cx-x,cz-z),i),i);}
  for(const x of [cx-3.5,cx+3.5])r.lights.push({position:[x,4.5,cz],length:.55,intensity:26,distance:15,kind:'lantern',shadow:true});
  r.cameraTarget=[cx,2.2,cz];r.seatedSpeech=true;return finish(r);
}
function classroom():Room {
  const r=shell('classroom',22,24),cx=12;
  r.layout.podium.position=[cx,1,3.7];r.host=[cx,1,2.9];r.layout.board={position:[cx,4.5,1.08],width:11,height:2};
  seat(r,anchor(cx,2.9,0,0,true),0);r.standingSeats=[0];
  const xs=[4.5,8.5,15.5,19.5];let actor=1;
  for(const z of [8,12,16,20])for(const x of xs){
    table(r,'student-desk-'+x+'-'+z,x,z-.9,2.2,.9,.9);
    const index=actor<=7?actor++:undefined;
    if(index!==undefined)seat(r,anchor(x,z,Math.PI,index),index);
    else r.layout.chairs.push({id:'spare-chair-'+x+'-'+z,side:'judge',position:[x,1,z],yaw:Math.PI,slide:0});
  }
  for(const x of [7,17])r.lights.push({position:[x,4.5,9],length:.55,intensity:26,distance:14,kind:'lantern',shadow:true});
  r.camera=[cx,4.8,23.4];r.cameraTarget=[cx,2.6,6];return finish(r);
}
function office():Room {
  // 30x28 空间，还原 2D 原图的空间组织和青绿色配色
  const b=new Builder(),c=new Builder(),w=30,d=28,cx=16;
  
  // 地面：青绿色
  b.fill(0,w+1,0,0,0,d+1,'cyan_terracotta');
  
  // 墙面：灰白色系
  for(let y=1;y<6;y++){
    const id=y===1?'smooth_stone':(y===5?'smooth_quartz':'light_gray_concrete');
    b.fill(0,w+1,y,y,0,0,id).fill(0,w+1,y,y,d+1,d+1,id);
    b.fill(0,0,y,y,1,d,id).fill(w+1,w+1,y,y,1,d,id);
  }
  
  // 装饰性低矮隔断（不阻挡行走路径）
  // 左上会议区标识
  for(const [x,z] of [[3,3],[7,3],[3,10],[7,10]])
    b.put(x,1,z,'potted_bamboo');

  // 右上工作区标识
  for(const [x,z] of [[24,3],[28,3],[24,8],[28,8]])
    b.put(x,1,z,'potted_bamboo');
  
  
  // 天花板：在座位上方留出开口，避免镜头遮挡
  c.fill(1,w,6,6,1,d,'smooth_quartz');
  for(const [x,z] of [[13,6],[15,6],[17,6],[25,5],[27,5],[26,6],[5,12],[5,15],[24,15],[13,24],[15,24],[18,24],[20,24]])
    c.fill(x-1,x+1,6,6,z-1,z+1,'air');
  
  // 窗户
  const windows:Room['windows']=[];
  for(const x of [0,w+1])for(const z of [6,12,18,24]){
    b.fill(x,x,4,5,z,z+1,'glass_pane');
    if(x===0)windows.push({y0:4,y1:6,z0:z,z1:z+2,floor:1});
  }
  
  // 照明
  const lights:Room['lights']=[];
  for(const x of [6,16,26])for(const z of [6,14,22]){
    c.fill(x,x,6,6,z,z,'sea_lantern');
    lights.push({position:[x+.5,5.84,z+.5],length:1.8,intensity:6,distance:13,kind:'ceiling',shadow:false});
  }
  
  // 门
  const door=Math.floor(cx);
  for(const x of [door-1,door])for(const y of [1,2])
    b.put(x,y,d+1,'iron_door',{facing:'north',half:y===1?'lower':'upper',hinge:x===door-1?'left':'right'});
  
  // 装饰
  for(const [x,z] of [[3,3],[7,3],[24,3],[28,3],[3,25],[28,25]])
    b.put(x,1,z,'potted_fern');
  
  const r:Room={
    kind:'office',title:'办公室',blocks:b.connect(),ceiling:c.connect(),anchors:[],host:[cx,1,2.4],
    layout:{tables:[],chairs:[],desk:[],podium:{position:[cx,1,2.4],yaw:0},
      board:{position:[cx,4.5,1.08],width:11,height:2},phaseLamps:[]},
    camera:[cx,4.5,14],cameraTarget:[cx,2,12],fit:[],
    judge:[cx,2.6,d-1.4],judgeTarget:[cx,2.2,d*.4],
    lights,banners:[],windows,floor:[{y:1.011,x0:1,x1:w+1,z0:1,z1:d+1}],
    bounds:{min:[1,1,1],max:[w+1,6,d+1]},seatedSpeech:true
  };
  
  // 13 个座位按原图分布，椅子在桌子后面（yaw=Math.PI/2 表示面向北，所以座位在桌子南侧）
  // 中上长桌 (3人) seats[8,0,1]
  table(r,'center-top-desk',15,5,5,1.8,.9);
  seat(r,anchor(13,6.5,Math.PI/2,8),8);
  seat(r,anchor(15,6.5,Math.PI/2,0),0);
  seat(r,anchor(17,6.5,Math.PI/2,1),1);
  
  // 右上小间 (3人) seats[9,10,3]
  table(r,'right-top-desk-1',25,4.5,1.8,1,.9);
  seat(r,anchor(25,5.8,Math.PI/2,9),9);
  table(r,'right-top-desk-2',27,4.5,1.8,1,.9);
  seat(r,anchor(27,5.8,Math.PI/2,10),10);
  table(r,'right-top-desk-3',26,7.5,1.8,1,.9);
  seat(r,anchor(26,6.5,Math.PI/2,3),3);
  
  // 左中工位 (2人面对面) seats[2,6]
  table(r,'left-mid-desk',5.5,14,1.8,3,.9);
  seat(r,anchor(5.5,12.0,Math.PI,2),2);
  seat(r,anchor(5.5,16.0,0,6),6);
  
  // 右中工位 (1人) seats[7]
  table(r,'right-mid-desk-1',24,14,1.8,1.2,.9);
  seat(r,anchor(24,15.3,Math.PI/2,7),7);
  
  // 下方工位 (4人) seats[11,4,5,12]
  table(r,'bottom-desk-1',13,23,1.8,1,.9);
  seat(r,anchor(13,24.3,Math.PI/2,11),11);
  table(r,'bottom-desk-2',15.5,23,1.8,1,.9);
  seat(r,anchor(15.5,24.3,Math.PI/2,4),4);
  table(r,'bottom-desk-3',18,23,1.8,1,.9);
  seat(r,anchor(18,24.3,Math.PI/2,5),5);
  table(r,'bottom-desk-4',20.5,23,1.8,1,.9);
  seat(r,anchor(20.5,24.3,Math.PI/2,12),12);
  
  // 中央交换台
  table(r,'exchange-table',cx,14,2.4,1.5,.85);
  
  // 左上会议室圆桌
  table(r,'meeting-table',5.5,6.5,3.2,3.2,.9,'round');
  const meeting:ActorAnchor[]=[];
  for(let i=0;i<6;i++){
    const q=-Math.PI/2+i*Math.PI/3,x=5.5+2.6*Math.cos(q),z=6.5+2.6*Math.sin(q);
    const a=anchor(x,z,Math.atan2(5.5-x,6.5-z),i);
    a.chair='meeting-chair-'+i;meeting.push(a);
    r.layout.chairs.push({id:a.chair,side:'judge',position:[x,1,z],yaw:a.homeYaw,slide:0});
  }
  
  // 访客位置：手动为每个座位指定，确保避开桌子和墙壁
  const visits:[number,number,number][]=[
    [13.5,1,8],    // 座位0: 中上长桌，访客在座位后方通道
    [17.5,1,8],    // 座位1: 同上
    [7,1,13.5],    // 座位2: 左中工位面北，访客在左侧
    [24.5,1,6.5],  // 座位3: 右上，访客在座位左侧
    [15.5,1,25],   // 座位4: 下方工位，访客在座位后方
    [18,1,25],     // 座位5: 同上
    [7,1,15.5],    // 座位6: 左中工位面南，访客在左侧
    [24,1,16.5],   // 座位7: 右中工位，访客在座位后方
    [13,1,8],      // 座位8: 中上长桌左侧
    [23.5,1,5.8],  // 座位9: 右上，访客在座位左侧
    [28.5,1,5.8],  // 座位10: 右上，访客在座位右侧
    [13,1,25],     // 座位11: 下方工位左侧
    [20.5,1,25],   // 座位12: 下方工位右侧
  ];
  r.work={visits,meeting,huddle:{center:[cx,1,14],rx:4.5,rz:3.2}};
  
  return finish(r);
}
function podcast():Room {
  const r=shell('podcast',14,14);
  seat(r,anchor(5.2,7.3,.5,0),0,'armchair');seat(r,anchor(10.8,7.3,-.5,1),1,'armchair');
  table(r,'coffee-table',8,8.2,2.7,1.1,.55);
  r.lights.push({position:[8,4.4,8],length:.55,intensity:30,distance:12,kind:'lantern',shadow:true});
  r.layout.board={position:[8,4.4,1.08],width:8,height:1.6};r.camera=[8,3.3,13.5];r.cameraTarget=[8,2.3,7.2];r.seatedSpeech=true;
  const b=new Builder();for(const block of r.blocks)b.put(block.x,block.y,block.z,block.id,block.props);for(const x of [2,3,12,13])b.fill(x,x,2,3,1,1,'brown_wool');r.blocks=b.connect();return finish(r);
}
function meadow():Room {
  const b=new Builder(),cx=16,cz=13;
  b.fill(0,31,0,0,0,27,'grass_block');
  for(let z=1;z<26;z++){b.put(3+Math.floor(Math.sin(z*.2)*1.5),0,z,'dirt_path');}
  b.fill(22,27,0,0,12,17,'water');
  b.fill(22,27,-1,-1,12,17,'dirt');
  b.fill(0,31,1,1,0,1,'grass_block').fill(0,31,2,2,0,0,'grass_block');
  for(const [x,z] of [[3,4],[28,4],[3,23],[28,18]]){
    b.fill(x,x,1,4,z,z,'oak_log',{axis:'y'});
    b.fill(x-2,x+2,4,5,z-2,z+2,'oak_leaves',{persistent:'true'}).fill(x-1,x+1,6,6,z-1,z+1,'oak_leaves',{persistent:'true'});
  }
  for(const x of [8,16,24]){
    b.fill(x,x,2,5,1,1,'oak_log',{axis:'y'});
    b.fill(x-3,x+3,5,6,-1,3,'oak_leaves',{persistent:'true'}).fill(x-2,x+2,7,7,0,2,'oak_leaves',{persistent:'true'});
  }
  for(const [x,z] of [[6,7],[25,8],[6,19],[22,22],[9,4],[20,3]])b.put(x,1,z,'dandelion');
  b.fill(cx-3,cx+2,1,1,cz-3,cz+2,'white_carpet');
  for(const x of [cx-3,cx+2])b.fill(x,x,1,1,cz-3,cz+2,'orange_carpet');
  const r:Room={kind:'meadow',title:MC_SCENE_NAMES.meadow,outdoor:true,seatedSpeech:true,blocks:b.connect(),ceiling:[],anchors:[],host:[cx,1,cz],
    layout:{tables:[],chairs:[],desk:[],podium:{position:[cx,1,cz],yaw:0},board:{position:[cx,3.2,3.1],width:8,height:1.5},phaseLamps:[]},
    camera:[cx,4.8,25.4],cameraTarget:[cx,1.8,cz],fit:[],judge:[cx,2.6,24],judgeTarget:[cx,2,cz],lights:[],windows:[],banners:[],floor:[],bounds:{min:[1,1,1],max:[31,12,27]}};
  table(r,'picnic-table',cx,cz,2.8,2.8,.32,'round');
  for(let i=0;i<8;i++){const q=-Math.PI/2+i*Math.PI/4,x=cx+4.5*Math.cos(q),z=cz+4.5*Math.sin(q);seat(r,anchor(x,z,Math.atan2(cx-x,cz-z),i),i,'stool');}
  return finish(r);
}
export function buildMcRoom(kind:McSceneKind='debate'):Room {
  if(kind==='debate')return buildDebateRoom();
  return ({roundtable,office,classroom,meadow,podcast}[kind])();
}
