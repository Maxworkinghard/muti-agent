import * as THREE from 'three';
import {Pass} from 'three/examples/jsm/postprocessing/Pass.js';
/**
 * 场景只画一遍：画进一张带深度纹理的目标，环境光遮蔽和景深都直接读这张深度，
 * 不再各自把整个场景重画一遍（每多画一遍就多几百次绘制调用）。
 */
export class ScenePass extends Pass {
  target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1)});
  constructor(public scene:THREE.Scene,public camera:THREE.Camera){super();this.needsSwap=false;this.target.texture.name='mc.scene';}
  render(renderer:THREE.WebGLRenderer){renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.scene,this.camera);}
  setSize(w:number,h:number){this.target.setSize(w,h);}
  dispose(){this.target.depthTexture?.dispose();this.target.dispose();}
}
/** 把无效值和无穷大清掉再进后面的效果：一个坏像素会被泛光、环境光遮蔽扩散成整屏黑。它读的是场景目标，不是上一步的结果。 */
export const SANITIZE={uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c))||any(isinf(c)))c=vec4(0.0,0.0,0.0,1.0);gl_FragColor=min(c,vec4(64.0));}'};
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
