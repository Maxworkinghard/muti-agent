/**
 * 园林水面（只属于这一间）：沿用 three 的 Water 做实时倒影（镜像相机 + 斜裁剪面），着色换成自己的：
 *   - 倒影按菲涅耳取：脚下看下去主要是水色，越往远处、视线越贴水面，倒影越清楚——不是一整块镜子；
 *   - 水色深、偏墨绿；近岸浅一点、带一点泥黄（水面深浅图从岸线算出来），像能看进去一点；
 *   - 两层细波纹顺着水流方向（往西流出水口）慢慢漂，倒影跟着轻轻晃；扰动按距离收着，近处不糊成一片；
 *   - 太阳只给一道很弱、很宽的高光，不出刺眼的亮点；岸上、亭子的影子落在水上（阴影贴图）；
 *   - 倒影的渲染目标跟着画布大小走：高密度屏（像素比 ≥1.5）取画布的一半，普通屏取 3/4，画面变大不会变糊。
 */
import * as THREE from 'three';
import {Water} from 'three/examples/jsm/objects/Water.js';
import type {V2Kit} from '../kit';
import {rng} from '../pixel';
import {CANAL,POND,WATER,edgeDistance,inside} from './site';

/** 水面深浅图覆盖的范围（世界坐标），外面一律按深水算 */
const RECT={x0:-24,z0:-32,x1:56,z1:26},TEXEL=.25;

/** 平铺的细波纹法线图：一组整数波矢的正弦叠加（无缝），不量化、线性过滤，远处是一层很细的粼光。 */
function rippleNormals(seed:number){
  const N=256,data=new Uint8Array(N*N*4),r=rng(seed);
  const waves=Array.from({length:14},(_,i)=>{const a=r()*Math.PI*2,k=2+Math.round(r()*(i<6?6:14));return {kx:Math.round(Math.cos(a)*k),ky:Math.round(Math.sin(a)*k),amp:1/(1+k*.55),ph:r()*Math.PI*2};}).filter(w=>w.kx||w.ky);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){let dx=0,dy=0;for(const w of waves){const t=2*Math.PI*(w.kx*x+w.ky*y)/N+w.ph,c=Math.cos(t)*w.amp*2*Math.PI/N;dx+=c*w.kx;dy+=c*w.ky;}
    const n=new THREE.Vector3(-dx*9,-dy*9,1).normalize(),i=(y*N+x)*4;data[i]=Math.round((n.x*.5+.5)*255);data[i+1]=Math.round((n.y*.5+.5)*255);data[i+2]=Math.round((n.z*.5+.5)*255);data[i+3]=255;}
  const t=new THREE.DataTexture(data,N,N);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
/** 水深图：0 在岸边，往里 5 米到 1；河道按离中心线多远算；园外的开阔水面按深水。 */
function depthMap(){
  const w=Math.round((RECT.x1-RECT.x0)/TEXEL),h=Math.round((RECT.z1-RECT.z0)/TEXEL),data=new Uint8Array(w*h*4);
  const canal=(x:number,z:number)=>{let best=-1;for(let i=1;i<CANAL.length;i++){const a=CANAL[i-1],b=CANAL[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),half=a.half+(b.half-a.half)*t,d=Math.hypot(a.x+dx*t-x,a.z+dz*t-z);best=Math.max(best,(half-d)/4);}return Math.min(1,best);};
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=RECT.x0+(i+.5)*TEXEL,z=RECT.z0+(j+.5)*TEXEL;
    const v=inside(POND,x,z)?Math.min(1,edgeDistance(POND,x,z)/5):x<-16?Math.max(0,canal(x,z)):0;const k=(j*w+i)*4;data[k]=data[k+1]=data[k+2]=Math.round(v*255);data[k+3]=255;}
  const t=new THREE.DataTexture(data,w,h);t.magFilter=t.minFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;return t;
}

