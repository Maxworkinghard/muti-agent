import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RATIONAL_PERSONAS},{createSceneDirector,stepScene},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/data/rationalPersonas.ts'),
    vite.ssrLoadModule('/src/mc/sceneDirector.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const cast=room=>room.anchors.map((_,i)=>({agentId:'fixture-'+i,seatIndex:i,persona:{...RATIONAL_PERSONAS[i%RATIONAL_PERSONAS.length],name:'成员'+i},personalityId:'default',color:'#6f8b79',isLead:i===0}));
  
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks),people=cast(office);
  let state=createSceneDirector(people,office,'工作任务');
  let officeClock=0;
  
  const move=(id,to)=>{
    const time=officeClock;
    officeClock+=41000;
    const r=stepScene(state,time,[{type:'move',agentId:id,to}],office,(a,b)=>physics.path(a,b));
    state=r.state;
    for(let t=time+100;t<=time+40000;t+=100)
      state=stepScene(state,t,[],office,(a,b)=>physics.path(a,b)).state;
  };
  
  for(const [i,j] of [[0,3],[3,10],[10,6],[6,12]]){
    const id=people[i].agentId;
    console.log(`\n测试: people[${i}] -> people[${j}] (${id} -> ${people[j].agentId})`);
    
    move(id,people[j].agentId);
    
    if(!state.away[id]){
      console.log(`  ✗ state.away[${id}] 是 undefined`);
      console.log(`  actor.position: [${state.actors[id].position[0].toFixed(2)}, ${state.actors[id].position[2].toFixed(2)}]`);
      console.log(`  目标 visits[${j}]: [${office.work.visits[j][0].toFixed(2)}, ${office.work.visits[j][2].toFixed(2)}]`);
      console.log(`  距离:`, Math.hypot(state.actors[id].position[0]-office.work.visits[j][0],state.actors[id].position[2]-office.work.visits[j][2]).toFixed(3));
      process.exit(1);
    }
    
    console.log(`  ✓ state.away[${id}] 已设置`);
    
    const dist=Math.hypot(state.actors[id].position[0]-office.work.visits[j][0],state.actors[id].position[2]-office.work.visits[j][2]);
    console.log(`  到达位置距离: ${dist.toFixed(3)}`);
    assert.ok(dist<.1,`距离 ${dist} 超过 0.1`);
    
    move(id,'desk');
    assert.equal(state.actors[id].sit,1);
    assert.equal(state.actors[id].position[1],1.5);
    console.log(`  ✓ 返回座位`);
  }
  
  console.log('\n✓ 所有移动测试通过');
}finally{await vite.close();}
