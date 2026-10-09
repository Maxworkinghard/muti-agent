import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const {savedQuality,nextAutoQuality,QUALITY_KEY}=await vite.ssrLoadModule('/src/mc/quality.ts');
  const store=(values)=>({getItem:key=>values[key]??null});
  assert.equal(savedQuality(store({}))??'high','high');
  assert.equal(savedQuality(store({'mc-stage-quality':'low'}))??'high','high','旧低档不应成为默认');
  assert.equal(savedQuality(store({[QUALITY_KEY]:'low'})),'low','当前明确的手动选择应保留');
  assert.equal(savedQuality({getItem(){throw new Error('blocked');}})??'high','high');
  assert.equal(nextAutoQuality('high',12),'medium');assert.equal(nextAutoQuality('medium',12),null);assert.equal(nextAutoQuality('high',60),null);
  const {buildMcRoom,MC_SCENE_KINDS}=await vite.ssrLoadModule('/src/mc/rooms/scenes.ts');
  assert.deepEqual(MC_SCENE_KINDS,['roundtable']);const room=buildMcRoom();
  assert.equal(room.material,'original');assert.ok(room.paint&&Object.keys(room.paint).length>=5);
  assert.equal(room.look.ambient,.7);assert.equal(room.look.exposure,1.1);assert.equal(room.look.sun.intensity,4.4);
  assert.equal(room.look.outdoor,true);assert.equal(room.boardStyle,'sign');assert.ok(room.lights.some(l=>l.shadow));
  console.log('Pass：画质选择/迁移规则不变；圆桌样板原有光线、色板、话题板和灯具设置不变。');
}finally{await vite.close();}
