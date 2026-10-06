import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{RoomPhysics},{buildDebateRoom}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/physics.ts'),vite.ssrLoadModule('/src/mc/rooms/debate.ts')]);
  const assets=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')),room=buildDebateRoom(),p=new RoomPhysics(room,assets);
  const pos=new THREE.Vector3(8,1,10);
  assert.ok(p.canOccupy(pos),'空地和脚下地板阻止了走路');p.move(pos,0,-1);assert.ok(Math.abs(pos.z-9)<.001,'W 的前进距离不对');
  for(const t of room.layout.tables){const center=new THREE.Vector3(t.center[0],1,t.center[2]);assert.equal(p.canOccupy(center),false,'穿过了桌子 '+t.id);}
  const pod=new THREE.Vector3(...room.layout.podium.position);assert.equal(p.canOccupy(pod),false,'穿过讲台');
  const wall=new THREE.Vector3(8,1,2);p.move(wall,0,-8);assert.ok(wall.z>=1.28,'走出了北墙');
  const slide=new THREE.Vector3(1.4,1,5);p.move(slide,-1,1);assert.ok(slide.x>=1.28&&slide.z>5.5,'沿墙移动时卡住');
  const person={x:8,y:1,z:8,radius:.4,height:1.875};const stop=new THREE.Vector3(8,1,10);p.move(stop,0,-4,[person]);assert.ok(stop.z>=8.68-.001,'穿过了辩手');
  assert.equal(p.pointBlocked(new THREE.Vector3(0.5,3,5)),true,'镜头穿入墙内');assert.equal(p.pointBlocked(new THREE.Vector3(8,2.5,8)),false,'空地被当作墙');
  const stairs=new RoomPhysics({...room,blocks:[...room.blocks,{id:'spruce_stairs',x:7,y:1,z:10,props:{facing:'north',half:'bottom',shape:'straight'}}]},assets);
  const stair=new THREE.Vector3(7.5,1,11.4);stairs.move(stair,0,-.35);assert.ok(stair.y>1&&stair.y<=1.6,'半格台阶不能迈上');stairs.move(stair,0,-.6);assert.equal(stair.y,2,'楼梯的第二级不能迈上');
  console.log('Pass：空地可走、地板托脚、桌椅讲台和人物阻挡、墙边滑动、门墙边界、镜头碰撞与半格台阶。');
}finally{await vite.close();}
