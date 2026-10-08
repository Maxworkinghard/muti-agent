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
  // 每个房间有自己的光线；方块要么用真实贴图（original，叠加 Better Leaves），要么用自己的色板重画；
  // 朝镜头的墙能藏起来，室内屋顶挡太阳（阳光只从窗户进）；亮度来自太阳和半球光，不靠投影灯堆；话题板各不相同。
  const {buildMcRoom,MC_SCENE_KINDS}=await vite.ssrLoadModule('/src/mc/rooms/scenes.ts');
  for(const kind of MC_SCENE_KINDS){const room=buildMcRoom(kind);
    assert.ok(room.look,kind+' 应有自己的光线');
    assert.ok(room.material==='original'||(room.paint&&Object.keys(room.paint).length>=5),kind+' 应用真实方块贴图或自己的色板');
    assert.ok(room.cutaway,kind+' 朝镜头的墙应能藏起来');
    assert.ok(room.outdoor||room.look.roof||room.paint,kind+' 室内用真实方块时屋顶要挡太阳');
    assert.ok(room.lights.every(l=>!l.shadow),kind+' 不靠投影灯堆亮度');
    assert.ok(room.look.exposure>=.9&&room.look.exposure<=1.2&&room.look.ambient>=.8&&room.look.sun.intensity>=1,kind+' 曝光、环境光和太阳要让颜色亮堂');}
  assert.equal(new Set(MC_SCENE_KINDS.map(k=>buildMcRoom(k).boardStyle)).size,MC_SCENE_KINDS.length,'六个房间的话题板应各不相同');
  console.log('Pass：默认高档、旧低档迁移、自动最低中档、手动档位保留；六个房间各有光线、真实方块或色板、可藏的前墙和不同的话题板。');
}finally{await vite.close();}
