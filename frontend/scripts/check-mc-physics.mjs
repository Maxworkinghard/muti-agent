import fs from 'node:fs/promises';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{RoomPhysics},{buildMcRoom}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/physics.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts')]);
  const assets=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')),room=buildMcRoom(),p=new RoomPhysics(room,assets);
  const pos=new THREE.Vector3(8,1,6);assert.ok(p.canOccupy(pos));p.move(pos,0,.5);assert.ok(Math.abs(pos.z-6.5)<.001);assert.equal(pos.y,1);
  for(const t of room.layout.tables)assert.equal(p.canOccupy(new THREE.Vector3(t.center[0],1,t.center[2])),false,'人物不能穿桌');
  const wall=new THREE.Vector3(8,1,14);p.move(wall,0,4);assert.ok(wall.z<=14.72,'人物不能穿南墙');
  const outside=new THREE.Vector3(25,1,22);assert.equal(p.canOccupy(outside),false);assert.deepEqual(p.path(outside.toArray(),[8,1,6]),[]);
  const people=[{x:8,y:1,z:8,radius:.4,height:1.875}],stop=new THREE.Vector3(8,1,6);p.move(stop,0,4,people);assert.ok(stop.z<=7.32,'人物碰撞不变');
  const stairs=new RoomPhysics({...room,blocks:[...room.blocks,{id:'spruce_stairs',x:8,y:1,z:6,props:{facing:'north',half:'bottom',shape:'straight'}}]},assets);
  const stair=new THREE.Vector3(8.5,1,7.4);stairs.move(stair,0,-.35);assert.ok(stair.y>1&&stair.y<=1.6);stairs.move(stair,0,-.6);assert.equal(stair.y,2,'半格台阶仍可上');
  console.log('Pass：圆桌角色行走、地板、实体墙/桌子/人物碰撞、行走边界及台阶逻辑。');
}finally{await vite.close();}