const FRAGMENT=/* glsl */`
uniform sampler2D mirrorSampler;uniform sampler2D normalSampler;uniform sampler2D depthSampler;
uniform float time;uniform vec2 flow;uniform float distortionScale;uniform float ripple;
uniform vec3 sunColor;uniform vec3 sunDirection;uniform vec3 eye;
uniform vec3 shallowColor;uniform vec3 deepColor;uniform vec3 skyLight;uniform vec4 depthRect;uniform float glint;
varying vec4 mirrorCoord;varying vec4 worldPosition;
#include <common>
#include <packing>
#include <bsdfs>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
vec2 waveAt(vec2 p){
  vec2 side=vec2(-flow.y,flow.x);
  vec3 a=texture2D(normalSampler,p/5.6+flow*time*.034).xyz*2.-1.;
  vec3 b=texture2D(normalSampler,p/3.1+side*time*.022+vec2(.37,.11)).xyz*2.-1.;
  vec3 c=texture2D(normalSampler,p/17.+flow*time*.011+vec2(.61,.83)).xyz*2.-1.;
  return a.xy*.5+b.xy*.32+c.xy*.55;
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 toEye=eye-worldPosition.xyz;float dist=length(toEye);vec3 V=toEye/dist;
  vec2 w=waveAt(worldPosition.xz);
  // 远处的波纹在像素里挤成一团，按距离把法线压平（远处更平、倒影更整齐）
  float k=ripple/(1.+dist*.03);
  vec3 N=normalize(vec3(w.x*k,1.,w.y*k));
  vec2 duv=(worldPosition.xz-depthRect.xy)*depthRect.zw;
  float depth=(duv.x<0.||duv.y<0.||duv.x>1.||duv.y>1.)?1.:texture2D(depthSampler,duv).r;
  float shadow=getShadowMask();
  // 倒影：扰动量随距离收着，最多偏几个像素
  vec2 distortion=N.xz*distortionScale/max(dist,10.);
  vec3 refl=texture2D(mirrorSampler,mirrorCoord.xy/mirrorCoord.w+distortion).rgb;
  float cosT=clamp(dot(V,N),0.,1.),fres=.04+.96*pow(1.-cosT,5.);
  // 水体：深处墨绿，近岸带一点泥黄；被天光和一点点日光照着，背阴处更暗
  vec3 body=mix(shallowColor,deepColor,smoothstep(0.,1.,depth));
  vec3 lit=body*(skyLight+sunColor*max(dot(N,sunDirection),0.)*.18*shadow);
  // 太阳只留一道宽而弱的高光
  vec3 H=normalize(sunDirection+V);float spec=pow(max(dot(N,H),0.),160.)*glint*shadow;
  vec3 color=mix(lit,refl,fres)+sunColor*spec;
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface WaterLook {sun:THREE.Vector3;sunColor:string;shallow:string;deep:string;sky:string}
export function gardenWater(k:V2Kit,look:WaterLook){
  const normals=rippleNormals(31),depth=depthMap();k.owned.push(normals,depth);
  const water=new Water(new THREE.PlaneGeometry(1200,1200),{textureWidth:1024,textureHeight:1024,waterNormals:normals,sunDirection:look.sun.clone(),sunColor:look.sunColor,waterColor:look.deep,distortionScale:.8,fog:true,alpha:1});
  water.rotation.x=-Math.PI/2;water.position.set(16,WATER,0);water.name='garden-lake';water.receiveShadow=true;
  const mat=water.material as THREE.ShaderMaterial,u=mat.uniforms;
  Object.assign(u,{depthSampler:{value:depth},flow:{value:new THREE.Vector2(-.97,.24).normalize()},ripple:{value:.22},shallowColor:{value:new THREE.Color(look.shallow)},deepColor:{value:new THREE.Color(look.deep)},
    skyLight:{value:new THREE.Color(look.sky)},depthRect:{value:new THREE.Vector4(RECT.x0,RECT.z0,1/(RECT.x1-RECT.x0),1/(RECT.z1-RECT.z0))},glint:{value:.6}});
  mat.fragmentShader=FRAGMENT;mat.needsUpdate=true;
  // 倒影的渲染目标跟着画布（高密度屏一半、普通屏 3/4）；画质为低时停掉倒影重画
  const rt=(u.mirrorSampler.value as THREE.Texture&{renderTarget?:THREE.WebGLRenderTarget|null}).renderTarget,size=new THREE.Vector2();
  const render=water.onBeforeRender.bind(water);let on=true;
  water.onBeforeRender=(renderer,scene,camera,geometry,material,group)=>{if(!on){(u.eye.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);return;}renderer.getDrawingBufferSize(size);const k=renderer.getPixelRatio()>=1.5?.5:.75,w=Math.max(512,Math.round(size.x*k)),h=Math.max(384,Math.round(size.y*k));if(rt&&(rt.width!==w||rt.height!==h))rt.setSize(w,h);render(renderer,scene,camera,geometry,material,group);};
  water.userData.animate=(now:number)=>{u.time.value=now/1000;};
  water.userData.setReflections=(enabled:boolean)=>{on=enabled;};
  water.userData.dispose=()=>{water.geometry.dispose();mat.dispose();rt?.dispose();};
  return water;
}
