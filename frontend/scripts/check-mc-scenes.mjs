import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{SCENES,SCENE_LIST},{MODES},{buildMcRoom,MC_SCENE_KINDS}]=await Promise.all([vite.ssrLoadModule('/src/data/scenes.ts'),vite.ssrLoadModule('/src/data/modes.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts')]);
  assert.deepEqual(MC_SCENE_KINDS,['roundtable']);
  assert.deepEqual(SCENE_LIST.filter(s=>s.mcStage).map(s=>s.id),['roundtable-mc']);
  for(const [kind,seats] of Object.entries({roundtable:8,debate:7,office:13,classroom:8,meadow:8,podcast:2})){
    const s=SCENES[kind];assert.ok(s);assert.equal(s.mcStage,undefined);assert.equal(s.maxSeats,seats);assert.equal(s.image,'/scenes/scene-'+kind+'.png');
    if(kind!=='roundtable'){assert.equal(SCENES[kind+'-mc'],undefined);assert.throws(()=>buildMcRoom(kind),/已移除/);}
  }
  assert.equal(SCENES.office.stations.visits.length,13);assert.equal(SCENES.office.stations.meeting.length,6);
  assert.deepEqual(MODES.map(m=>[m.id,m.scene]),[['entertainment','roundtable'],['rational','debate'],['emotion','roundtable'],['product','office']]);
  assert.match(SCENES['roundtable-mc'].name,/未完成/);assert.match(SCENES['roundtable-mc'].description,/未通过用户视觉验收/);
  const room=buildMcRoom();assert.equal(room.kind,'roundtable');assert.equal(typeof room.drawBoard,'function');assert.equal(room.anchors.length,8);
  console.log('Pass：唯一 3D 入口为圆桌重建样板，无旧房间回退；六个 2D 场景、四模式默认场景及办公室布局保留。');
}finally{await vite.close();}
