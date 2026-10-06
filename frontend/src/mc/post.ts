import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {SMAAPass} from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {Pass} from 'three/examples/jsm/postprocessing/Pass.js';
import {LUTPass} from 'three/examples/jsm/postprocessing/LUTPass.js';
import {VolumetricPass,type LightRig} from './volumetric';
/**
 * 场景只画一遍：画进一张带深度纹理的目标，环境光遮蔽和景深都直接读这张深度，
 * 不再各自把整个场景重画一遍（每多画一遍就多几百次绘制调用）。
 */
class ScenePass extends Pass {
  target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1)});
  constructor(private scene:THREE.Scene,private camera:THREE.Camera){super();this.needsSwap=false;this.target.texture.name='mc.scene';}
  render(renderer:THREE.WebGLRenderer){renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.scene,this.camera);}
  setSize(w:number,h:number){this.target.setSize(w,h);}
  dispose(){this.target.depthTexture?.dispose();this.target.dispose();}
}
/** 把无效值和无穷大清掉再进后面的效果：一个坏像素会被泛光、环境光遮蔽扩散成整屏黑。它读的是场景目标，不是上一步的结果。 */
const SANITIZE={uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.0,0.0,0.0,1.0);gl_FragColor=min(c,vec4(64.0));}'};
/**
 * 调色表：在色调映射之后的 sRGB 上做。
 */
/**
 * 调色表（第 12.5 节）：明快的暖调，但不再整体提亮（用户反馈过曝发白）。
 * 只给中间调一点暖和少量饱和度上扬；天空那种明显偏蓝的颜色少加暖，窗外仍然是冷的。
 */
export function warmLut(size=32){
  const data=new Uint8Array(size*size*size*4),clamp=(x:number)=>Math.min(1,Math.max(0,x));
  for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){
    let R=r/(size-1),G=g/(size-1),B=b/(size-1);const l=.2126*R+.7152*G+.0722*B,blue=clamp((B-Math.max(R,G))*3),warm=1-.7*blue;
    const bell=l*(1-l)*4;
    R+=(.02*bell)*warm;G+=(.008*bell)*warm;B+=(-.016*bell-.008*l)*warm;
    const curve=(x:number)=>clamp(x+.03*(x-.42)*(1-Math.abs(2*x-1)));R=curve(R);G=curve(G);B=curve(B);
    const m=(R+G+B)/3;R=clamp(m+(R-m)*1.1);G=clamp(m+(G-m)*1.1);B=clamp(m+(B-m)*1.1);
    data.set([R*255,G*255,B*255,255].map(Math.round),((b*size+g)*size+r)*4);
  }
  const t=new THREE.Data3DTexture(data,size,size,size);t.format=THREE.RGBAFormat;t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.LinearFilter;t.wrapS=t.wrapT=t.wrapR=THREE.ClampToEdgeWrapping;t.unpackAlignment=1;t.needsUpdate=true;
  return t;
}
/**
 * 画质档（第 11.4 节）：
 * 高：太阳阴影 4096、舞台灯阴影、屏幕空间环境光遮蔽、光柱（体积光）、泛光、景深；
 * 中：太阳阴影 2048、舞台灯阴影、泛光，光柱用画好的面片（在场景里），没有屏幕空间遮蔽和景深；
 * 低：不算阴影，只保留抗锯齿和调色。
 */
export type Quality='high'|'medium'|'low';
export const QUALITY_LABEL:Record<Quality,string>={high:'高',medium:'中',low:'低'};
export interface Post {composer:EffectComposer;outline:OutlinePass;quality:Quality;setQuality(q:Quality):void;setSize(w:number,h:number):void;setFocus(distance:number|null):void;render():void;dispose():void}
export function createPost(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,quality:Quality,rig:LightRig):Post {
  const composer=new EffectComposer(renderer);
  const render=new ScenePass(scene,camera),depth=render.target.depthTexture!;
  // 环境光遮蔽用场景的深度反推法线；构造时直接传深度会因为 0.186 的一个空引用出错，所以先建好再换。
  const gtao=new GTAOPass(scene,camera,1,1);gtao.setGBuffer(depth,undefined);gtao.updateGtaoMaterial({radius:.35,distanceExponent:1.2,thickness:1.2,scale:.45,samples:12});gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:16});
  // 遮蔽算半分辨率再放大：方块世界的遮蔽本来就柔和，省下将近一半的开销。
  const gtaoSize=gtao.setSize.bind(gtao);gtao.setSize=(w,h)=>gtaoSize(Math.max(1,Math.round(w/2)),Math.max(1,Math.round(h/2)));
  const volume=new VolumetricPass(camera,depth,rig);
  const bokeh=new BokehPass(scene,camera,{focus:12,aperture:.00006,maxblur:.0045});
  // 景深同样读场景深度，不再自己画一遍深度。
  bokeh.materialBokeh.defines.DEPTH_PACKING=0;bokeh.materialBokeh.needsUpdate=true;(bokeh.uniforms as Record<string,THREE.IUniform>).tDepth.value=depth;
  bokeh.render=(r,writeBuffer,readBuffer)=>{const u=bokeh.uniforms as Record<string,THREE.IUniform>;u.tColor.value=readBuffer.texture;u.nearClip.value=camera.near;u.farClip.value=camera.far;r.setRenderTarget(bokeh.renderToScreen?null:writeBuffer);if(!bokeh.renderToScreen)r.clear();(bokeh as unknown as {_fsQuad:{render(r:THREE.WebGLRenderer):void}})._fsQuad.render(r);};
  const bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.055,.35,1.3);
  const outline=new OutlinePass(new THREE.Vector2(1,1),scene,camera);outline.edgeStrength=4;outline.edgeGlow=.6;outline.edgeThickness=1;
  const output=new OutputPass(),lut=new LUTPass({lut:warmLut(),intensity:1});
  const smaa=new SMAAPass();
  const sanitize=new ShaderPass(SANITIZE,'tNone');sanitize.uniforms.tDiffuse.value=render.target.texture;
  for(const pass of [render,sanitize,gtao,volume,bokeh,bloom,outline,output,lut,smaa])composer.addPass(pass);
  let focus:number|null=null;
  const post:Post={composer,outline,quality,
    setQuality(q){post.quality=q;gtao.enabled=volume.enabled=q==='high';bokeh.enabled=q==='high'&&focus!==null;bloom.enabled=q!=='low';renderer.shadowMap.enabled=q!=='low';},
    setSize(w,h){composer.setSize(w,h);},
    setFocus(d){focus=d;bokeh.enabled=post.quality==='high'&&d!==null;if(d!==null)(bokeh.uniforms as Record<string,THREE.IUniform>).focus.value=d;},
    render(){outline.enabled=outline.selectedObjects.length>0;composer.render();},
    dispose(){composer.dispose();render.dispose();sanitize.dispose();volume.dispose();lut.material.dispose();(lut.material.uniforms.lut.value as THREE.Texture|null)?.dispose();gtao.dispose();bokeh.dispose();bloom.dispose();outline.dispose();output.dispose();smaa.dispose();}};
  post.setQuality(quality);
  return post;
}
