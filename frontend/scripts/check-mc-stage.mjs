import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{createSceneDirector,stepScene},{buildMcRoom},{RATIONAL_PERSONAS}]=await Promise.all([vite.ssrLoadModule('/src/mc/sceneDirector.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/data/rationalPersonas.ts')]);
  const room=buildMcRoom(),cast=room.anchors.map((_,i)=>({agentId:'stage-'+i,seatIndex:i,persona:{...RATIONAL_PERSONAS[i%RATIONAL_PERSONAS.length],name:'成员'+i},personalityId:'default',color:'#6f8b79'}));
  let s=createSceneDirector(cast,room,'话题'),now=0;const signals=[];
  const tick=(events=[],ms=100)=>{if(!['paused','stopped'].includes(s.session)&&!s.globalError)now+=ms;const r=stepScene(s,now,events,room);s=r.state;signals.push(...r.outputs.signals);assert.ok(s.bubbles.length<=2);return r.outputs;};
  tick([{type:'session',state:'running'},{type:'round',round:1,label:'讨论'}]);assert.ok(signals.some(x=>x.gate==='round'&&x.key==='1'));
  for(let i=0;i<3;i++){const who=cast[i].agentId;tick([{type:'status',agentId:who,state:'speaking',action:'交流'},{type:'message',message:{id:'m'+i,round:1,speakerId:who,text:'公开发言'+i,kind:'speech',at:0}}]);assert.ok(signals.some(x=>x.gate==='speech'&&x.key===who));assert.equal(s.actors[who].sit,1);}
  assert.equal(s.bubbles[0].text,'公开发言0');tick([{type:'message_update',id:'m0',text:'更新内容',cut:true}]);assert.equal(s.bubbles.find(b=>b.id==='m0')?.text,'更新内容');
  tick([{type:'session',state:'paused'}]);const paused=s.now;tick([{type:'message',message:{id:'private',round:1,speakerId:'user',targetId:cast[0].agentId,text:'私聊',kind:'user',private:true,at:0}}],1000);assert.equal(s.now,paused);assert.ok(s.chat.some(c=>c.private&&c.text.includes('私聊')));
  tick([{type:'session',state:'running'}]);assert.equal(s.session,'running');tick();assert.equal(s.now,paused+100,'恢复后下一帧正常推进，暂停时长不能导致时钟跳跃');
  tick([{type:'error',id:'offline',agentId:cast[0].agentId,message:'离线'}]);assert.equal(s.actors[cast[0].agentId].error,'离线');tick([{type:'clear_error',agentId:cast[0].agentId}]);assert.equal(s.actors[cast[0].agentId].error,null);
  tick([{type:'result',result:{summary:'总结',consensus:[],disagreements:[],openQuestions:[],suggestions:[]}},{type:'session',state:'finished'}]);assert.equal(s.boardResult,true);assert.equal(s.result.summary,'总结');assert.ok(Object.values(s.actors).every(a=>a.sit===1));
  tick([{type:'session',state:'stopped'}]);const stopped=s.now;tick([],1000);assert.equal(s.now,stopped);
  console.log('Pass：圆桌事件/发言门禁、八席坐着发言、气泡排队/更新/打断、暂停私聊/恢复、掉线恢复、总结与停止。');
}finally{await vite.close();}
