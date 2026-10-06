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
  const {buildDebateRoom}=await vite.ssrLoadModule('/src/mc/rooms/debate.ts'),room=buildDebateRoom();
  const main=room.lights.filter(l=>l.shadow),fill=room.lights.filter(l=>!l.shadow);
  assert.ok(main.length>=2&&main.length<=3,'只有少量主灯投影');
  assert.ok(main.every(l=>l.kind==='lantern'&&l.position[1]>3.8&&l.position[1]<room.bounds.max[1]));
  assert.ok(main.every(l=>l.intensity>Math.max(...fill.map(f=>f.intensity))),'主桌照明应强于辅助灯');
  console.log('Pass：默认高档、旧低档迁移、自动最低中档、手动档位保留；少量主灯投影、辅助灯较弱。');
}finally{await vite.close();}
