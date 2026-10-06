import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import type {AgentState,ChatMessage,DiscussionResult,EngineEvent,MindView,Participant} from '../types';
import {loadAssets,type Assets,type MaterialPack} from '../mc/assets';
import {buildBlockMesh,disposeObject,type BlockShading} from '../mc/blockMesh';
import {buildDebateRoom} from '../mc/rooms/debate';
import {Builder} from '../mc/rooms/builders';
import {validateRoom} from '../mc/rooms/validate';
import {propagate,updateLightTable} from '../mc/light';
import {createEntities} from '../mc/blockEntities';
import {createCritters} from '../mc/critters';
import {FreeView} from '../mc/freeView';
import {SpectatorCamera} from '../mc/spectator';
import {RoomPhysics} from '../mc/rooms/physics';
import {createPlayer,type Player} from '../mc/player';
import {createParticles} from '../mc/particles';
import {createEnvironment} from '../mc/sky';
import {createDebateProps,type PropState} from '../mc/props/debateProps';
import {batchMovingParts} from '../mc/props/batching';
import {createPropIndirectLight} from '../mc/props/indirectLight';
import {inspectionCamera} from '../mc/props/inspection';
import {createPost,type Quality} from '../mc/post';
import {createDust,createFakeShafts,type LightRig} from '../mc/volumetric';
import {createClouds} from '../mc/clouds';
import {Sounds} from '../mc/sound';
import {StageCamera} from '../mc/camera';
import {createDirector,step,teamColor,type DirectorState,type Input,type Session,type Outputs} from '../mc/director';
import {Hud,identity} from '../mc/hud/Hud';
export interface McStageProps {inspect?:string;inspectActor?:string;events?:readonly EngineEvent[];participants:Participant[];status:Record<string,{state:AgentState;action:string}>;round:{n:number;label:string};totalRounds:number;session:Session;messages:ChatMessage[];minds:Record<string,MindView>;focus:string|null;errors:Array<{id:string;agentId?:string;message:string}>;result:DiscussionResult|null;theme:string;muted:boolean;onFocus:(id:string|null)=>void;onLoaded:(error?:string)=>void;onStageDone:(kind:'round'|'speech',key:string)=>void;visible?:boolean;gallery?:boolean;onSnapshot?:(s:DirectorState,outputs:Outputs,stats:{fps:number;calls:number;loadedMs:number;quality:Quality})=>void;material?:MaterialPack}
const QUALITY_KEY='mc-stage-quality';
function storedQuality():Quality|null{try{const q=localStorage.getItem(QUALITY_KEY);return q==='high'||q==='medium'||q==='low'?q:null;}catch{return null;}}
export function McStage3D(props:McStageProps){
  const hostRef=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
  const roomRef=useRef(buildDebateRoom()),stateRef=useRef(createDirector(props.participants,roomRef.current,props.theme,matchMedia('(prefers-reduced-motion: reduce)').matches));
  const inputs=useRef<Input[]>([]),previous=useRef<McStageProps|null>(null),anchors=useRef(new Map<string,HTMLElement>());
  const eventCursor=useRef(0);
  const [hud,setHud]=useState(stateRef.current),[progress,setProgress]=useState({n:0,step:'读取方块'}),[loaded,setLoaded]=useState(false),[view,setView]=useState('overview'),[hover,setHover]=useState<{id:string;x:number;y:number}|null>(null);
  const [quality,setQualityState]=useState<Quality>(storedQuality()??'high'),[credit,setCredit]=useState<string|null>(null);
  const qualityRef=useRef(quality),manualQuality=useRef(storedQuality()!==null);qualityRef.current=quality;
  const cameraRef=useRef<StageCamera|null>(null),galleryRef=useRef(props.gallery);galleryRef.current=props.gallery;
  const viewRef=useRef(view);viewRef.current=view;
  const spectatorRef=useRef<SpectatorCamera|null>(null),[freeControl,setFreeControl]=useState({active:false,locked:false});
  const selectView=(v:string)=>{
    if(v!=='free')spectatorRef.current?.exit();
    viewRef.current=v;setView(v);setHover(null);
    if(v==='free'&&cameraRef.current)spectatorRef.current?.enter(cameraRef.current.camera);
    if(v==='__blocked__')setTimeout(()=>{if(viewRef.current==='__blocked__'){viewRef.current='overview';setView('overview');}},2200);
  };
  const chooseQuality=(q:Quality)=>{manualQuality.current=true;try{localStorage.setItem(QUALITY_KEY,q);}catch{/* 本机存不了就只在这次生效 */}setQualityState(q);};
  useEffect(()=>{
    const old=previous.current;
    if(props.events){
      inputs.current.push(...props.events.slice(eventCursor.current));eventCursor.current=props.events.length;
      if(!old&&!props.events.length)inputs.current.push({type:'session',state:props.session});
      for(const m of props.messages)if(m.id==='brief'&&!old?.messages.some(x=>x.id===m.id))inputs.current.push({type:'message',message:m});
      for(const e of old?.errors??[])if(!props.errors.some(x=>x.id===e.id))inputs.current.push({type:'clear_error',agentId:e.agentId});
      if(props.focus!==old?.focus)inputs.current.push({type:'focus',id:props.focus});
      previous.current=props;return;
    }
    if(!old||old.session!==props.session)inputs.current.push({type:'session',state:props.session});
    if(!old&&props.session==='waiting')stateRef.current.session='waiting';
    if(props.round.n&&props.round.n!==old?.round.n)inputs.current.push({type:'round',round:props.round.n,label:props.round.label});
    for(const [id,status] of Object.entries(props.status))if(!old||old.status[id]?.state!==status.state||old.status[id]?.action!==status.action)inputs.current.push({type:'status',agentId:id,...status});
    for(const [id,mind] of Object.entries(props.minds))if(old?.minds[id]!==mind)inputs.current.push({type:'mind',agentId:id,mind});
    const oldMessages=new Map(old?.messages.map(m=>[m.id,m]));
    for(const m of props.messages){const was=oldMessages.get(m.id);if(!was)inputs.current.push({type:'message',message:m});else if(was.text!==m.text||was.cut!==m.cut)inputs.current.push({type:'message_update',id:m.id,text:m.text,cut:m.cut});}
    for(const e of props.errors)if(!old?.errors.some(x=>x.id===e.id))inputs.current.push({type:'error',...e});
    for(const e of old?.errors??[])if(!props.errors.some(x=>x.id===e.id))inputs.current.push({type:'clear_error',agentId:e.agentId});
    if(props.result&&props.result!==old?.result)inputs.current.push({type:'result',result:props.result});
    if(props.focus!==old?.focus)inputs.current.push({type:'focus',id:props.focus});
    if(old&&props.theme!==old.theme)inputs.current.push({type:'theme',title:props.theme});
    previous.current=props;
  },[props]);
  useEffect(()=>{
    const host=hostRef.current!;let disposed=false,raf=0,assets:Assets|undefined,cleanup=()=>{};
    const started=performance.now();
    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
    void (async()=>{
      try{
        assets=await loadAssets((n,step)=>{if(!disposed)setProgress({n,step});},Math.min(8,renderer.capabilities.getMaxAnisotropy()),latest.current.material);if(disposed){assets.dispose();renderer.dispose();return;}
        setCredit(assets.credit);
        const room=roomRef.current,validation=validateRoom(room,assets);if(validation.errors.length)throw new Error('辩论室检查失败：'+validation.errors[0]);
        renderer.info.autoReset=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=.95;
        renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.domElement.className='mc-canvas';renderer.domElement.setAttribute('aria-label','我的世界辩论室');host.prepend(renderer.domElement);
        const scene=new THREE.Scene(),env=createEnvironment(scene),cam=new StageCamera(room,renderer.domElement);cameraRef.current=cam;
        const roomPhysics=new RoomPhysics(room,assets);
        const spectator=new SpectatorCamera(room,renderer.domElement,{cameraBlocked:p=>roomPhysics.cameraBlocked(p),moveCamera:(p,d)=>roomPhysics.moveCamera(p,d)});spectatorRef.current=spectator;
        spectator.onStatus=(active,locked)=>setFreeControl({active,locked});
        spectator.onExit=()=>{viewRef.current='overview';setView('overview');};
        let freeView:FreeView|null=null;
        renderer.domElement.addEventListener('pointerdown',()=>freeView?.setActive(true));
        const outsideDown=(e:PointerEvent)=>{if(!(e.target instanceof Node)||!renderer.domElement.contains(e.target)){freeView?.setActive(false);spectator.deactivate();}};
        document.addEventListener('pointerdown',outsideDown);
        // 屋顶同样挡天光；先初始化天色，不能把室内当作露天的满亮天光。
        env.update(0,0);
        const light=propagate([...room.blocks,...room.ceiling]);updateLightTable(assets.lightTexture,env.daylight);
        const shading:BlockShading={lightMap:assets.lightTexture,indirect:{value:.55},direct:{value:1}};
        const staticMesh=buildBlockMesh(room.blocks,assets,light,shading);scene.add(staticMesh);
        // 实体天花板：默认机位在门内，不再为了全景剖开屋顶。
        const ceiling=buildBlockMesh(room.ceiling,assets,light,shading);ceiling.name='room-ceiling';scene.add(ceiling);
        // 八组嵌入式灯具承担主照明，位置由房间布局提供，避免模型和光源脱节。
        const lanternLights=room.lights.map((fixture,i)=>{const l=new THREE.PointLight('#ffe3c2',fixture.intensity,fixture.distance,2);l.name=`ceiling-light-${i}`;l.position.set(...fixture.position);scene.add(l);return l;});
        const entities=createEntities(assets,room);scene.add(entities.root);
        const critters=createCritters(assets,stateRef.current.now);scene.add(critters.root);
        const cast=latest.current.participants.map(p=>({id:p.agentId,anchor:p.seatIndex,side:(p.side??'host') as 'pro'|'con'|'host',name:p.persona.name,identity:identity(p,latest.current.participants)}));
        const stageProps=createDebateProps(room,cast,assets);scene.add(stageProps.root);
        // 交互器件保持游戏形态，灯具照亮全屋，阳光辅助。
        const players=new Map<string,Player>();for(const p of latest.current.participants){const player=createPlayer(p,stageProps.createBook(assets),stageProps.contacts);scene.add(player.root);players.set(p.agentId,player);}
        // 预备评委本人和室内机位的材质，第一次进入自由视角时直接使用已就绪的模型。
        freeView=new FreeView(room,renderer.domElement,[room.judge[0],1,room.judge[2]],assets,()=>Object.values(stateRef.current.actors).map(a=>({x:a.position[0],y:a.anchor.stand[1],z:a.position[2],radius:.4,height:a.sit>.5?1.65:1.875})));
        scene.add(freeView.root);freeView.onExit=()=>{viewRef.current='overview';setView('overview');};
        const propBatches=batchMovingParts(scene,[stageProps.root,...[...players.values()].map(p=>p.root)]);
        const propIndirect=createPropIndirectLight(light,assets.lightTexture);propIndirect.bind(stageProps.root);players.forEach(p=>propIndirect.bind(p.root));
        const particles=createParticles(assets);scene.add(particles.points);const sounds=new Sounds(assets.manifest);let nextMusicNote=0;
        // 环境反射：在舞台中间拍一张立方体贴图（天色变化较大时重拍）。
        const pmrem=new THREE.PMREMGenerator(renderer),cubeTarget=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType}),cubeCamera=new THREE.CubeCamera(.1,60,cubeTarget);cubeCamera.position.set(11,2.8,10);
        let envTexture:THREE.Texture|null=null,envProgress=-1;
        const captureEnvironment=()=>{const hidden=[stageProps.root,propBatches.root,particles.points,shafts.mesh,dust.points,...[...players.values()].map(p=>p.root)].filter(o=>o.visible);hidden.forEach(o=>o.visible=false);cubeCamera.update(renderer,scene);hidden.forEach(o=>o.visible=true);envTexture?.dispose();envTexture=pmrem.fromCubemap(cubeTarget.texture).texture;stageProps.setEnvironment(envTexture,.12);players.forEach(p=>{p.material.envMap=envTexture;p.material.envMapIntensity=.12;p.material.needsUpdate=true;});};
        // 光柱、浮尘和云（第 11.4 节）：高档算体积光，中档用假光柱面片；浮尘高、中档都有。
        const rig:LightRig={sun:env.sun,sunDirection:env.direction,spots:[]};
        const shafts=createFakeShafts(room.windows),dust=createDust(rig),clouds=createClouds(assets.textures.get('environment/clouds.png')!);scene.add(shafts.mesh,dust.points,clouds.mesh);
        const post=createPost(renderer,scene,cam.camera,qualityRef.current,rig);
        const draws=new Map<string,number>();let firstDraw=-1;
        if(import.meta.env.DEV)scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;let before=0;const prior=o.onBeforeRender;o.onBeforeRender=function(...args){prior.apply(this,args);before=renderer.info.render.calls;if(firstDraw<0)firstDraw=before;};o.onAfterRender=(_r,_s,_c,_g,mat)=>{let owner:THREE.Object3D|null=o;while(owner?.parent&&owner.parent!==scene)owner=owner.parent;const key=(owner?.name||'world')+':'+mat.type;draws.set(key,(draws.get(key)??0)+renderer.info.render.calls-before);};});
        if(import.meta.env.DEV)(window as unknown as {__mcStage:unknown}).__mcStage={scene,renderer,post,env,camera:cam.camera,stageCamera:cam,players,props:stageProps,room,assets,get freeView(){return freeView;}};
        let appliedQuality:Quality|null=null;
        const applyQuality=(q:Quality)=>{if(q===appliedQuality)return;shafts.mesh.visible=q==='medium';dust.points.visible=q!=='low';const shadowsChanged=(appliedQuality==='low')!==(q==='low');appliedQuality=q;post.setQuality(q);renderer.setPixelRatio(q==='high'?Math.min(devicePixelRatio,2):1);renderer.transmissionResolutionScale=.5;stageProps.setReflections(q!=='low');stageProps.setEnvironment(q==='low'?null:envTexture,q==='low'?0:.12);players.forEach(p=>{p.material.envMap=q==='low'?null:envTexture;p.material.needsUpdate=true;});env.setShadow(q==='high'?4096:2048);if(shadowsChanged)scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true;});resize();};
        const galleryBuilder=new Builder();const unique=[...new Map(room.blocks.map(b=>[b.id,b])).values()];unique.forEach((b,i)=>galleryBuilder.put(2+i%9*2,2,3+Math.floor(i/9)*3,b.id,b.props));const gallery=buildBlockMesh(galleryBuilder.connect(),assets,light,shading);gallery.visible=false;scene.add(gallery);
        const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);post.setSize(w,h);cam.camera.aspect=w/h;cam.camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);
        applyQuality(qualityRef.current);
        const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
        const hit=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,cam.camera);let best:string|null=null,bestDistance=Infinity;for(const [id,p] of players){if(!p.root.visible)continue;const box=new THREE.Box3().setFromObject(p.root);const point=ray.ray.intersectBox(box,new THREE.Vector3());if(point){const d=point.distanceTo(ray.ray.origin);if(d<bestDistance){bestDistance=d;best=id;}}}return best;};
        const move=(e:PointerEvent)=>{if(viewRef.current==='free')return;const id=hit(e);if(id){const r=renderer.domElement.getBoundingClientRect();setHover({id,x:Math.min(host.clientWidth-300,e.clientX-r.left+12),y:Math.max(80,Math.min(host.clientHeight-230,e.clientY-r.top+12))});}else setHover(null);};
        const click=(e:MouseEvent)=>{if(viewRef.current==='free')return;if(!cam.didDrag()){const id=hit(e as PointerEvent);if(id)latest.current.onFocus(latest.current.focus===id?null:id);else setHover(null);}};
        const leave=()=>{setHover(null);};renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('click',click);renderer.domElement.addEventListener('pointerleave',leave);
        const visibility=()=>{last=performance.now();};document.addEventListener('visibilitychange',visibility);
        let last=performance.now(),clock=stateRef.current.now,lastHud=0,hudSignature='',frames=0,measureAt=last,fps=60,calls=0,tuneFrom=0,tuneFrames=0,warmUntil=Infinity;const loadedMs=last-started;
        const proNames=latest.current.participants.filter(p=>p.side==='pro').map(p=>p.persona.name),conNames=latest.current.participants.filter(p=>p.side==='con').map(p=>p.persona.name);
        const center=new THREE.Vector3(),tagOffsets=new Map<string,[number,number]>();
        const frame=(time:number)=>{
          if(disposed)return;const dt=Math.min(.05,Math.max(0,(time-last)/1000));last=time;
          const prior=stateRef.current;if(prior.session!=='paused'&&prior.session!=='stopped'&&!prior.globalError&&!document.hidden)clock+=dt*1000;
          const batch=inputs.current.splice(0);const {state:s,outputs}=step(prior,clock,batch,room);stateRef.current=s;if(import.meta.env.DEV&&new URLSearchParams(location.search).has('mcTrace')&&(batch.length||outputs.actions.length||outputs.signals.length))console.info('[mc-stage] '+JSON.stringify({at:time,clock:s.now,events:batch.map(e=>({type:e.type,id:'id' in e?e.id:'agentId' in e?e.agentId:'message' in e?e.message.id:undefined})),actions:outputs.actions,signals:outputs.signals,bubbles:s.bubbles.map(b=>({id:b.id,speaker:b.speakerId})),resultStage:s.resultStage}));
          sounds.configure(latest.current.muted||latest.current.visible===false||document.hidden,s.session==='paused'||s.session==='stopped'||!!s.globalError,s.session);outputs.sounds.forEach(x=>sounds.play(x.event));outputs.signals.forEach(x=>latest.current.onStageDone(x.gate,x.key));
          sounds.animals(s.now,!Object.values(s.actors).some(a=>a.desired==='speaking')&&(s.session==='waiting'||s.session==='finished'));
          const frozen=s.session==='paused'||s.session==='stopped'||!!s.globalError;
          // 天色跟辩论进度：开场前是下午两点，最后一轮接近傍晚，出结果时太阳贴着地平线。
          const total=Math.max(1,latest.current.totalRounds),progress=s.resultStage>=0?1:Math.min(1,Math.max(0,(s.round-1)/total+(s.round?.5/total:0)));
          if(!frozen&&env.update(progress,dt))updateLightTable(assets!.lightTexture,env.daylight);
          // 灯具亮度稳定，傍晚也使用正常曝光；不把辅助天光的降低补偿成整屋发白。
          renderer.toneMappingExposure=.96;
          if(!frozen){clouds.update(dt,env.sun.color,env.daylight);dust.update(s.now/1000,host.clientHeight);}shafts.update(rig);
          if(qualityRef.current!=='low'&&(envProgress<0||Math.abs(progress-envProgress)>.12)){envProgress=progress;captureEnvironment();}
          if(!frozen){staticMesh.traverse(o=>o.userData.animate?.(s.now));entities.update(s);critters.setMusicPlaying(sounds.musicActive);for(const c of critters.critters)c.update(s,dt);}
          const sit:Record<number,number>={};for(const a of Object.values(s.actors)){const index=room.anchors.indexOf(a.anchor);if(index>=0)sit[index]=a.sit;}
          const propState:PropState={now:s.now,mics:s.mics,stages:s.stages,stage:s.stage,bellAt:s.bellAt,pageAt:s.pageAt,buttonAt:s.buttonAt,sit,theme:s.boardTheme,label:s.boardLabel,round:s.boardRound,total,proNames,conNames,finished:s.boardResult,reduced:s.reduced};
          stageProps.update(propState);
          players.forEach((p,id)=>{const a=s.actors[id];if(a){p.update(a,s,room,light);p.root.visible=viewRef.current!==id&&!galleryRef.current;}});
          propBatches.update();
          outputs.particles.forEach(p=>{const player=players.get(p.actor);if(player)particles.spawn(player.eye,p.kind,s.now);});
          if(!frozen&&sounds.musicActive&&s.now>=nextMusicNote){const juke=room.bounds.max[0]-2.5;particles.spawn(new THREE.Vector3(juke,2.08,2.8),'note',s.now);nextMusicNote=s.now+2400;}
          particles.update(s.now);
          if(cam.view!==viewRef.current){const priorView=cam.view;cam.select(viewRef.current);
            if(viewRef.current==='free')spectator.enter(cam.camera,false);else spectator.exit();
            if(freeView){if(viewRef.current==='walk'){freeView.enter();renderer.domElement.focus({preventScroll:true});freeView.setActive(true);}else if(priorView==='walk')freeView.exit();}}
          if(import.meta.env.DEV){const inspect=latest.current.inspect;cam.override=inspect?inspectionCamera(inspect,room,latest.current.participants.find(p=>p.agentId===latest.current.inspectActor)?.seatIndex??0):null;}
          if(!frozen)freeView?.update(dt);
          if(latest.current.visible===false||document.hidden)spectator.deactivate();
          if(freeView&&viewRef.current!=='walk')freeView.root.visible=viewRef.current!=='judge';
          if(viewRef.current==='free')spectator.update(dt,cam.camera);
          else if(freeView&&viewRef.current==='walk')freeView.camera(cam.camera);
          else cam.update(players,dt);
          // 景深：全景里焦点跟着正在说话的人，人物视角和评委席不加。
          const speaker=Object.values(s.actors).find(a=>a.desired==='speaking'&&!a.error);if(viewRef.current==='overview'&&speaker&&players.get(speaker.id)){players.get(speaker.id)!.root.getWorldPosition(center);post.setFocus(cam.camera.position.distanceTo(center));}else post.setFocus(null);
          const project=(id:string)=>{const p=players.get(id);if(!p)return null;const v=p.eye.clone().add(new THREE.Vector3(0,.45,0)).project(cam.camera);return {x:(v.x*.5+.5)*host.clientWidth,y:(-v.y*.5+.5)*host.clientHeight,depth:v.z,visible:v.z<1&&v.z>-1&&v.x>-1.1&&v.x<1.1&&v.y>-1.1&&v.y<1.1};};
          // 名字牌：先量尺寸再摆。离镜头近的先摆在头顶；挤在一起或压到辩题屏上的，先往本队外侧挪，挪不开再往上叠。
          // 上一帧的位置还能用就接着用，免得名字牌来回跳。
          const tags:Array<{id:string;el:HTMLElement;x:number;y:number;w:number;h:number;depth:number;out:number}>=[];
          if(freeView){const el=anchors.current.get('walk:name');if(el){const head=freeView.head.clone().add(new THREE.Vector3(0,.45,0)).project(cam.camera);const visible=viewRef.current==='walk'&&freeView.mode!==2&&head.z<1&&head.z>-1&&Number.isFinite(head.x)&&Number.isFinite(head.y);el.style.visibility=visible?'visible':'hidden';if(visible){el.style.left=(head.x*.5+.5)*host.clientWidth+'px';el.style.top=(-head.y*.5+.5)*host.clientHeight+'px';}}}
          for(const [id] of players){const pos=project(id),name=anchors.current.get(id+':name'),bubble=anchors.current.get(id+':bubble');if(name&&pos){name.style.visibility=pos.visible?'visible':'hidden';if(pos.visible&&name.offsetParent){if(viewRef.current!=='overview'){name.style.left=pos.x+'px';name.style.top=pos.y+'px';}else{const side=s.actors[id]?.side;tags.push({id,el:name,x:pos.x,y:pos.y,w:name.offsetWidth,h:name.offsetHeight,depth:pos.depth,out:side==='pro'?-1:side==='con'?1:0});}}}if(bubble&&pos){const w=bubble.offsetWidth,h=bubble.offsetHeight;const x=Math.min(host.clientWidth-w/2-12,Math.max(w/2+12,pos.x));const y=Math.max(h+66,pos.y-28);bubble.style.left=x+'px';bubble.style.top=y+'px';}}
          const keepOut:Array<[number,number,number,number]>=[];if(viewRef.current==='overview'){const sc=room.layout.board,corners=[-1,1].flatMap(i=>[-1,1].map(j=>new THREE.Vector3(sc.position[0]+i*sc.width/2,sc.position[1]+j*sc.height/2,sc.position[2]).project(cam.camera)));keepOut.push([Math.min(...corners.map(v=>(v.x*.5+.5)*host.clientWidth))-4,Math.min(...corners.map(v=>(-v.y*.5+.5)*host.clientHeight))-4,Math.max(...corners.map(v=>(v.x*.5+.5)*host.clientWidth))+4,Math.max(...corners.map(v=>(-v.y*.5+.5)*host.clientHeight))+4]);}
          // 所有人的脸也不能被名字牌盖住（游戏人物的头宽约 0.5 米）。
          const heads:Array<[number,number,number,number]>=[];for(const [id,p] of players){if(!p.root.visible||id===viewRef.current)continue;const c=p.eye.clone().add(new THREE.Vector3(0,.05,0)).project(cam.camera);if(c.z>1||c.z<-1)continue;const r=.26/(p.eye.distanceTo(cam.camera.position)*Math.tan(THREE.MathUtils.degToRad(cam.camera.fov/2)))*host.clientHeight/2;const x=(c.x*.5+.5)*host.clientWidth,y=(-c.y*.5+.5)*host.clientHeight;heads.push([x-r,y-r,x+r,y+r]);}
          tags.sort((a,b)=>a.depth-b.depth);const placed:Array<[number,number,number,number]>=[];
          const overlaps=(r:[number,number,number,number],list:Array<[number,number,number,number]>)=>list.some(o=>r[0]<o[2]&&r[2]>o[0]&&r[1]<o[3]&&r[3]>o[1]);
          for(const t of tags){
            const rect=(dx:number,dy:number):[number,number,number,number]=>{const x=Math.min(host.clientWidth-t.w/2-4,Math.max(t.w/2+4,t.x+dx));return [x-t.w/2,t.y+dy-t.h,x+t.w/2,t.y+dy];};
            const ok=(dx:number,dy:number)=>{const r=rect(dx,dy);return !overlaps(r,placed)&&!overlaps(r,keepOut)&&!overlaps(r,heads);};
            let best=ok(0,0)?[0,0] as [number,number]:tagOffsets.get(t.id)??[0,0];
            // 主持人站在辩题屏正前方，名字牌压到屏上时可以挪到头的旁边（往下半个到一个名字牌的高度）。
            if(!ok(...best)){best=[0,0];let cost=Infinity;for(const dy of t.out?[0,-1,-2,-3].map(j=>j*(t.h+2)):[0,-(t.h+2),t.h*.6,t.h*1.2])for(let i=0;i<14;i++){const dx=(t.out||1)*i*12,c=Math.abs(dx)+2.5*Math.abs(dy);if(c<cost&&ok(dx,dy)){cost=c;best=[dx,dy];}if(!t.out&&i&&c<cost&&ok(-dx,dy)){cost=c;best=[-dx,dy];}}}
            tagOffsets.set(t.id,best);const r=rect(...best);placed.push(r);t.el.style.left=(r[0]+r[2])/2+'px';t.el.style.top=r[3]+'px';
          }
          const visibleBubbles=[...anchors.current.entries()].filter(([k,el])=>k.endsWith(':bubble')&&el.isConnected).map(([,el])=>el);if(visibleBubbles.length===2){const [a,b]=visibleBubbles,r1=a.getBoundingClientRect(),r2=b.getBoundingClientRect();if(r1.left<r2.right&&r1.right>r2.left&&r1.top<r2.bottom&&r1.bottom>r2.top){a.style.left=Math.max(a.offsetWidth/2+8,host.clientWidth*.26)+'px';b.style.left=Math.min(host.clientWidth-b.offsetWidth/2-8,host.clientWidth*.74)+'px';}}
          gallery.visible=!!galleryRef.current;staticMesh.visible=entities.root.visible=stageProps.root.visible=propBatches.root.visible=!galleryRef.current;ceiling.visible=!galleryRef.current;
          post.outline.selectedObjects=s.focus&&players.has(s.focus)?[players.get(s.focus)!.root]:[];post.outline.visibleEdgeColor.set(teamColor(s.actors[s.focus??'']?.side??'host'));post.outline.hiddenEdgeColor.copy(post.outline.visibleEdgeColor);
          if(qualityRef.current!==appliedQuality)applyQuality(qualityRef.current);
          // 太阳阴影隔一帧重画一次：人动得慢，看不出差别，能省下一大块填充。
          env.sun.shadow.autoUpdate=false;if(frames%2===0)env.sun.shadow.needsUpdate=true;
          renderer.shadowMap.needsUpdate=true;renderer.info.reset();draws.clear();firstDraw=-1;if(latest.current.visible!==false)post.render();calls=renderer.info.render.calls;frames++;if(time-measureAt>=1000){fps=frames*1000/(time-measureAt);frames=0;measureAt=time;}
          // 自动选画质：加载后测 3 秒，高档低于 45 帧就降一档（用户自己选过就不动）。
          if(import.meta.env.DEV)renderer.domElement.dataset.freeCamera=JSON.stringify({view:viewRef.current,entered:spectator.entered,active:spectator.active,locked:spectator.locked,speed:spectator.speed,position:cam.camera.position.toArray(),quaternion:cam.camera.quaternion.toArray(),sceneTime:s.now});
          if(!manualQuality.current&&!document.hidden&&latest.current.visible!==false&&time>warmUntil){if(!tuneFrom){tuneFrom=time;tuneFrames=0;}tuneFrames++;if(time-tuneFrom>3000){const measured=tuneFrames*1000/(time-tuneFrom);tuneFrom=0;if(measured<45&&qualityRef.current!=='low'){const next=qualityRef.current==='high'?'medium':'low';qualityRef.current=next;setQualityState(next);warmUntil=time+2500;}else manualQuality.current=true;}}
          renderer.domElement.dataset.audioPlaying=String(sounds.playing);renderer.domElement.dataset.audioMuted=String(latest.current.muted);renderer.domElement.dataset.fps=fps.toFixed(1);renderer.domElement.dataset.calls=String(calls);renderer.domElement.dataset.loadedMs=loadedMs.toFixed(0);renderer.domElement.dataset.clock=s.now.toFixed(0);renderer.domElement.dataset.quality=qualityRef.current;
          if(import.meta.env.DEV){renderer.domElement.dataset.hidden=String(document.hidden);renderer.domElement.dataset.draws=JSON.stringify({shadow:firstDraw,objects:[...draws]});renderer.domElement.dataset.stageState=JSON.stringify({session:s.session,round:s.round,stage:s.stage,mics:s.mics,result:s.boardResult,actors:Object.values(s.actors).map(a=>({id:a.id,sit:a.sit,position:a.position,action:a.active?.action.kind,gap:players.get(a.id)?.contactGap,pose:players.get(a.id)?.mesh.skeleton.bones.map(b=>b.rotation.toArray().slice(0,3)),error:!!a.error})),lights:lanternLights.map(l=>({id:l.name,position:l.position.toArray(),intensity:l.intensity,color:l.color.getHexString(),distance:l.distance})),lighting:{sun:env.sun.intensity,ambient:env.hemi.intensity,daylight:env.daylight,exposure:renderer.toneMappingExposure}});}
          const hsig=JSON.stringify([s.session,s.bubbles,s.chat,s.title,s.toast,s.focus,s.globalError,Object.values(s.actors).map(a=>[a.id,a.error,a.mind,a.actionText])]);if(time-lastHud>100||hsig!==hudSignature){lastHud=time;hudSignature=hsig;setHud(s);}
          latest.current.onSnapshot?.(s,outputs,{fps,calls,loadedMs,quality:qualityRef.current});raf=requestAnimationFrame(frame);
        };
        cleanup=()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('click',click);renderer.domElement.removeEventListener('pointerleave',leave);cam.dispose();sounds.dispose();players.forEach(p=>p.dispose());particles.dispose();propBatches.dispose();propIndirect.dispose();stageProps.dispose();entities.dispose();critters.dispose();freeView?.dispose();document.removeEventListener('pointerdown',outsideDown);disposeObject(staticMesh);disposeObject(ceiling);disposeObject(gallery);lanternLights.forEach(l=>l.dispose());shafts.dispose();dust.dispose();clouds.dispose();env.dispose();envTexture?.dispose();cubeTarget.dispose();pmrem.dispose();post.dispose();renderer.dispose();renderer.domElement.remove();assets?.dispose();};
        // 开场前先把着色器编译完（Windows 上走 D3D 编译很慢），免得第一帧卡好几秒。
        const disposeStage=cleanup;cleanup=()=>{spectator.dispose();spectatorRef.current=null;cameraRef.current=null;disposeStage();};
        setProgress({n:.85,step:'准备画面'});captureEnvironment();envProgress=0;await renderer.compileAsync(scene,cam.camera);if(disposed)return;
        setProgress({n:1,step:'准备人物'});setLoaded(true);latest.current.onLoaded();warmUntil=performance.now()+2500;raf=requestAnimationFrame(frame);
      }catch(e){if(import.meta.env.DEV)console.error('[mc-stage] 加载失败',e instanceof Error?e.stack:e);if(!disposed)latest.current.onLoaded(e instanceof Error?e.message:String(e));assets?.dispose();renderer.dispose();}
    })();return ()=>{disposed=true;cleanup();};
  },[]);
  return <div ref={hostRef} className="mc-stage" style={{display:props.visible===false?'none':undefined}}><Hud s={hud} cast={props.participants} view={view} setView={selectView} reset={()=>{selectView('overview');cameraRef.current?.reset();}} anchor={(id,kind,el)=>{const key=id+':'+kind;if(el)anchors.current.set(key,el);else anchors.current.delete(key);}} hover={hover} credit={credit} quality={quality} setQuality={chooseQuality} freeControl={freeControl}/>{!loaded&&<div className="mc-loading"><strong>正在加载世界…</strong><div className="mc-progress"><i style={{width:progress.n*100+'%'}}/></div><span>{progress.step}</span>{credit&&<small>{credit}</small>}</div>}</div>;
}
