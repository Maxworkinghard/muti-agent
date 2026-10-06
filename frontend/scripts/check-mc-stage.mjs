import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  const [{createDirector,step},{buildDebateRoom},{RATIONAL_PERSONAS},{debateSchedule}]=await Promise.all([vite.ssrLoadModule('/src/mc/director.ts'),vite.ssrLoadModule('/src/mc/rooms/debate.ts'),vite.ssrLoadModule('/src/data/rationalPersonas.ts'),vite.ssrLoadModule('/src/engines/rational/schedule.ts')]);
  const cast=Array.from({length:7},(_,i)=>({agentId:'p'+i,seatIndex:i,side:i<3?'pro':i<6?'con':'host',persona:{...RATIONAL_PERSONAS[i%5],name:'成员'+i},personalityId:'x',color:'#5555FF'}));
  const room=buildDebateRoom();let now=0,s=createDirector(cast,room,'辩题'),trace=[],signals=[],maxBubbles=0;
  const tick=(inputs=[],ms=50)=>{now+=ms;const r=step(s,now,inputs,room);s=r.state;trace.push(...r.outputs.actions);signals.push(...r.outputs.signals);maxBubbles=Math.max(maxBubbles,s.bubbles.length);assert.ok(s.bubbles.length<=2,'同时出现三个气泡');for(const a of Object.values(s.actors))if(s.mics[a.anchor.mic])assert.ok(a.status==='speaking'||s.resultStage>=1,'非发言者开麦');return r;};
  const until=(predicate,limit=60000)=>{let spent=0;while(!predicate()&&spent<limit){tick();spent+=50;}assert.ok(predicate(),'动作或信号没有在界内完成');};
  const msg=(id,text,extra={})=>({id,round:s.round,speakerId:extra.speakerId??'p0',text,kind:'speech',at:0,...extra});
  tick([{type:'session',state:'running'}]);
  const cfg={participants:cast,maxRounds:3,mode:'rational',theme:{title:'辩题'},engineOptions:{}};
  let seenRound=0;
  for(const [i,turn] of debateSchedule(cfg).entries()){
    if(turn.round!==seenRound){seenRound=turn.round;const before=trace.length,stage=/立论/.test(turn.stage)?0:/交锋|质询/.test(turn.stage)?1:2,changed=s.stage!==stage;tick([{type:'round',round:turn.round,label:turn.stage}]);until(()=>s.roundReady);const ritual=trace.slice(before).filter(x=>x.actor==='p6').map(x=>x.kind);assert.ok(ritual.includes('tapBell'),'换轮没有拍桌铃');assert.equal(ritual.includes('nextRound'),changed,'换阶段时没按「下一轮」，或者没换阶段也按了');assert.ok(!changed||ritual.indexOf('nextRound')<ritual.indexOf('tapBell'),'先按「下一轮」再拍桌铃');assert.equal(s.stage,stage,'辩题屏的阶段不对');assert.ok(s.stages.slice(0,stage+1).every(Boolean),'到过的阶段没有亮');}
    const id=turn.speaker.agentId,start=trace.length;tick([{type:'status',agentId:id,state:'thinking',action:'组织论点'}]);tick([{type:'status',agentId:id,state:'speaking',action:turn.tag}]);
    tick([{type:'message',message:msg('speech-'+i,'还未开麦的测试文字',{speakerId:id,targetId:turn.target?.agentId,tag:turn.tag})}]);assert.ok(!s.bubbles.some(b=>b.id==='speech-'+i),'动作完成前出了气泡');
    until(()=>s.bubbles.some(b=>b.id==='speech-'+i));const actions=trace.slice(start).filter(x=>x.actor===id).map(x=>x.kind);assert.ok(id==='p6'?actions.includes('flipScript')&&actions.includes('mic'):actions.includes('mic'),'气泡之前没有翻讲稿或按话筒');
    if(turn.round===2){until(()=>s.actors[id].sit===0&&s.actors[turn.target.agentId].sit===0);assert.deepEqual(new Set(s.pair),new Set([id,turn.target.agentId]));assert.equal(s.actors[id].look.agent,turn.target.agentId);assert.equal(s.actors[turn.target.agentId].look.agent,id);}
    else if(turn.target)assert.ok(!s.pair.length,'立论/总结也创建了交锋对');
    tick([{type:'message_update',id:'speech-'+i,text:'一条完整发言。'}]);tick([{type:'status',agentId:id,state:'idle',action:'倾听'}]);for(let n=0;n<25;n++)tick();
  }
  until(()=>Object.values(s.actors).every(a=>!a.active&&!a.queue.length));
  console.log('Pass：整场快辩，按话筒/翻讲稿先于气泡；换阶段先按「下一轮」再拍桌铃，辩题屏阶段对；只有发言者开麦；最多两个气泡；交锋双方起立与换对，总结不带起对方。');
  const initialBubbleCount=s.bubbles.length;tick([{type:'message',message:msg('private-u','秘密',{speakerId:'user',kind:'user',private:true,targetId:'p0'})},{type:'message',message:msg('private-r','悄悄回复',{kind:'reply',private:true,targetId:'user'})}]);assert.equal(s.bubbles.length,initialBubbleCount);assert.ok(s.chat.filter(c=>c.private).length>=2);console.log('Pass：私聊与回复没有气泡，只有灰色斜体聊天行。');
  tick([{type:'status',agentId:'p0',state:'speaking',action:'立论'}]);tick([{type:'session',state:'paused'}]);const paused=structuredClone(s);for(let i=0;i<20;i++)tick([],100);assert.deepEqual(s,paused);tick([{type:'session',state:'running'}],0);now=s.now;until(()=>s.actors.p0.ready);console.log('Pass：暂停期间动作、气泡、聊天计时均定格；恢复从原处继续。');
  tick([{type:'error',id:'offline',agentId:'p0',message:'测试错误'}]);assert.equal(s.actors.p0.error,'测试错误');tick([{type:'clear_error',agentId:'p0'}]);assert.equal(s.actors.p0.error,null);assert.ok(s.chat.some(c=>c.text.includes('重新加入')));console.log('Pass：成员掉线、恢复和提示。');
  s=createDirector(cast,room,'辩题');now=0;trace=[];signals=[];
  // 故意带上旧版本的评分字段，确认已完成的旧会话也不会触发胜负展示。
  tick([{type:'result',result:{summary:'双方讨论结束。',consensus:[],disagreements:[],openQuestions:[],suggestions:[],verdict:{winner:'正方',proScore:82,conScore:76}}},{type:'session',state:'finished'}]);
  until(()=>s.resultStage===3);
  const bells=trace.filter(a=>a.kind==='tapBell');assert.equal(bells.length,1);
  assert.ok(s.boardResult,'辩题屏没有进入结束状态');
  assert.ok(Object.values(s.actors).every(a=>!s.mics[a.anchor.mic]),'结束后仍有话筒灯亮着');
  assert.ok(Object.values(s.actors).filter(a=>a.side!=='host').every(a=>a.sit===1));
  assert.equal(Object.values(s.actors).find(a=>a.side==='host').sit,0,'主持人应留在讲台后站立');
  assert.equal(trace.filter(a=>a.kind==='clap').length,cast.length,'双方和主持应同样鼓掌致意');
  assert.ok(!trace.some(a=>a.kind==='cheer'||a.kind==='crouch'),'结束时仍有获胜庆祝');
  assert.equal(s.title.text,'本场辩论结束');assert.equal(s.title.sub,'讨论总结已生成');
  assert.equal(s.executed,s.enqueued);console.log('Pass：一次桌铃→关闭全部话筒→双方起立致意并归位→显示结束状态；旧评分数据不触发胜负动画。');
  s=createDirector(cast.filter(p=>p.side!=='host'),room,'辩题');now=0;tick([{type:'round',round:1,label:'立论陈述'}]);assert.ok(s.roundReady);assert.ok(s.stages.every(v=>!v)&&s.stage===-1);assert.ok(s.bellAt<0&&s.buttonAt<0);console.log('Pass：没有主持时没人按「下一轮」、没人拍桌铃。');
  console.log('11 项舞台检查通过。');
}finally{await vite.close();}
