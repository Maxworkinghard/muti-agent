import * as THREE from 'three';
import {createSkin,type Skin,type FaceExtra} from './skin';
import {buildAvatar,lookFor,T,RIG,HEAD} from './avatar';
import type {Participant,PersonaVisual} from '../types';
import type {Avatar} from './avatar/build';
import type {Look} from './avatar/types';
import {lookAt,type Actor,type DirectorState} from './director';
import type {Room} from './rooms/types';
import type {LightGrid} from './light';
import type {PropContacts} from './props/types';
import {idleMotion} from './idleMotion';
/** labelAbove：名字牌在眼睛上方多高（米），按这个人的头大小和帽子算 */
export interface Player {readonly contactGap?:number;labelAbove:number;root:THREE.Group;mesh:THREE.SkinnedMesh;head:THREE.Bone;skin:Skin;eye:THREE.Vector3;forward:THREE.Vector3;material:THREE.MeshStandardMaterial;update(a:Actor,s:DirectorState,room:Room,light:LightGrid):void;dispose():void}
/** 游戏标准的盒子展开：顶、底、右、前、左、后，坐标按 64×64 的皮肤算，换成 4 倍皮肤也一样。（自由视角的“你”也用它） */
export function cuboid(w:number,h:number,d:number,u:number,v:number,center:number[],bone?:number,inflate=0){
  const g=new THREE.BoxGeometry((w+inflate*2)/16,(h+inflate*2)/16,(d+inflate*2)/16);g.translate(...center.map(n=>n/16) as [number,number,number]);
  const uv=g.getAttribute('uv');const boxes=[[u+d+w,v+d,d,h],[u,v+d,d,h],[u+d,v,w,d],[u+d+w,v,w,d],[u+d,v+d,w,h],[u+2*d+w,v+d,w,h]];
  for(let f=0;f<6;f++){const [x,y,ww,hh]=boxes[f];for(let j=0;j<4;j++){const i=f*4+j;uv.setXY(i,(x+uv.getX(i)*ww)/64,1-(y+(1-uv.getY(i))*hh)/64);}}
  if(bone!==undefined){const indices:number[]=[],weights:number[]=[];for(let i=0;i<g.getAttribute('position').count;i++){indices.push(bone,0,0,0);weights.push(1,0,0,0);}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));}
  return g;
}
const approach=(from:number,to:number,rate:number)=>from+(to-from)*Math.min(1,rate);
/** knees / ankles：小腿挂在膝盖上、鞋挂在脚踝上；pack：双肩包（站着在背上，坐下挂到椅背后面） */
export interface Rig {root:THREE.Group;mesh:THREE.SkinnedMesh;bones:THREE.Bone[];knees:THREE.Group[];ankles:THREE.Group[];pack:THREE.Mesh|null;material:THREE.MeshStandardMaterial;skin:Skin;look:Look;avatar:Avatar}
/** 按人物 id 取造型并拼出骨架（游戏和 avatar-lab 共用）。 */
export function createRig(id:string,name:string,visual:PersonaVisual,side='host'):Rig{
  const look=lookFor(id,name,visual),avatar=buildAvatar(look,side);
  const skin=createSkin(avatar,look),root=new THREE.Group();root.name=id;
  // 骨头的位置按这个人的体型（avatar/body.ts）：髋高、躯干高、肩宽、腿距都不一样
  const B=avatar.body,parents=[-1,0,1,2,2,2,1,1],positions=[[0,0,0],[0,B.hipY,0],[0,0,0],[0,B.torso.h,0],[-B.arm.x,B.torso.h-B.arm.drop,0],[B.arm.x,B.torso.h-B.arm.drop,0],[-B.leg.x,0,0],[B.leg.x,0,0]];
  const bones=positions.map(()=>new THREE.Bone());bones.forEach((b,i)=>{b.position.set(...positions[i].map(n=>n*T) as [number,number,number]);if(parents[i]>=0)bones[parents[i]].add(b);});
  const material=new THREE.MeshStandardMaterial({map:skin.texture,alphaTest:.1,roughness:.88,metalness:0,side:THREE.FrontSide});
  const mesh=new THREE.SkinnedMesh(avatar.geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.add(bones[0]);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;root.add(mesh);
  // 绑定之后再缩放头骨：头、头发、帽子、眼镜一起按头型缩放（长脸更高更窄、方脸更宽），身体不动
  bones[3].scale.set(...B.head.scale);
  // 大腿骨按 YXZ 转：先外撇、再俯仰、最后整条腿偏转（侧坐）
  for(const i of [6,7])bones[i].rotation.order='YXZ';
  const ankles:THREE.Group[]=[];
  const knees=avatar.shins.map((g,i)=>{const knee=new THREE.Group();knee.position.set(0,-B.leg.thigh*T,0);const shin=new THREE.Mesh(g,material);shin.castShadow=true;shin.receiveShadow=true;knee.add(shin);
    const ankle=new THREE.Group();ankle.position.set(0,-(B.leg.shin-(look.shoes.kind==='boots'?9:B.leg.shoe))*T,0);const shoe=new THREE.Mesh(avatar.shoes[i],material);shoe.castShadow=true;shoe.receiveShadow=true;ankle.add(shoe);knee.add(ankle);ankles.push(ankle);
    bones[6+i].add(knee);return knee;});
  let pack:THREE.Mesh|null=null;
  if(avatar.pack){pack=new THREE.Mesh(avatar.pack,material);pack.castShadow=true;pack.receiveShadow=true;root.add(pack);placePack({root,pack,avatar} as Rig,0);}
  return {root,mesh,bones,knees,ankles,pack,material,skin,look,avatar};
}
/** 双肩包：站着贴在背上；坐下慢慢挪到椅背后面挂着（根点坐标，坐下时人往前挪了 zOff，椅子没动） */
export function placePack(r:Pick<Rig,'pack'|'avatar'>,sit:number){if(!r.pack)return;const B=r.avatar.body,z0=-(B.torso.d/2+.5)*T,y0=(B.hipY+2)*T,z1=-.3-r.avatar.sit.zOff*T,y1=B.sitDrop+.06;
  r.pack.position.set(0,y0+(y1-y0)*sit,z0+(z1-z0)*sit);r.pack.rotation.set(-.08*sit,Math.PI,0);}
/**
 * 坐姿的腿（角度由 body.ts 按体型和坐姿解好）：大腿下沿贴座面，小腿竖直或往前斜，脚踝把鞋摆平，鞋底平踩在地上；
 * 侧坐整条腿往一边偏。站着走路时只摆大腿、弯一点膝盖。
 */
export function legPose(r:Pick<Rig,'bones'|'knees'|'ankles'|'avatar'>,sit:number,walk=0){
  const p=r.avatar.sit,b=r.bones;
  b[6].rotation.set(p.thigh*sit-walk,p.yaw*sit,-p.splay*sit);b[7].rotation.set(p.thigh*sit+walk,p.yaw*sit,p.splay*sit);
  for(const knee of r.knees)knee.rotation.x=p.knee*sit+(sit<.5?Math.abs(walk)*.6:0);
  for(const ankle of r.ankles)ankle.rotation.x=p.ankle*sit;
}
/**
 * 骨骼（Q 版，尺寸见 avatar/rig.ts）：0 脚底、1 髋、2 上半身（以髋为轴，能前倾后靠）、3 头、4 右臂、5 左臂、6 右腿、7 左腿。
 * 躯干、胳膊、大腿、头、头发和配件是一个蒙皮网格；小腿 + 鞋挂在膝盖上（腿骨下 11 T），坐下时代码把它折回竖直。
 * 造型按人物 id 从 avatar/looks.ts 取（不再按 id 哈希挑衣服）。
 */
export function createPlayer(p:Participant,card:THREE.Object3D|null,contacts?:PropContacts):Player {
  const rig=createRig(p.persona.id??p.agentId,p.persona.name,p.persona.visual,p.side??'host'),{root,mesh,bones,material,skin,look,avatar}=rig,B=avatar.body;root.name=p.agentId;
  // 名字牌要盖过头顶、头发和帽子（帽子、高发髻多留一点）
  const labelAbove=B.labelAbove+(avatar.resolved.hat||['topknot','odango','flame','spiky','quiff'].includes(look.hair.style)?.18:0);
  // 提词卡和笔拿在右手里（主持用讲台上的讲稿，手里不拿）。
  let pen:THREE.Object3D|null=null;
  if(card&&p.side!=='host'){const hand=new THREE.Group();hand.position.set(-.5*T,B.handReach+1*T,-1.5*T);hand.rotation.set(-1.25,.15,0);hand.scale.setScalar(.85);hand.add(card);bones[4].add(hand);pen=card.userData.pen??null;if(pen){pen.removeFromParent();pen.position.set(0,B.handReach,.08);pen.rotation.set(-.8,0,.25);pen.scale.setScalar(.85);bones[5].add(pen);}}
  const eye=new THREE.Vector3(),forward=new THREE.Vector3(),pose={lean:0,crossed:0,gesture:0,gx:0,gz:0,nod:0,writing:0};
  const headWorld=new THREE.Vector3(),headQuat=new THREE.Quaternion(),contactPoint=new THREE.Vector3(),reachPoint=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),reachQuat=new THREE.Quaternion(),inverse=new THREE.Matrix4();let lastPoseAt=-1,contactGap:number|undefined;
  return {root,mesh,head:bones[3],skin,eye,forward,material,labelAbove,get contactGap(){return contactGap;},update(a,s,room,grid){
    const poseNow=a.error?a.errorAt:s.now,dt=lastPoseAt<0?1/60:Math.min(.1,Math.max(0,(poseNow-lastPoseAt)/1000));lastPoseAt=poseNow;
    material.opacity=a.error?.45:1;material.transparent=!!a.error;material.depthWrite=!a.error;
    if(dt===0)return;
    const action=a.active?.action,t=a.active?.duration?Math.min(1,(poseNow-a.active.start)/a.active.duration):0;
    const control=!!action&&['mic','nextRound','tapBell','flipScript'].includes(action.kind);
    const crouch=action?.kind==='crouch'?Math.abs(Math.sin(Math.PI*t*action.times)):0;
    // 坐下：根点下沉到大腿贴座面，再顺着朝向往前 / 往后挪一点，让背正好靠上椅背（按体型算好的 zOff）
    const zOff=a.sit*avatar.sit.zOff*T;
    root.position.set(a.position[0]+Math.sin(a.yaw)*zOff,a.position[1]-a.sit*B.sitDrop-crouch*.14,a.position[2]+Math.cos(a.yaw)*zOff);root.rotation.y=a.yaw;placePack(rig,a.sit);
    if(control&&p.side!=='host'){const shift=.12*Math.sin(Math.min(1,t/.45)*Math.PI/2);root.position.x+=Math.sin(a.anchor.homeYaw)*shift;root.position.z+=Math.cos(a.anchor.homeYaw)*shift;}
    const mood=(key:string)=>a.mind?.mood.find(m=>m.key===key)?.value??0;
    const speaking=a.desired==='speaking'&&!a.cut&&!a.error,listening=!speaking&&a.desired!=='thinking';
    const seat=room.anchors.indexOf(a.anchor),idle=idleMotion(poseNow,seat);
    const natural=!s.reduced&&!a.error&&listening&&!a.queue.length&&(!action||action.kind==='wait');
    const k=natural?idle.amount:0;root.userData.idle=k>.12?idle.kind:null;
    const temperament=p.persona.personalities.find(x=>x.id===p.personalityId)?.label??'';
    const quiet=/冷静|学究|较真/.test(temperament),lively=/热血|轻快|直率/.test(temperament);
    const gestureSize=(lively?1.12:quiet?.8:1)*look.tendency.gesture;
    // 空闲和倾听的“活气”（第 12.6 节）：每个人用自己的 id 做相位，呼吸、换坐姿、侧头看队友、
    // 队友发言时侧身带笑、被质询愣一下——同一时刻没人动作相同，也没有人长时间完全不动。
    const phase=(poseNow/1000+a.id.length*.7)%9,seed2=(poseNow/1000+a.id.length*.31)%17;
    const idleBreath=s.reduced||a.error?0:(a.sit>.5?.6+.4*Math.sin(poseNow/1000*(.8+(a.id.length%3)*.12)):0)*.012;
    const idleShift=!s.reduced&&listening&&a.sit>.5&&seed2<1.4?Math.sin(Math.min(1,(1.4-seed2)/.5)*Math.PI)*.05:0;
    const idleHead=!s.reduced&&listening&&phase>6.2&&phase<7.4?Math.sin((phase-6.2)/1.2*Math.PI)*.14:0;
    // 情绪的身体语言：压力大前倾，信心足后靠，憋屈低头塌肩，火气大抱臂（第 11.5 节）。
    const leanTarget=s.reduced?0:control?(p.side==='host'?.08:.35):(mood('压力')>=6?.17:0)+(mood('憋屈')>=6?.12:0)-(mood('信心')>=7?.08:0)+crouch*.5+(a.desired==='thinking'?.12:0)+idleShift*.3+(idle.kind==='leanBack'?-.1*k:idle.kind==='write'||idle.kind==='pointNote'?.07*k:0)+(s.reduced?0:look.tendency.lean*(a.sit>.5?1:.5));
    pose.lean=approach(pose.lean,leanTarget,dt*(control?12:4));pose.crossed=approach(pose.crossed,listening&&!action&&mood('火气')>=6&&!s.reduced?1:0,dt*3);
    bones[2].rotation.x=pose.lean+idleBreath;
    const target=lookAt(a,s,room),yaw=Math.atan2(target[0]-a.position[0],target[2]-a.position[2]);
    let headYaw=Math.max(-1.15,Math.min(1.15,Math.atan2(Math.sin(yaw-a.yaw),Math.cos(yaw-a.yaw))));
    const eyeHeight=a.position[1]-a.sit*B.sitDrop+B.eyeStand;
    let headPitch=a.desired==='thinking'?.42:Math.max(-.4,Math.min(.4,Math.atan2(eyeHeight-target[1],Math.hypot(target[0]-a.position[0],target[2]-a.position[2]))));
    if(!s.reduced&&listening){const cycle=(poseNow+a.id.length*977)%5200;pose.nod=cycle<520?Math.sin(cycle/520*Math.PI)*(mood('信心')>=5?.16:.09):0;}else pose.nod=0;
    headPitch+=pose.nod-pose.lean*.6+(mood('憋屈')>=6&&!s.reduced?.18:0)-(mood('信心')>=7&&!s.reduced?.06:0);
    if(action?.kind==='swing')headPitch+=Math.sin(t*Math.PI)*.25;
    if(natural){if(idle.kind==='nod')headPitch+=Math.sin(k*Math.PI*3)*.13;if(idle.kind==='shakeHead')headYaw+=Math.sin(k*Math.PI*3)*.14;if(idle.kind==='glanceMate')headYaw+=k*.22*(seat%2?1:-1);if(idle.kind==='write'||idle.kind==='page')headPitch+=k*.12;}
    headYaw+=idleHead;
    bones[3].rotation.x=approach(bones[3].rotation.x,headPitch,dt*9);bones[3].rotation.y=approach(bones[3].rotation.y,headYaw,dt*9);bones[3].rotation.z=approach(bones[3].rotation.z,s.reduced?0:look.tendency.tilt*(listening?1:.4),dt*3);
    const walk=s.reduced?0:action?.kind==='walkTo'?Math.sin(poseNow/125)*.5:action?.kind==='walk'?Math.sin(t*7)*.55:0;
    legPose(rig,a.sit,walk);
    let rx=-Math.PI/5*a.sit+walk,ry=0,rz=0,lx=-Math.PI/5*a.sit-walk,ly=0,lz=0;
    if(card&&p.side!=='host'){rx=Math.min(rx,-.62);}
    if(card&&a.desired==='thinking'&&p.side!=='host'){pose.writing=approach(pose.writing,1,dt*4);rx=-1.15;rz=-.2;lx=-1.23+(s.reduced?0:Math.sin(poseNow/260)*.045);ly=.5;lz=.5+(s.reduced?0:Math.sin(poseNow/170)*.04);}else pose.writing=approach(pose.writing,0,dt*4);
    if(action&&['mic','nextRound','tapBell','flipScript'].includes(action.kind)){rx=-1.15-Math.sin(t*Math.PI)*.45;rz=-.08;}
    else if(action?.kind==='cheer'){
      // 欢呼动作（第 12.6 节）：双臂高举，身子里外各跳一下。
      // Q 版大头：双臂往两侧张开举起（rz/lz ±0.75），手在头两侧，不插进头里
      const hop=Math.abs(Math.sin(t*Math.PI*2));rx=-Math.PI*.95;lx=-Math.PI*.95;rz=-.75;lz=.75;
      root.position.y+=hop*.14;headPitch-=.12;
    }
    else if(action?.kind==='clap'){
      // 鼓掌致意：双臂抬到胸前，手掌一开一合。
      const clapT=Math.sin(t*Math.PI*7);rx=-1.05+clapT*.1;lx=-1.05-clapT*.1;ry=.55;ly=-.55;rz=-.3;lz=.3;
    }
    else if(speaking&&!s.reduced){
      // 空着的左手打手势：交锋时指向被问的人，立论和总结时摊手、向前送、按胸口轮流，跟着句子的节奏换。
      const pointing=typeof a.look==='object'&&s.pair.includes(a.id);const phase=Math.floor((poseNow+a.id.length*331)/2600)%3,local=((poseNow+a.id.length*331)%2600)/2600,amp=Math.sin(Math.min(1,local*1.6)*Math.PI/2)*(local>.85?(1-local)/.15:1);
      if(pointing){lx=-1.35;ly=Math.max(-.6,Math.min(.6,-headYaw*.6));lz=.1;}
      else if(phase===0){lx=-1.0*amp-.15;lz=.28*amp;}else if(phase===1){lx=-1.3*amp-.1;ly=-.25*amp;}else{lx=-.95*amp-.1;lz=-.55*amp;ly=-.35*amp;}
      if(p.side!=='host')rx=-.85;
    }
    if(pose.crossed>.01){const c=pose.crossed;rx=rx*(1-c)-1.0*c;ry=ry*(1-c)+.75*c;rz=rz*(1-c)+.35*c;lx=lx*(1-c)-.95*c;ly=ly*(1-c)-.75*c;lz=lz*(1-c)-.35*c;}
    if(mood('压力')>=6&&a.sit>.5&&!speaking&&!s.reduced){lx=Math.min(lx,-.9);rx=Math.min(rx,-.9);}
    if(natural&&k>0){
      let irx=rx,iry=ry,irz=rz,ilx=lx,ily=ly,ilz=lz;
      switch(idle.kind){
        case 'write':irx=-1.12;irz=-.18;ilx=-1.22+Math.sin(poseNow/140)*.04;ily=.48;ilz=.4;break;
        case 'page':irx=-1.1;iry=.18;ilx=-1.25;ily=.28*Math.sin(poseNow/230);ilz=.35;break;
        case 'tapPen':irx=-1;ilx=-.95+Math.sin(poseNow/150)*.1;ily=.3;break;
        // 托腮：大头、短胳膊够不到下巴正前方，手放在脸颊外侧（离头侧面约 1 T）
        case 'chin':ilx=-2.4;ily=0;ilz=.6;break;
        case 'foldArms':irx=-1;iry=.75;irz=.35;ilx=-.95;ily=-.75;ilz=-.35;break;
        case 'stretch':irx=-2.45;ilx=-2.45;irz=-.8;ilz=.8;break;
        case 'shift':irz=-.16;ilz=.16;break;
        case 'scratchHead':ilx=-2.6;ilz=.8;ily=.2+Math.sin(poseNow/180)*.07;break;
        case 'pointNote':irx=-1.1;ilx=-1.3;ily=.45;ilz=.2;break;
      }
      const weight=Math.min(1,k*gestureSize);rx=THREE.MathUtils.lerp(rx,irx,weight);ry=THREE.MathUtils.lerp(ry,iry,weight);rz=THREE.MathUtils.lerp(rz,irz,weight);lx=THREE.MathUtils.lerp(lx,ilx,weight);ly=THREE.MathUtils.lerp(ly,ily,weight);lz=THREE.MathUtils.lerp(lz,ilz,weight);
    }
    for(const [bone,x,y,z] of [[bones[4],rx,ry,rz],[bones[5],lx,ly,lz]] as const){bone.rotation.x=approach(bone.rotation.x,x,dt*5);bone.rotation.y=approach(bone.rotation.y,y,dt*5);bone.rotation.z=approach(bone.rotation.z,z,dt*5);}
    contactGap=undefined;
    if(control&&contacts){const target=action?.kind==='mic'?contacts.mics.get(a.anchor.mic):action?.kind==='tapBell'?contacts.bell:action?.kind==='nextRound'?contacts.nextRound:contacts.script;
      if(target){const hand=action?.kind==='tapBell'||action?.kind==='nextRound'?bones[5]:bones[4];target.getWorldPosition(contactPoint);hand.parent!.updateWorldMatrix(true,false);inverse.copy(hand.parent!.matrixWorld).invert();reachPoint.copy(contactPoint).applyMatrix4(inverse).sub(hand.position).normalize();reachQuat.setFromUnitVectors(down,reachPoint);hand.quaternion.slerp(reachQuat,Math.min(1,dt*18));root.updateMatrixWorld(true);reachPoint.set(0,B.handReach,0).applyMatrix4(hand.matrixWorld);contactGap=reachPoint.distanceTo(contactPoint);}
    }
    if(pen)pen.visible=a.desired==='thinking'||natural&&['write','tapPen','pointNote'].includes(idle.kind)&&k>.1;
    if(!s.reduced){root.position.y+=Math.abs(walk)*.035;if(listening&&a.sit>.8)bones[2].rotation.z=Math.sin(poseNow/5400+p.agentId.length)*.015;else bones[2].rotation.z=approach(bones[2].rotation.z,0,dt*3);}
    // 神态（第 12.6 节）：被打断先惊讶；交锋提问的人挑眉逼视；队友发言时带一点笑。
    const faceExtra:FaceExtra[]=[];
    if(a.cut&&!s.reduced)faceExtra.push('shock');
    else if(speaking&&typeof a.look==='object'&&s.pair.includes(a.id)&&!s.reduced)faceExtra.push('raise');
    else if(!s.reduced&&listening&&typeof a.look==='object'&&a.look.agent){const mate=s.actors[a.look.agent];if(mate&&mate.side===a.side&&mate.desired==='speaking')faceExtra.push('happy');}
    if(!faceExtra.length&&a.desired==='thinking'&&!s.reduced)faceExtra.push('think');
    skin.face(a.mind,poseNow,speaking,s.reduced,faceExtra);
    root.updateMatrixWorld(true);bones[3].getWorldPosition(headWorld);bones[3].getWorldQuaternion(headQuat);
    eye.set(0,RIG.eyeY*B.head.scale[1]*T,(HEAD.hz+1)*B.head.scale[2]*T).applyQuaternion(headQuat).add(headWorld);forward.set(0,0,1).applyQuaternion(headQuat);
    // 环境反射按所在位置的游戏光照网格调亮暗：墙角暗，灯下亮。
    const level=Math.max(...grid.sample(a.position[0],a.position[1]+1-a.sit*B.sitDrop,a.position[2]))/15;material.envMapIntensity=.04+level*.08;
  },dispose(){const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());material.dispose();skin.texture.dispose();mesh.skeleton.dispose();}};
}
