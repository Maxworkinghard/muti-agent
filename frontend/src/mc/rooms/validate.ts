import * as THREE from 'three';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import type {Assets} from '../assets';
import {blockModels,resolveModel,resolveTexture,transformPoint,fullBlock,key,type Block} from '../blockModel';
import {propagate} from '../light';
import {propBoxes,type Room} from './debate';
export interface Validation {checks:Record<string,number>;errors:string[]}
/** 房间检查（第 4.7 节，第二轮加上写实物品）：方块合法、有依托、连接正确，人和视线不被挡，两队对称，光照够亮。 */
export function validateRoom(room:Room,assets:Pick<Assets,'states'|'models'|'atlas'>):Validation {
  const errors:string[]=[],checks:Record<string,number>={states:0,supports:0,connections:0,positions:0,mirror:0,camera:0,light:0,props:0};
  const roomBlocks=[...room.blocks,...room.ceiling];
  const cells=new Map(roomBlocks.map(b=>[key(b.x,b.y,b.z),b]));
  const boxes:Array<{name:string;box:THREE.Box3;soft?:boolean;cutaway?:boolean;obb?:OBB}>=[];
  const hitsRay=(b:{box:THREE.Box3;obb?:OBB},ray:THREE.Ray)=>b.obb?b.obb.intersectRay(ray,new THREE.Vector3()):ray.intersectBox(b.box,new THREE.Vector3());
  const solid=(x:number,y:number,z:number)=>fullBlock(cells.get(key(x,y,z)));
  const support=(b:Block,ok:boolean)=>{checks.supports++;if(!ok)errors.push('缺少依托 '+b.id+' '+key(b.x,b.y,b.z));};
  for(const b of [...room.blocks,...room.ceiling]){
    try{for(const ref of blockModels(assets,b)){const model=resolveModel(assets.models,ref.model);for(const e of model.elements??[]){for(const face of Object.values(e.faces)){const t=resolveTexture(model,face.texture);if(!assets.atlas.textures[t])errors.push('缺少贴图 '+t+'（房间改过以后要重新运行 npm run mc:import）');}const ps:number[][]=[];for(const x of [e.from[0],e.to[0]])for(const y of [e.from[1],e.to[1]])for(const z of [e.from[2],e.to[2]])ps.push([x/16,y/16,z/16]);boxes.push({name:b.id+' '+key(b.x,b.y,b.z),soft:b.id.endsWith('carpet'),cutaway:room.ceiling.includes(b),box:new THREE.Box3().setFromPoints(ps.map(p=>transformPoint(p,e,ref).add(new THREE.Vector3(b.x,b.y,b.z))))});} }checks.states++;}catch(e){errors.push(String(e));}
    const below=cells.get(key(b.x,b.y-1,b.z)),above=cells.get(key(b.x,b.y+1,b.z));
    if(b.id==='lantern')support(b,b.props.hanging==='true'?!!above&&(fullBlock(above)||above.id==='iron_chain'||above.id.endsWith('fence')||above.id.endsWith('log')):!!below);
    if(b.id==='iron_chain')support(b,!!above);
    if(b.id.endsWith('carpet')||b.id.endsWith('candle')||b.id==='bell')support(b,!!below);
    if(b.id==='flowering_azalea'||b.id==='azalea')support(b,!!below&&/moss_block|dirt|grass_block|clay/.test(below.id));
    if(b.id.endsWith('wall_banner'))support(b,solid(b.x+(b.props.facing==='east'?1:b.props.facing==='west'?-1:0),b.y,b.z+(b.props.facing==='south'?-1:b.props.facing==='north'?1:0)));
    if(b.id==='spruce_door'){const other=cells.get(key(b.x,b.y+(b.props.half==='lower'?1:-1),b.z));support(b,other?.id===b.id&&other.props.half!==b.props.half&&(b.props.half==='upper'||!!below));}
    if(b.id.endsWith('fence')||b.id.endsWith('pane')){checks.connections++;for(const [d,dx,dz] of [['north',0,-1],['south',0,1],['west',-1,0],['east',1,0]] as const){const n=cells.get(key(b.x+dx,b.y,b.z+dz));const expected=fullBlock(n)||n?.id===b.id||!!(n?.id.endsWith('pane')&&b.id.endsWith('pane'));if(b.props[d]!==String(expected))errors.push('连接状态错误 '+b.id+' '+d);}}
  }
  // 写实物品的碰撞箱（桌子、讲台）；椅子是给人坐的，不算。
  for(const p of propBoxes(room)){checks.props++;const obb=new OBB(new THREE.Vector3(...p.center),new THREE.Vector3(...p.half),new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(p.yaw)));boxes.push({name:p.id,box:new THREE.Box3(),obb});}
  // 摆件的依托（第 12.12 节第 4 条）：桌面上的东西底面要贴着桌面（误差不超过 1 厘米）。
  for(const d of room.layout.desk)if(d.mic){const t=room.layout.tables.find(x=>x.side===d.side);if(t){checks.props++;if(Math.abs(d.mic[1]-(t.center[1]+t.height))>.01)errors.push('摆件悬空 '+d.id+' 桌面 '+(t.center[1]+t.height).toFixed(2)+' 东西 '+d.mic[1].toFixed(2));}}
  // 人的身体按游戏人物的尺寸、跟着朝向转：连胳膊宽 0.8 米，前后 0.4 米。
  const body=(point:number[],yaw:number,sitting=false)=>{const lo=sitting?.12:.08,hi=sitting?1.25:1.87;return new OBB(new THREE.Vector3(point[0],point[1]+(lo+hi)/2,point[2]),new THREE.Vector3(.4,(hi-lo)/2,.2),new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(yaw)));};
  const checkPoint=(point:number[],yaw:number,name:string,sitting=false)=>{checks.positions++;const box=body(point,yaw,sitting);const hits=boxes.filter(b=>!b.soft&&(b.obb?b.obb.intersectsOBB(box):box.intersectsBox3(b.box)));if(hits.length)errors.push(name+' 碰撞 '+hits.map(b=>b.name).join(';'));};
  room.anchors.forEach((a,i)=>{const host=a.seat===a.stand;checkPoint(a.seat,a.homeYaw,'座位'+i,!host);checkPoint(a.stand,a.homeYaw,'站位'+i);if(!host)for(let t=0;t<=1;t+=.1)checkPoint(a.seat.map((n,k)=>n+(a.stand[k]-n)*t),a.homeYaw,'起身'+i);});
  const mirrorX=room.bounds.min[0]+room.bounds.max[0]-1;
  for(const b of room.blocks.filter(b=>b.x>=1&&b.x<mirrorX/2&&b.z>=2&&b.z<=9)){checks.mirror++;const other=cells.get(key(mirrorX-b.x,b.y,b.z));const props={...b.props};if(b.props.east!==undefined){props.east=b.props.west;props.west=b.props.east;}for(const p of ['facing']){if(props[p]==='east')props[p]='west';else if(props[p]==='west')props[p]='east';}const str=(o:Record<string,string>)=>JSON.stringify(Object.entries(o).sort());if(other?.id!==b.id.replace('blue','red')||str(other.props)!==str(props))errors.push('两队不对称 '+key(b.x,b.y,b.z));}
  // 默认机位要能看到七个人的头，以及辩题板的四个角。
  const eye=new THREE.Vector3(...room.camera),sc=room.layout.board;
  if(room.camera.some((v,i)=>v<=room.bounds.min[i]+.18||v>=room.bounds.max[i]-.18))errors.push('默认机位不在室内净空间');
  const targets=[...room.anchors.map(a=>a.seat===a.stand?new THREE.Vector3(a.stand[0],a.stand[1]+1.62,a.stand[2]):new THREE.Vector3(a.seat[0],a.seat[1]+1.15,a.seat[2])),...[-1,1].flatMap(x=>[-1,1].map(y=>new THREE.Vector3(sc.position[0]+x*(sc.width/2-.05),sc.position[1]+y*(sc.height/2-.05),sc.position[2]+.04)))];
  for(const target of targets){checks.camera++;const direction=target.clone().sub(eye),dist=direction.length();const ray=new THREE.Ray(eye,direction.normalize());const hits=boxes.filter(b=>{const hit=hitsRay(b,ray);return hit&&hit.distanceTo(eye)<dist-.05;});if(hits.length)errors.push('镜头遮挡 '+target.toArray().map(n=>n.toFixed(2))+' '+hits.map(b=>b.name).join(';'));}
  const lights=propagate(roomBlocks);for(const a of room.anchors)for(const p of [a.seat,a.stand]){checks.light++;const values=lights.sample(p[0],p[1]+1,p[2]);if(Math.max(...values)<9)errors.push('人物位置光照不足 '+p+' '+values);}
  return {checks,errors};
}
