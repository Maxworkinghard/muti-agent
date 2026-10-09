import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{buildMcRoom},{SCALE}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/mc/design/scale.ts')]);
  const room=buildMcRoom(),table=room.layout.tables[0];assert.equal(table.shape,'round');assert.equal(table.length,4.1);assert.equal(table.height,.95);
  assert.equal(room.anchors.length,8);assert.equal(room.layout.chairs.length,8);assert.equal(room.seatedSpeech,true);
  for(const a of room.anchors){const gap=Math.hypot(a.seat[0]-table.center[0],a.seat[2]-table.center[2])-table.length/2;assert.ok(gap>=SCALE.roundGapMin&&gap<=SCALE.roundGapMax);assert.equal(a.seat[1],1.5);assert.equal(a.stand[1],1);}
  assert.deepEqual(room.camera,[7.7,3.05,14.5]);assert.deepEqual(room.cameraTarget,[14.6,2,5.4]);
  assert.deepEqual(room.bounds,{min:[6.05,1,1.05],max:[19.95,5.95,15.95]});assert.deepEqual(room.flight,{min:[-4,1,-6],max:[30,16,24]});
  console.log('Pass：圆桌现有八席、桌椅尺度、坐姿与默认镜头/行走/飞行边界保持原样。');
}finally{await vite.close();}
