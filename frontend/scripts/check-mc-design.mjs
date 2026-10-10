import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{buildMcRoom},{SCALE}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/mc/design/scale.ts')]);
  const room=buildMcRoom(),table=room.layout.tables[0];assert.equal(table.shape,'round');assert.equal(table.length,3.2);assert.equal(table.height,.72);
  assert.equal(room.anchors.length,8);assert.equal(room.layout.chairs.length,8);assert.equal(room.seatedSpeech,true);
  for(const a of room.anchors){const gap=Math.hypot(a.seat[0]-table.center[0],a.seat[2]-table.center[2])-table.length/2;assert.ok(gap>=SCALE.roundGapMin&&gap<=SCALE.roundGapMax);assert.equal(a.seat[1],1.5);assert.equal(a.stand[1],1);}
  assert.deepEqual(room.camera,[11.35,3.05,16.55]);assert.deepEqual(room.cameraTarget,[17.6,1.85,8.9]);
  assert.deepEqual(room.bounds,{min:[10.95,1,7.95],max:[21.05,5.9,17.05]});assert.deepEqual(room.flight,{min:[-15,1,-43],max:[51,20,26]});
  console.log('Pass：园林茶叙榭八席、圆桌尺度（直径 3.2、高 0.72）、坐姿与默认镜头/行走/飞行（园墙以内）边界与总平面一致。');
}finally{await vite.close();}
