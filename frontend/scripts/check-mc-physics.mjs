import fs from 'node:fs/promises';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{RoomPhysics},{buildMcRoom}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/physics.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts')]);
  const assets=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')),room=buildMcRoom(),p=new RoomPhysics(room,assets);
  const pos=new THREE.Vector3(12.4,1,9.2);assert.ok(p.canOccupy(pos));p.move(pos,0,.5);assert.ok(Math.abs(pos.z-9.7)<.001);assert.equal(pos.y,1);
  for(const t of room.layout.tables)assert.equal(p.canOccupy(new THREE.Vector3(t.center[0],1,t.center[2])),false,'人物不能穿桌');
  const wall=new THREE.Vector3(12.4,1,15.2);p.move(wall,0,4);assert.ok(wall.z<=16.78,'人物不能走出南面柱线');
  const outside=new THREE.Vector3(25,1,22);assert.equal(p.canOccupy(outside),false);assert.deepEqual(p.path(outside.toArray(),[12.4,1,9.2]),[]);
  const people=[{x:12.4,y:1,z:11.2,radius:.4,height:1.875}],stop=new THREE.Vector3(12.4,1,9.6);p.move(stop,0,4,people);assert.ok(stop.z<=10.52,'人物碰撞不变');
  const stairs=new RoomPhysics({...room,blocks:[...room.blocks,{id:'spruce_stairs',x:12,y:1,z:9,props:{facing:'north',half:'bottom',shape:'straight'}}]},assets);
  const stair=new THREE.Vector3(12.5,1,10.4);stairs.move(stair,0,-.35);assert.ok(stair.y>1&&stair.y<=1.6);stairs.move(stair,0,-.6);assert.equal(stair.y,2,'半格台阶仍可上');
  console.log('Pass：茶叙榭角色行走、地板、桌子/人物碰撞、行走边界及台阶逻辑。');
}finally{await vite.close();}
