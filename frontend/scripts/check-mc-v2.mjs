// v2 重建场景的检查：功能契约（docs/rebuild/00-contract.md）+ 素材来源。
// 1. 和旧场景同一套 validateRoom（方块、依托、连接、人的身体、镜头视线、光照）全部通过；
// 2. 座位数、坐着发言、话题板、桌椅数量和旧场景的契约一致；
// 3. 房间里每个方块用到的贴图都由 v2 自己重画（paint），不露出原版图集的像素；
// 4. 导演层能在新房间里跑一轮发言；行走寻路能在新房间里找到路；
// 5. 没有 v2 实现的场景返回 null，旧场景默认不变。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{buildMcRoomV2,V2_KINDS},{buildMcRoom,MC_SCENE_KINDS},{validateRoom},{blockModels,resolveModel,resolveTexture},{createSceneDirector,stepScene},{RoomPhysics},{RATIONAL_PERSONAS},{SCENES}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/v2/registry.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/mc/rooms/validate.ts'),vite.ssrLoadModule('/src/mc/blockModel.ts'),
    vite.ssrLoadModule('/src/mc/sceneDirector.ts'),vite.ssrLoadModule('/src/mc/rooms/physics.ts'),vite.ssrLoadModule('/src/data/rationalPersonas.ts'),vite.ssrLoadModule('/src/data/scenes.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')),atlas=JSON.parse(await fs.readFile('public/mc/atlas.json','utf8'));
  for(const kind of MC_SCENE_KINDS){if(!V2_KINDS.includes(kind)){assert.equal(buildMcRoomV2(kind),null,kind+' 没有 v2 实现时要退回旧场景');continue;}
    const room=buildMcRoomV2(kind),old=buildMcRoom(kind),source=SCENES[kind];
    // 契约：和旧场景一样多的座位、同样的坐/站发言方式。
    assert.equal(room.kind,kind);assert.equal(room.anchors.length,old.anchors.length,'座位数');assert.equal(room.anchors.length,source.maxSeats);
    assert.equal(!!room.seatedSpeech,!!old.seatedSpeech,'坐着发言');assert.deepEqual(room.standingSeats??[],old.standingSeats??[],'站着的座位');
    assert.equal(room.layout.chairs.filter(c=>c.actor!==undefined).length,old.layout.chairs.filter(c=>c.actor!==undefined).length,'带人的椅子');
    room.anchors.forEach((a,i)=>{assert.equal(a.seat[1],1.5);assert.equal(a.stand[1],1);assert.ok(Number.isFinite(a.homeYaw));assert.equal(a.mic,'seat-'+i);});
    const b=room.layout.board;assert.ok(b.width>=2&&b.height>=.8,'话题板够大');assert.equal(typeof room.drawBoard,'function');
    // 房间检查。
    const result=validateRoom(room,{...blocks,atlas});assert.deepEqual(result.errors,[],kind+' v2: '+result.errors.slice(0,6).join('；'));
    console.log('Pass v2 room:',kind,JSON.stringify(result.checks),'blocks',room.blocks.length);
    // 素材：每个方块面的贴图都在 paint 里（v2 自己画的）。
    const missing=new Map();
    for(const blk of room.blocks)for(const ref of blockModels(blocks,blk)){const model=resolveModel(blocks.models,ref.model);for(const e of model.elements??[])for(const f of Object.values(e.faces)){const t=resolveTexture(model,f.texture);if(!room.paint?.[t])missing.set(t,blk.id);}}
    assert.deepEqual([...missing],[],kind+' v2 用到了没有重画的贴图');
    console.log('Pass v2 textures:',kind,'every block face uses a v2-painted texture');
    // 导演：一轮坐着发言。
    const people=room.anchors.map((_,i)=>({agentId:'fixture-'+i,seatIndex:i,persona:{...RATIONAL_PERSONAS[i%RATIONAL_PERSONAS.length],name:'成员'+i},personalityId:'default',color:'#6f8b79',isLead:i===0}));
    let state=createSceneDirector(people,room,'验证话题');const advance=(now,events=[])=>{const r=stepScene(state,now,events,room);state=r.state;return r.outputs;};
    const who=people[0].agentId;advance(0,[{type:'session',state:'running'},{type:'round',round:1,label:'交流'},{type:'status',agentId:who,state:'speaking',action:'交流'}]);
    advance(1200,[{type:'message',message:{id:'m',round:1,speakerId:who,text:'测试公开发言',kind:'speech',at:0}}]);
    assert.equal(state.bubbles[0]?.text,'测试公开发言');assert.equal(state.actors[who].sit,room.seatedSpeech?1:0);
    console.log('Pass v2 director:',kind,'speech bubble, seated');
    // 行走：在厅里绕过桌椅从一角走到对角（行走平面 y=1）。
    const physics=new RoomPhysics(room,blocks),[x0,,z0]=room.bounds.min,[x1,,z1]=room.bounds.max;
    for(const [from,to] of [[[x0+2,1,z0+5],[x1-2.5,1,z1-2.5]],[[x0+2,1,z1-1.5],[x1-2.5,1,z0+5]]]){const path=physics.path(from,to);assert.ok(path.length>0,'厅里找得到路 '+from+' → '+to);}
    console.log('Pass v2 physics:',kind,'diagonal paths around the table');
  }
  // 旧场景默认不变：不带 v2 专用的钩子。
  for(const kind of MC_SCENE_KINDS)assert.equal(buildMcRoom(kind).drawBoard,undefined,kind+' 旧场景不应带 drawBoard');
  console.log('Pass legacy default: old rooms unchanged');
}finally{await vite.close();}
