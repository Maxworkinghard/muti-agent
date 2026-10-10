import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const {savedQuality,nextAutoQuality,renderPixelRatio,QUALITY_KEY}=await vite.ssrLoadModule('/src/mc/quality.ts');
  const store=(values)=>({getItem:key=>values[key]??null});
  assert.equal(savedQuality(store({}))??'high','high');
  assert.equal(savedQuality(store({'mc-stage-quality':'low'}))??'high','high','旧低档不应成为默认');
  assert.equal(savedQuality(store({[QUALITY_KEY]:'low'})),'low','当前明确的手动选择应保留');
  assert.equal(savedQuality({getItem(){throw new Error('blocked');}})??'high','high');
  assert.equal(nextAutoQuality('high',12),'medium');assert.equal(nextAutoQuality('medium',12),null);assert.equal(nextAutoQuality('high',60),null);
  assert.equal(renderPixelRatio('high',2),2);assert.equal(renderPixelRatio('medium',2),2,'中档不降低渲染分辨率');assert.equal(renderPixelRatio('low',2),1);assert.equal(renderPixelRatio('high',3),2);assert.equal(renderPixelRatio('medium',Number.NaN),1);
  const {buildMcRoom,MC_SCENE_KINDS}=await vite.ssrLoadModule('/src/mc/rooms/scenes.ts');
  assert.deepEqual(MC_SCENE_KINDS,['roundtable']);const room=buildMcRoom();
  assert.equal(room.material,'original');assert.ok(room.paint&&Object.keys(room.paint).length>=5);
  assert.equal(room.look.ambient,1.2);assert.equal(room.look.exposure,1.34);assert.equal(room.look.sun.intensity,3.9);assert.equal(room.look.sun.shadow,.85);assert.equal(room.look.sun.color,'#ffdcb2');assert.equal(room.look.ground,'#8f877c');
  // 精装修：交接处的接触暗加重（高画质的环境光遮蔽），厅内金砖地打磨过、有光泽
  assert.equal(room.look.ao,.5);assert.ok(room.floorFinish&&room.floorFinish.roughness<.5&&(room.floorFinish.env??1)>1,'金砖地要有光泽');
  assert.equal(room.look.outdoor,true);assert.equal(room.boardStyle,'sign');
  // 用户 2026-10-10：自然光是主光，人工灯只是少量辅助，不靠灯笼和泛光造氛围
  assert.ok(room.lights.length>=1&&room.lights.length<=2&&room.lights.every(l=>l.shadow===false&&l.intensity<=1),'人工灯只留一两盏、都很暗、不投影');
  assert.ok(room.look.sun.intensity>room.lights.reduce((m,l)=>Math.max(m,l.intensity),0)*3,'太阳要远强过人工灯');
  assert.ok((room.look.bloom??.16)<=.08,'泛光要压低');
  assert.ok(room.look.shadowArea&&room.look.shadowArea.half>=40,'太阳阴影要罩住整个园子（中景的楼亭和树也投影）');
  console.log('Pass：画质选择/迁移规则不变；茶叙榭以斜阳为主光、人工灯只有两盏暗灯、泛光压低，阴影罩住全园，接触暗加重、金砖地有光泽，色板和话题板仍在。');
}finally{await vite.close();}
