import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{buildMcRoom,MC_SCENE_KINDS},{validateRoom},{SCENES},{RATIONAL_PERSONAS},{createSceneDirector,stepScene},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/mc/rooms/validate.ts'),vite.ssrLoadModule('/src/data/scenes.ts'),vite.ssrLoadModule('/src/data/rationalPersonas.ts'),vite.ssrLoadModule('/src/mc/sceneDirector.ts'),vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const cast=room=>room.anchors.map((_,i)=>({agentId:'fixture-'+i,seatIndex:i,persona:{...RATIONAL_PERSONAS[i%RATIONAL_PERSONAS.length],name:'成员'+i},personalityId:'default',color:'#6f8b79',isLead:i===0}));
  for(const kind of MC_SCENE_KINDS){const room=buildMcRoom(kind),source=SCENES[kind],variant=SCENES[kind+'-mc'];
    assert.equal(variant.sourceSceneId,kind);assert.equal(variant.recommendedMode,source.recommendedMode);assert.equal(variant.maxSeats,source.maxSeats);assert.equal(source.mcStage,undefined);assert.equal(room.anchors.length,source.maxSeats);
    for(const pack of ['original','hd','style']){
      const dir=pack==='original'?'public/mc':'public/mc/'+pack,atlas=JSON.parse(await fs.readFile(dir+'/atlas.json','utf8')),result=validateRoom(room,{...blocks,atlas});
      assert.deepEqual(result.errors,[],kind+' / '+pack+': '+result.errors.slice(0,4).join(';'));console.log('Pass room:',kind,pack,JSON.stringify(result.checks));
    }
    if(kind==='debate')continue;
    const people=cast(room);let state=createSceneDirector(people,room,'验证话题');
    const advance=(now,events=[])=>{const r=stepScene(state,now,events,room);state=r.state;return r.outputs;};
    const who=people[room.standingSeats?1:0].agentId;
    advance(0,[{type:'session',state:'running'},{type:'round',round:1,label:'交流'},{type:'status',agentId:who,state:'speaking',action:'交流'}]);
    advance(1200,[{type:'message',message:{id:'public',round:1,speakerId:who,text:'测试公开发言',kind:'speech',at:0}}]);
    assert.equal(state.bubbles[0]?.text,'测试公开发言');
    assert.equal(state.actors[who].sit,room.seatedSpeech?1:0);assert.equal(state.actors[who].position[1],room.seatedSpeech?1.5:1,'坐姿与站姿脚底高度');
    const before=JSON.stringify(state.actors[who].position);advance(1300,[{type:'session',state:'paused'}]);advance(9000);assert.equal(JSON.stringify(state.actors[who].position),before);
    advance(1400,[{type:'session',state:'running'},{type:'status',agentId:who,state:'idle',action:'倾听'}]);
    const look=state.lookSpeaker;advance(1500,[{type:'status',agentId:who,state:'speaking',action:'私下回复'},{type:'message',message:{id:'private',round:1,speakerId:who,text:'秘密内容',kind:'reply',private:true,targetId:'user',at:0}}]);assert.equal(state.lookSpeaker,look);assert.ok(!state.bubbles.some(b=>b.text==='秘密内容'));
    advance(1600,[{type:'message_update',id:'private',text:'秘密内容补齐'}]);assert.ok(state.chat.find(c=>c.id==='private')?.text.endsWith('秘密内容补齐'));assert.ok(!state.bubbles.some(b=>b.text==='秘密内容补齐'));
    advance(1700,[{type:'error',id:'offline',agentId:who,message:'网络错误'}]);assert.ok(state.actors[who].error);advance(1800,[{type:'clear_error',agentId:who}]);assert.equal(state.actors[who].error,null);
    advance(2000,[{type:'result',result:{consensus:['共识'],disagreements:[],openQuestions:[],suggestions:[]}}]);assert.equal(state.boardResult,true);assert.equal(state.title.text,'本次讨论结束');
    assert.ok(!state.actors[who].queue.some(a=>['nextRound','tapBell','cheer'].includes(a.kind)));console.log('Pass events:',kind,'speech, privacy, pause, errors, neutral ending');
  }
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks),people=cast(office);let state=createSceneDirector(people,office,'工作任务');
  let officeClock=0;
  const move=(id,to)=>{const time=officeClock;officeClock+=41000;const r=stepScene(state,time,[{type:'move',agentId:id,to}],office,(a,b)=>physics.path(a,b));state=r.state;for(let t=time+100;t<=time+40000;t+=100)state=stepScene(state,t,[],office,(a,b)=>physics.path(a,b)).state;};
  for(const [i,j] of [[0,3],[3,10],[10,6],[6,12]]){const id=people[i].agentId;move(id,people[j].agentId);assert.ok(state.away[id]);assert.ok(Math.hypot(state.actors[id].position[0]-office.work.visits[j][0],state.actors[id].position[2]-office.work.visits[j][2])<.1);move(id,'desk');assert.equal(state.actors[id].sit,1);assert.equal(state.actors[id].position[1],1.5);}
  for(let i=0;i<7;i++)move(people[i].agentId,'meeting');
  assert.equal(Object.values(state.away).filter(a=>a.sit).length,6);assert.ok(Object.values(state.away).some(a=>!a.sit));
  const endpoints=Object.values(state.away).map(a=>a.point);assert.equal(new Set(endpoints.map(p=>p.join(','))).size,endpoints.length);
  move(people[0].agentId,'huddle');assert.ok(state.away[people[0].agentId]);
  state=stepScene(state,officeClock,[{type:'task',task:{id:'job',title:'检查方案',from:people[0].agentId,to:people[1].agentId,status:'assigned'}}],office).state;assert.equal(state.tasks.at(-1).title,'检查方案');
  console.log('Pass office: cross-room visits, return height, six meeting chairs, standing overflow, huddle and tasks.');
}finally{await vite.close();}
