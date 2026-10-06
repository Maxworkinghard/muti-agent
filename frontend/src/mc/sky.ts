import * as THREE from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
/**
 * 天空、太阳和天色（第 11.4 节、第 8.6 节）。辩论进度 0→1 对应游戏时间 9000→11800 tick：
 * 下午三点太阳在西边 45° 高，西窗的光斑已经落到舞台上；接近傍晚六点时贴着地平线，光柱横着穿过礼堂。
 */
export interface Environment {sun:THREE.DirectionalLight;hemi:THREE.HemisphereLight;sky:Sky;/** 0～1 的天光系数，给游戏光照网格的天光用 */daylight:number;/** 太阳的高度角（弧度） */elevation:number;direction:THREE.Vector3;update(progress:number,dt:number):boolean;setShadow(size:number):void;dispose():void}
const center=new THREE.Vector3(11,2,10);
export function sunAt(progress:number){
  const ticks=9000+Math.min(1,Math.max(0,progress))*2800;
  const elevation=THREE.MathUtils.degToRad(90-Math.abs(ticks-6000)*90/6000);
  // 游戏里太阳东升西落，沿 x 轴走；下午在西边（-x），稍微偏南一点让窗格的影子斜着落下。
  const direction=new THREE.Vector3(-Math.cos(elevation),Math.sin(elevation),.22).normalize();
  return {ticks,elevation,direction};
}
export function createEnvironment(scene:THREE.Scene):Environment {
  const sky=new Sky();sky.scale.setScalar(450);
  // 原版天空着色器的太阳盘亮到超出半精度浮点的范围，会变成无穷大，环境反射和泛光都会被它带坏；这里给输出加个上限。
  const clampLine='gl_FragColor = vec4( texColor, 1.0 );';if(!sky.material.fragmentShader.includes(clampLine))console.warn('[mc-stage] 天空着色器的写法变了，没能给输出加上限');sky.material.fragmentShader=sky.material.fragmentShader.replace(clampLine,'gl_FragColor = vec4( min( texColor, vec3( 24.0 ) ), 1.0 );');sky.material.uniforms.turbidity.value=5;sky.material.uniforms.cloudCoverage.value=0;sky.material.uniforms.mieCoefficient.value=.004;sky.material.uniforms.mieDirectionalG.value=.82;scene.add(sky);
  const sun=new THREE.DirectionalLight('#fff4e6',1.8);sun.castShadow=true;
  const cam=sun.shadow.camera;cam.left=-17;cam.right=17;cam.top=17;cam.bottom=-17;cam.near=1;cam.far=140;sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;sun.shadow.mapSize.set(4096,4096);sun.shadow.intensity=.5;
  sun.target.position.copy(center);scene.add(sun,sun.target);
  const hemi=new THREE.HemisphereLight('#bcd8ff','#97774f',.62);scene.add(hemi);
  scene.fog=new THREE.Fog('#b9d3f0',45,160);
  let current=-1;
  const env:Environment={sun,hemi,sky,daylight:1,elevation:1,direction:new THREE.Vector3(),
    update(progress,dt){
      // 每轮开始后天色在大约 10 秒里平滑过去，不跳。
      const target=Math.min(1,Math.max(0,progress));current=current<0?target:current+(target-current)*Math.min(1,dt/3.5);
      const {elevation,direction}=sunAt(current);
      env.elevation=elevation;env.direction.copy(direction);
      sun.position.copy(center).addScaledVector(direction,70);
      const low=1-THREE.MathUtils.smoothstep(elevation,THREE.MathUtils.degToRad(4),THREE.MathUtils.degToRad(40));
      sun.color.setRGB(1,1-.24*low,1-.5*low);
  // 窗外光线压一档（用户反馈「太耀眼」）：直射阳光从 2.2 降到 1.55，天空的环境补偿略增，屋里整体不变暗。
  sun.intensity=1.55*THREE.MathUtils.smoothstep(elevation,THREE.MathUtils.degToRad(.5),THREE.MathUtils.degToRad(12))*(1-.12*low);
      sky.material.uniforms.sunPosition.value.copy(direction);sky.material.uniforms.rayleigh.value=1.2+1.8*low;
      (scene.fog as THREE.Fog).color.setRGB(.73-.05*low,.8-.2*low,.92-.36*low);
      // 亮堂的室内光（第 12.5 节）：环境光给足，傍晚天光系数也只轻轻压，画面始终明亮。
      hemi.intensity=.58+.24*low;
      env.daylight=1-.04*low;
      return Math.abs(target-current)>.002;
    },
    setShadow(size){if(sun.shadow.mapSize.x===size)return;sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null as unknown as THREE.WebGLRenderTarget;},
    dispose(){scene.remove(sky,sun,sun.target,hemi);sky.geometry.dispose();sky.material.dispose();sun.shadow.map?.dispose();}};
  return env;
}
