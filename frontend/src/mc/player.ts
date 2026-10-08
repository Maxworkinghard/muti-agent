import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createSkin,type Skin} from './skin';
import type {Participant} from '../types';
import {lookAt,type Actor,type DirectorState} from './director';
import type {Room} from './rooms/debate';
import type {LightGrid} from './light';
import type {PropContacts} from './props/debateProps';
import {idleMotion} from './idleMotion';
export interface Player {readonly contactGap?:number;root:THREE.Group;mesh:THREE.SkinnedMesh;head:THREE.Bone;skin:Skin;eye:THREE.Vector3;forward:THREE.Vector3;material:THREE.MeshStandardMaterial;update(a:Actor,s:DirectorState,room:Room,light:LightGrid):void;dispose():void}
/** 游戏标准的盒子展开：顶、底、右、前、左、后，坐标按 64×64 的皮肤算，换成 4 倍皮肤也一样。（自由视角的“你”也用它） */
export function cuboid(w:number,h:number,d:number,u:number,v:number,center:number[],bone?:number,inflate=0){
  const g=new THREE.BoxGeometry((w+inflate*2)/16,(h+inflate*2)/16,(d+inflate*2)/16);g.translate(...center.map(n=>n/16) as [number,number,number]);
  const uv=g.getAttribute('uv');const boxes=[[u+d+w,v+d,d,h],[u,v+d,d,h],[u+d,v,w,d],[u+d+w,v,w,d],[u+d,v+d,w,h],[u+2*d+w,v+d,w,h]];
  for(let f=0;f<6;f++){const [x,y,ww,hh]=boxes[f];for(let j=0;j<4;j++){const i=f*4+j;uv.setXY(i,(x+uv.getX(i)*ww)/64,1-(y+(1-uv.getY(i))*hh)/64);}}
  if(bone!==undefined){const indices:number[]=[],weights:number[]=[];for(let i=0;i<g.getAttribute('position').count;i++){indices.push(bone,0,0,0);weights.push(1,0,0,0);}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));}
  return g;
}
const approach=(from:number,to:number,rate:number)=>from+(to-from)*Math.min(1,rate);
/** 骨骼：0 脚底、1 髋、2 上半身（以髋为轴，能前倾后靠）、3 头、4 右臂、5 左臂、6 右腿、7 左腿。 */
export function createPlayer(p:Participant,card:THREE.Object3D|null,contacts?:PropContacts):Player {
  const skin=createSkin(p.agentId,p.persona.visual,p.side??'host'),root=new THREE.Group();root.name=p.agentId;root.scale.setScalar(.9375);
  const parents=[-1,0,1,2,2,2,1,1],positions=[[0,0,0],[0,12,0],[0,0,0],[0,12,0],[-5,10,0],[5,10,0],[-1.9,0,0],[1.9,0,0]];
  const bones=positions.map(()=>new THREE.Bone());bones.forEach((b,i)=>{b.position.set(...positions[i].map(n=>n/16) as [number,number,number]);if(parents[i]>=0)bones[parents[i]].add(b);});
  const parts=[cuboid(8,12,4,16,16,[0,18,0],2),cuboid(8,8,8,0,0,[0,28,0],3),cuboid(4,12,4,40,16,[-6,18,0],4),cuboid(4,12,4,32,48,[6,18,0],5),cuboid(4,12,4,0,16,[-1.9,6,0],6),cuboid(4,12,4,16,48,[1.9,6,0],7),
    cuboid(8,12,4,16,32,[0,18,0],2,.25),cuboid(8,8,8,32,0,[0,28,0],3,.5),cuboid(4,12,4,40,32,[-6,18,0],4,.25),cuboid(4,12,4,48,48,[6,18,0],5,.25),cuboid(4,12,4,0,32,[-1.9,6,0],6,.25),cuboid(4,12,4,0,48,[1.9,6,0],7,.25)];
  const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());
  const material=new THREE.MeshStandardMaterial({map:skin.texture,alphaTest:.1,roughness:.88,metalness:0,side:THREE.FrontSide});
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.add(bones[0]);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;root.add(mesh);
  // 提词卡和笔拿在右手里（主持用讲台上的讲稿，手里不拿）。
  let pen:THREE.Object3D|null=null;
  if(card&&p.side!=='host'){const hand=new THREE.Group();hand.position.set(-1/16,-9.5/16,-1.5/16);hand.rotation.set(-1.25,.15,0);hand.scale.setScalar(1/.9375);hand.add(card);bones[4].add(hand);pen=card.userData.pen??null;if(pen){pen.removeFromParent();pen.position.set(0,-.55,.08);pen.rotation.set(-.8,0,.25);bones[5].add(pen);}}
  const eye=new THREE.Vector3(),forward=new THREE.Vector3(),pose={lean:0,crossed:0,gesture:0,gx:0,gz:0,nod:0,writing:0};
  const headWorld=new THREE.Vector3(),headQuat=new THREE.Quaternion(),contactPoint=new THREE.Vector3(),reachPoint=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0),reachQuat=new THREE.Quaternion(),inverse=new THREE.Matrix4();let lastPoseAt=-1,contactGap:number|undefined;
  return {root,mesh,head:bones[3],skin,eye,forward,material,get contactGap(){return contactGap;},update(a,s,room,grid){
    const poseNow=a.error?a.errorAt:s.now,dt=lastPoseAt<0?1/60:Math.min(.1,Math.max(0,(poseNow-lastPoseAt)/1000));lastPoseAt=poseNow;
    material.opacity=a.error?.45:1;material.transparent=!!a.error;material.depthWrite=!a.error;
    if(dt===0)return;
    const action=a.active?.action,t=a.active?.duration?Math.min(1,(poseNow-a.active.start)/a.active.duration):0;
    const control=!!action&&['mic','nextRound','tapBell','flipScript'].includes(action.kind);
    const crouch=action?.kind==='crouch'?Math.abs(Math.sin(Math.PI*t*action.times)):0;
    root.position.set(a.position[0],a.position[1]-a.sit*.578-crouch*.2,a.position[2]);root.rotation.y=a.yaw;
    if(control&&p.side!=='host'){const shift=.12*Math.sin(Math.min(1,t/.45)*Math.PI/2);root.position.x+=Math.sin(a.anchor.homeYaw)*shift;root.position.z+=Math.cos(a.anchor.homeYaw)*shift;}
    const mood=(key:string)=>a.mind?.mood.find(m=>m.key===key)?.value??0;
    const speaking=a.desired==='speaking'&&!a.cut&&!a.error,listening=!speaking&&a.desired!=='thinking';
    const seat=room.anchors.indexOf(a.anchor),idle=idleMotion(poseNow,seat);
    const natural=!s.reduced&&!a.error&&listening&&!a.queue.length&&(!action||action.kind==='wait');
    const k=natural?idle.amount:0;root.userData.idle=k>.12?idle.kind:null;
    const temperament=p.persona.personalities.find(x=>x.id===p.personalityId)?.label??'';
    const quiet=/冷静|学究|较真/.test(temperament),lively=/热血|轻快|直率/.test(temperament);
    const gestureSize=lively?1.12:quiet?.8:1;
    // 空闲和倾听的“活气”（第 12.6 节）：每个人用自己的 id 做相位，呼吸、换坐姿、侧头看队友、
    // 队友发言时侧身带笑、被质询愣一下——同一时刻没人动作相同，也没有人长时间完全不动。
    const phase=(poseNow/1000+a.id.length*.7)%9,seed2=(poseNow/1000+a.id.length*.31)%17;
    const idleBreath=s.reduced||a.error?0:(a.sit>.5?.6+.4*Math.sin(poseNow/1000*(.8+(a.id.length%3)*.12)):0)*.012;
    const idleShift=!s.reduced&&listening&&a.sit>.5&&seed2<1.4?Math.sin(Math.min(1,(1.4-seed2)/.5)*Math.PI)*.05:0;
    const idleHead=!s.reduced&&listening&&phase>6.2&&phase<7.4?Math.sin((phase-6.2)/1.2*Math.PI)*.14:0;
    // 情绪的身体语言：压力大前倾，信心足后靠，憋屈低头塌肩，火气大抱臂（第 11.5 节）。
    const leanTarget=s.reduced?0:control?(p.side==='host'?.08:.35):(mood('压力')>=6?.17:0)+(mood('憋屈')>=6?.12:0)-(mood('信心')>=7?.08:0)+crouch*.5+(a.desired==='thinking'?.12:0)+idleShift*.3+(idle.kind==='leanBack'?-.1*k:idle.kind==='write'||idle.kind==='pointNote'?.07*k:0);
    pose.lean=approach(pose.lean,leanTarget,dt*(control?12:4));pose.crossed=approach(pose.crossed,listening&&!action&&mood('火气')>=6&&!s.reduced?1:0,dt*3);
    bones[2].rotation.x=pose.lean+idleBreath;
    const target=lookAt(a,s,room),yaw=Math.atan2(target[0]-a.position[0],target[2]-a.position[2]);
    let headYaw=Math.max(-1.15,Math.min(1.15,Math.atan2(Math.sin(yaw-a.yaw),Math.cos(yaw-a.yaw))));
    const eyeHeight=a.position[1]-a.sit*.578+1.62;
    let headPitch=a.desired==='thinking'?.42:Math.max(-.4,Math.min(.4,Math.atan2(eyeHeight-target[1],Math.hypot(target[0]-a.position[0],target[2]-a.position[2]))));
    if(!s.reduced&&listening){const cycle=(poseNow+a.id.length*977)%5200;pose.nod=cycle<520?Math.sin(cycle/520*Math.PI)*(mood('信心')>=5?.16:.09):0;}else pose.nod=0;
    headPitch+=pose.nod-pose.lean*.6+(mood('憋屈')>=6&&!s.reduced?.18:0)-(mood('信心')>=7&&!s.reduced?.06:0);
    if(action?.kind==='swing')headPitch+=Math.sin(t*Math.PI)*.25;
    if(natural){if(idle.kind==='nod')headPitch+=Math.sin(k*Math.PI*3)*.13;if(idle.kind==='shakeHead')headYaw+=Math.sin(k*Math.PI*3)*.14;if(idle.kind==='glanceMate')headYaw+=k*.22*(seat%2?1:-1);if(idle.kind==='write'||idle.kind==='page')headPitch+=k*.12;}
    headYaw+=idleHead;
    bones[3].rotation.x=approach(bones[3].rotation.x,headPitch,dt*9);bones[3].rotation.y=approach(bones[3].rotation.y,headYaw,dt*9);
    const walk=s.reduced?0:action?.kind==='walkTo'?Math.sin(poseNow/125)*.5:action?.kind==='walk'?Math.sin(t*7)*.55:0;
    // 坐姿用游戏的骑乘姿势；腿伸进桌子下面的空当。
    bones[6].rotation.set(-1.4137*a.sit-walk,Math.PI/10*a.sit,.0785*a.sit);bones[7].rotation.set(-1.4137*a.sit+walk,-Math.PI/10*a.sit,-.0785*a.sit);
    let rx=-Math.PI/5*a.sit+walk,ry=0,rz=0,lx=-Math.PI/5*a.sit-walk,ly=0,lz=0;
    if(card&&p.side!=='host'){rx=Math.min(rx,-.62);}
    if(card&&a.desired==='thinking'&&p.side!=='host'){pose.writing=approach(pose.writing,1,dt*4);rx=-1.15;rz=-.2;lx=-1.23+(s.reduced?0:Math.sin(poseNow/260)*.045);ly=.5;lz=.5+(s.reduced?0:Math.sin(poseNow/170)*.04);}else pose.writing=approach(pose.writing,0,dt*4);
    if(action&&['mic','nextRound','tapBell','flipScript'].includes(action.kind)){rx=-1.15-Math.sin(t*Math.PI)*.45;rz=-.08;}
    else if(action?.kind==='cheer'){
      // 欢呼动作（第 12.6 节）：双臂高举，身子里外各跳一下。
      const hop=Math.abs(Math.sin(t*Math.PI*2));rx=-Math.PI*.95;lx=-Math.PI*.95;rz=-.25;lz=.25;
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
        case 'chin':ilx=-2;ily=-.55;ilz=-.2;break;
        case 'foldArms':irx=-1;iry=.75;irz=.35;ilx=-.95;ily=-.75;ilz=-.35;break;
        case 'stretch':irx=-2.45;ilx=-2.45;irz=-.4;ilz=.4;break;
        case 'shift':irz=-.16;ilz=.16;break;
        case 'scratchHead':ilx=-2.6;ilz=.28;ily=.35+Math.sin(poseNow/180)*.07;break;
        case 'pointNote':irx=-1.1;ilx=-1.3;ily=.45;ilz=.2;break;
      }
      const weight=Math.min(1,k*gestureSize);rx=THREE.MathUtils.lerp(rx,irx,weight);ry=THREE.MathUtils.lerp(ry,iry,weight);rz=THREE.MathUtils.lerp(rz,irz,weight);lx=THREE.MathUtils.lerp(lx,ilx,weight);ly=THREE.MathUtils.lerp(ly,ily,weight);lz=THREE.MathUtils.lerp(lz,ilz,weight);
    }
    for(const [bone,x,y,z] of [[bones[4],rx,ry,rz],[bones[5],lx,ly,lz]] as const){bone.rotation.x=approach(bone.rotation.x,x,dt*5);bone.rotation.y=approach(bone.rotation.y,y,dt*5);bone.rotation.z=approach(bone.rotation.z,z,dt*5);}
    contactGap=undefined;
    if(control&&contacts){const target=action?.kind==='mic'?contacts.mics.get(a.anchor.mic):action?.kind==='tapBell'?contacts.bell:action?.kind==='nextRound'?contacts.nextRound:contacts.script;
      if(target){const hand=action?.kind==='tapBell'||action?.kind==='nextRound'?bones[5]:bones[4];target.getWorldPosition(contactPoint);hand.parent!.updateWorldMatrix(true,false);inverse.copy(hand.parent!.matrixWorld).invert();reachPoint.copy(contactPoint).applyMatrix4(inverse).sub(hand.position).normalize();reachQuat.setFromUnitVectors(down,reachPoint);hand.quaternion.slerp(reachQuat,Math.min(1,dt*18));root.updateMatrixWorld(true);reachPoint.set(0,-.61,0).applyMatrix4(hand.matrixWorld);contactGap=reachPoint.distanceTo(contactPoint);}
    }
    if(pen)pen.visible=a.desired==='thinking'||natural&&['write','tapPen','pointNote'].includes(idle.kind)&&k>.1;
    if(!s.reduced){root.position.y+=Math.abs(walk)*.035;if(listening&&a.sit>.8)bones[2].rotation.z=Math.sin(poseNow/5400+p.agentId.length)*.015;else bones[2].rotation.z=approach(bones[2].rotation.z,0,dt*3);}
    // 神态（第 12.6 节）：被打断先惊讶；交锋提问的人挑眉逼视；队友发言时带一点笑。
    const faceExtra:Array<'raise'|'shock'|'cheer'|'frown'|'happy'>=[];
    if(a.cut&&!s.reduced)faceExtra.push('shock');
    else if(speaking&&typeof a.look==='object'&&s.pair.includes(a.id)&&!s.reduced)faceExtra.push('raise');
    else if(!s.reduced&&listening&&typeof a.look==='object'&&a.look.agent){const mate=s.actors[a.look.agent];if(mate&&mate.side===a.side&&mate.desired==='speaking')faceExtra.push('happy');}
    skin.face(a.mind,poseNow,speaking,s.reduced,faceExtra);
    root.updateMatrixWorld(true);bones[3].getWorldPosition(headWorld);bones[3].getWorldQuaternion(headQuat);
    eye.set(0,.234,.05).applyQuaternion(headQuat).add(headWorld);forward.set(0,0,1).applyQuaternion(headQuat);
    // 环境反射按所在位置的游戏光照网格调亮暗：墙角暗，灯下亮。
    const level=Math.max(...grid.sample(a.position[0],a.position[1]+1-a.sit*.578,a.position[2]))/15;material.envMapIntensity=.04+level*.08;
  },dispose(){const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());material.dispose();skin.texture.dispose();mesh.skeleton.dispose();}};
}
