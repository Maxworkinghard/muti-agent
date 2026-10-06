import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
/**
 * 光柱和浮尘（第 11.4 节）。
 * - 高档：沿每个像素的视线在礼堂里步进，查太阳和亮着的舞台灯的阴影贴图累加散射光：能看到窗口斜射的光柱、舞台灯的光束。
 *   半分辨率算 16 步，每个像素起点错开一点，再模糊放大叠到画面上。
 * - 中档：从西窗顺着阳光拉出去的半透明光柱面片，不算阴影。
 * - 浮尘：礼堂里慢慢飘的小点，在顶点着色器里查太阳阴影和舞台灯的照射范围，只有被照到的才亮。
 */
/** 辩论室内部（世界坐标，米）：光只在屋里散射，窗外不算。 */
const ROOM_MIN=new THREE.Vector3(1,1,1),ROOM_MAX=new THREE.Vector3(15,6,13);
const STEPS=16,SPOTS=3;
/** 散射强度（第 12.5 节）：只做点缀，光柱很淡，辩题板和人脸不能被雾罩住。 */
const SUN_SCATTER=.035,SPOT_SCATTER=.025;
export interface LightRig {sun:THREE.DirectionalLight;sunDirection:THREE.Vector3;spots:THREE.SpotLight[]}
const quadVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
function spotBlock(i:number){return `{vec3 L=uSpotPos[${i}]-p;float d=length(L);vec3 l=L/d;float c=dot(-l,uSpotDir[${i}]);
  if(c>uSpotCone[${i}].x){float cone=smoothstep(uSpotCone[${i}].x,uSpotCone[${i}].y,c);float fall=pow(clamp(1.0-pow(d/uSpotRange[${i}],4.0),0.0,1.0),2.0)/max(pow(d,1.4),0.01);
  sum+=uSpotColor[${i}]*cone*fall*hg(dot(rd,-l),0.35)*shadowAt(uSpotShadow${i},uSpotMatrix[${i}],p);}}`;}
const marchFragment=`
uniform sampler2D tDepth;uniform mat4 uProjInv;uniform mat4 uCamWorld;uniform vec3 uCamPos;uniform vec3 uBoxMin;uniform vec3 uBoxMax;
uniform sampler2DShadow uSunShadow;uniform mat4 uSunMatrix;uniform vec3 uSunDir;uniform vec3 uSunColor;
uniform sampler2DShadow uSpotShadow0;uniform sampler2DShadow uSpotShadow1;uniform sampler2DShadow uSpotShadow2;
uniform mat4 uSpotMatrix[${SPOTS}];uniform vec3 uSpotPos[${SPOTS}];uniform vec3 uSpotDir[${SPOTS}];uniform vec3 uSpotColor[${SPOTS}];uniform vec2 uSpotCone[${SPOTS}];uniform float uSpotRange[${SPOTS}];
varying vec2 vUv;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float hg(float c,float g){float g2=g*g;return (1.0-g2)/(12.566*pow(1.0+g2-2.0*g*c,1.5));}
float shadowAt(sampler2DShadow map,mat4 m,vec3 p){vec4 c=m*vec4(p,1.0);c.xyz/=c.w;if(c.x<0.0||c.x>1.0||c.y<0.0||c.y>1.0||c.z>1.0)return 1.0;return texture(map,vec3(c.xy,c.z-0.0015));}
void main(){
  float depth=texture2D(tDepth,vUv).x;vec4 v=uProjInv*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);v/=v.w;
  vec3 ro=uCamPos,rd=(uCamWorld*v).xyz-ro;float len=length(rd);rd/=len;
  vec3 inv=1.0/rd,t0=(uBoxMin-ro)*inv,t1=(uBoxMax-ro)*inv,tmin=min(t0,t1),tmax=max(t0,t1);
  float tn=max(max(tmin.x,tmin.y),max(tmin.z,0.0)),tf=min(min(tmax.x,tmax.y),min(tmax.z,len));
  vec3 sum=vec3(0.0);
  if(tf>tn){float dt=(tf-tn)/${STEPS}.0,t=tn+dt*ign(gl_FragCoord.xy);vec3 sunPart=vec3(0.0);float sunPhase=hg(dot(rd,uSunDir),0.55);
    for(int i=0;i<${STEPS};i++){vec3 p=ro+rd*t;
      if(uSunColor.r+uSunColor.g+uSunColor.b>0.0)sunPart+=uSunColor*shadowAt(uSunShadow,uSunMatrix,p);
      ${Array.from({length:SPOTS},(_,i)=>`if(uSpotColor[${i}].r+uSpotColor[${i}].g+uSpotColor[${i}].b>0.0)${spotBlock(i)}`).join('\n      ')}
      t+=dt;}
    sum=(sum+sunPart*sunPhase)*dt;}
  gl_FragColor=vec4(sum,1.0);
}`;
const compositeFragment=`uniform sampler2D tDiffuse;uniform sampler2D tVolume;uniform vec2 uTexel;varying vec2 vUv;
void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 v=vec3(0.0);for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float w=(x==0?2.0:1.0)*(y==0?2.0:1.0);v+=texture2D(tVolume,vUv+vec2(float(x),float(y))*uTexel*1.5).rgb*w;}gl_FragColor=vec4(c.rgb+v/16.0,c.a);}`;
/** 高档的光柱：读场景深度，算半分辨率的散射光，再叠回画面。 */
export class VolumetricPass extends Pass {
  private target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  private march:THREE.ShaderMaterial;private composite:THREE.ShaderMaterial;private quad=new FullScreenQuad();private color=new THREE.Color();private dir=new THREE.Vector3();
  constructor(private camera:THREE.PerspectiveCamera,depth:THREE.DepthTexture,private rig:LightRig){
    super();
    this.march=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:marchFragment,depthTest:false,depthWrite:false,uniforms:{tDepth:{value:depth},uProjInv:{value:new THREE.Matrix4()},uCamWorld:{value:new THREE.Matrix4()},uCamPos:{value:new THREE.Vector3()},uBoxMin:{value:ROOM_MIN},uBoxMax:{value:ROOM_MAX},
      uSunShadow:{value:null},uSunMatrix:{value:new THREE.Matrix4()},uSunDir:{value:new THREE.Vector3()},uSunColor:{value:new THREE.Vector3()},
      uSpotShadow0:{value:null},uSpotShadow1:{value:null},uSpotShadow2:{value:null},uSpotMatrix:{value:Array.from({length:SPOTS},()=>new THREE.Matrix4())},uSpotPos:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotDir:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotColor:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotCone:{value:Array.from({length:SPOTS},()=>new THREE.Vector2())},uSpotRange:{value:new Array(SPOTS).fill(14)}}});
    this.composite=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:compositeFragment,depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:null},tVolume:{value:this.target.texture},uTexel:{value:new THREE.Vector2()}}});
  }
  setSize(w:number,h:number){const hw=Math.max(1,Math.round(w/2)),hh=Math.max(1,Math.round(h/2));this.target.setSize(hw,hh);(this.composite.uniforms.uTexel.value as THREE.Vector2).set(1/hw,1/hh);}
  render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget){
    const u=this.march.uniforms,{sun,spots}=this.rig,cam=this.camera;
    (u.uProjInv.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);(u.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);(u.uCamPos.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    const sunMap=sun.shadow.map?.depthTexture??null;u.uSunShadow.value=sunMap;(u.uSunMatrix.value as THREE.Matrix4).copy(sun.shadow.matrix);(u.uSunDir.value as THREE.Vector3).copy(this.rig.sunDirection);
    this.color.copy(sun.color).multiplyScalar(sunMap&&sun.visible?sun.intensity*SUN_SCATTER:0);(u.uSunColor.value as THREE.Vector3).set(this.color.r,this.color.g,this.color.b);
    for(let i=0;i<SPOTS;i++){const s=spots[i],map=s?.shadow.map?.depthTexture??null,on=!!s&&s.visible&&s.intensity>0&&!!map;u['uSpotShadow'+i].value=map;
      const color=(u.uSpotColor.value as THREE.Vector3[])[i];if(!on){color.set(0,0,0);continue;}
      this.color.copy(s.color).multiplyScalar(s.intensity*SPOT_SCATTER);color.set(this.color.r,this.color.g,this.color.b);
      (u.uSpotMatrix.value as THREE.Matrix4[])[i].copy(s.shadow.matrix);(u.uSpotPos.value as THREE.Vector3[])[i].setFromMatrixPosition(s.matrixWorld);
      this.dir.setFromMatrixPosition(s.target.matrixWorld).sub((u.uSpotPos.value as THREE.Vector3[])[i]).normalize();(u.uSpotDir.value as THREE.Vector3[])[i].copy(this.dir);
      (u.uSpotCone.value as THREE.Vector2[])[i].set(Math.cos(s.angle),Math.cos(s.angle*(1-s.penumbra)));(u.uSpotRange.value as number[])[i]=s.distance||50;}
    this.quad.material=this.march;renderer.setRenderTarget(this.target);renderer.clear();this.quad.render(renderer);
    this.composite.uniforms.tDiffuse.value=readBuffer.texture;this.quad.material=this.composite;renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);if(!this.renderToScreen)renderer.clear();this.quad.render(renderer);
  }
  dispose(){this.target.dispose();this.march.dispose();this.composite.dispose();this.quad.dispose();}
}
/** 中档的光柱：每扇西窗顺着阳光拉出去一束半透明的面，越远越淡，太阳越低越暖。 */
export function createFakeShafts(windows:Array<{y0:number;y1:number;z0:number;z1:number;floor:number}>){
  const geometry=new THREE.BufferGeometry(),count=windows.length*4*4,base=new Float32Array(count*3),along=new Float32Array(count),edge=new Float32Array(count);
  // 每扇窗是一个顺着光线方向扫出去的四棱柱，只画四个侧面；顶点里存窗口上的点和沿光线走多远（0～1）。
  const indices:number[]=[];let v=0;
  for(const w of windows){const corners=[[w.y0,w.z0],[w.y1,w.z0],[w.y1,w.z1],[w.y0,w.z1]];
    for(let f=0;f<4;f++){const a=corners[f],b=corners[(f+1)%4];const start=v;
      for(const [p,t] of [[a,0],[b,0],[b,1],[a,1]] as const){base.set([1.02,p[0],p[1]],v*3);along[v]=t;edge[v]=w.floor;v++;}
      indices.push(start,start+1,start+2,start,start+2,start+3);}}
  geometry.setAttribute('position',new THREE.BufferAttribute(base,3));geometry.setAttribute('aAlong',new THREE.BufferAttribute(along,1));geometry.setAttribute('aFloor',new THREE.BufferAttribute(edge,1));geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uLight:{value:new THREE.Vector3(1,-1,0)},uColor:{value:new THREE.Color()}},
    vertexShader:'attribute float aAlong;attribute float aFloor;uniform vec3 uLight;varying float vAlong;void main(){float len=min(26.0,(position.y-aFloor)/max(0.05,-uLight.y));vec3 p=position+uLight*len*aAlong;vAlong=aAlong;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
    fragmentShader:'uniform vec3 uColor;varying float vAlong;void main(){float fade=pow(1.0-vAlong,1.3)*smoothstep(0.0,0.08,vAlong);gl_FragColor=vec4(uColor*fade,1.0);}'});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=11;mesh.name='fake-shafts';
  return {mesh,update(rig:LightRig){const light=(material.uniforms.uLight.value as THREE.Vector3).copy(rig.sunDirection).negate();material.uniforms.uColor.value.copy(rig.sun.color).multiplyScalar(rig.sun.intensity*.016*(light.y<-.02?1:0));},dispose(){geometry.dispose();material.dispose();}};
}
/** 浮尘：在舞台上方和观众席前排慢慢飘，查太阳阴影和舞台灯的照射范围，只在光里亮。 */
export function createDust(rig:LightRig,count=900){
  const geometry=new THREE.BufferGeometry(),position=new Float32Array(count*3),seed=new Float32Array(count*4);
  let s=1234567;const rand=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};
  for(let i=0;i<count;i++){position.set([1.5+rand()*16,2.1+rand()*2.8,1.3+rand()*14],i*3);seed.set([rand(),rand(),rand(),rand()],i*4);}
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,4));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0},uSunShadow:{value:null},uSunMatrix:{value:new THREE.Matrix4()},uSunColor:{value:new THREE.Vector3()},uScale:{value:600},
      uSpotPos:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotDir:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotColor:{value:Array.from({length:SPOTS},()=>new THREE.Vector3())},uSpotCone:{value:Array.from({length:SPOTS},()=>new THREE.Vector2())}},
    vertexShader:`attribute vec4 aSeed;uniform float uTime;uniform sampler2DShadow uSunShadow;uniform mat4 uSunMatrix;uniform vec3 uSunColor;uniform float uScale;
      uniform vec3 uSpotPos[${SPOTS}];uniform vec3 uSpotDir[${SPOTS}];uniform vec3 uSpotColor[${SPOTS}];uniform vec2 uSpotCone[${SPOTS}];varying vec3 vColor;
      void main(){float t=uTime;vec3 p=position+vec3(sin(t*.07+aSeed.x*6.283)*.7,sin(t*.045+aSeed.y*6.283)*.45-.25*fract(t*.004+aSeed.z),cos(t*.06+aSeed.w*6.283)*.7);
        vec3 light=vec3(0.0);vec4 c=uSunMatrix*vec4(p,1.0);c.xyz/=c.w;if(c.x>0.0&&c.x<1.0&&c.y>0.0&&c.y<1.0&&c.z<1.0)light+=uSunColor*texture(uSunShadow,vec3(c.xy,c.z-0.002));
        for(int i=0;i<${SPOTS};i++){vec3 L=uSpotPos[i]-p;float d=length(L);float cs=dot(-L/d,uSpotDir[i]);light+=uSpotColor[i]*smoothstep(uSpotCone[i].x,uSpotCone[i].y,cs)/max(d*d,1.0);}
        vColor=light*(.55+.45*sin(t*.9+aSeed.x*40.0));vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=clamp(uScale*(.012+.012*aSeed.w)/-mv.z,1.0,6.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:'varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor*smoothstep(.5,.1,d),1.0);}'});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.renderOrder=12;points.name='dust';
  const color=new THREE.Color(),dir=new THREE.Vector3();
  return {points,update(time:number,height:number){const u=material.uniforms,sun=rig.sun,map=sun.shadow.map?.depthTexture??null;u.uTime.value=time;u.uScale.value=height;u.uSunShadow.value=map;(u.uSunMatrix.value as THREE.Matrix4).copy(sun.shadow.matrix);
      color.copy(sun.color).multiplyScalar(map?sun.intensity*.5:0);(u.uSunColor.value as THREE.Vector3).set(color.r,color.g,color.b);
      rig.spots.forEach((s,i)=>{if(i>=SPOTS)return;const c=(u.uSpotColor.value as THREE.Vector3[])[i];if(s.intensity<=0){c.set(0,0,0);return;}color.copy(s.color).multiplyScalar(s.intensity*.05);c.set(color.r,color.g,color.b);
        const pos=(u.uSpotPos.value as THREE.Vector3[])[i].setFromMatrixPosition(s.matrixWorld);dir.setFromMatrixPosition(s.target.matrixWorld).sub(pos).normalize();(u.uSpotDir.value as THREE.Vector3[])[i].copy(dir);(u.uSpotCone.value as THREE.Vector2[])[i].set(Math.cos(s.angle),Math.cos(s.angle*(1-s.penumbra)));});},
    dispose(){geometry.dispose();material.dispose();}};
}
