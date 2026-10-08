import * as THREE from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
/**
 * 天空、太阳和天色（第 11.4 节、第 8.6 节）。辩论进度 0→1 对应游戏时间 9000→11800 tick：
 * 下午三点太阳在西边 45° 高，西窗的光斑已经落到舞台上；接近傍晚六点时贴着地平线，光柱横着穿过礼堂。
 */
export interface Environment {sun:THREE.DirectionalLight;hemi:THREE.HemisphereLight;sky:Sky;/** 0～1 的天光系数，给游戏光照网格的天光用 */daylight:number;/** 太阳的高度角（弧度） */elevation:number;direction:THREE.Vector3;update(progress:number,dt:number):boolean;setShadow(size:number):void;dispose():void}
export function sunAt(progress:number){
  const ticks=9000+Math.min(1,Math.max(0,progress))*2800;
  const elevation=THREE.MathUtils.degToRad(90-Math.abs(ticks-6000)*90/6000);
  // 游戏里太阳东升西落，沿 x 轴走；下午在西边（-x），稍微偏南一点让窗格的影子斜着落下。
  const direction=new THREE.Vector3(-Math.cos(elevation),Math.sin(elevation),.22).normalize();
  return {ticks,elevation,direction};
}
export function createEnvironment(scene:THREE.Scene,center=new THREE.Vector3(11,2,10)):Environment {
  const sky=new Sky();sky.scale.setScalar(450);
  // 原版天空着色器的太阳盘亮到超出半精度浮点的范围，会变成无穷大，环境反射和泛光都会被它带坏；这里给输出加个上限。
  const clampLine='gl_FragColor = vec4( texColor, 1.0 );';if(!sky.material.fragmentShader.includes(clampLine))console.warn('[mc-stage] 天空着色器的写法变了，没能给输出加上限');sky.material.fragmentShader=sky.material.fragmentShader.replace(clampLine,'gl_FragColor = vec4( min( texColor, vec3( 2.0 ) ) * 0.4, 1.0 );');sky.material.uniforms.turbidity.value=5;sky.material.uniforms.cloudCoverage.value=0;sky.material.uniforms.mieCoefficient.value=.004;sky.material.uniforms.mieDirectionalG.value=.82;scene.add(sky);
  const sun=new THREE.DirectionalLight('#fff4e6',.55);sun.castShadow=true;
  const cam=sun.shadow.camera;cam.left=-17;cam.right=17;cam.top=17;cam.bottom=-17;cam.near=1;cam.far=140;sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;sun.shadow.mapSize.set(4096,4096);sun.shadow.intensity=.38;
  sun.target.position.copy(center);scene.add(sun,sun.target);
  const hemi=new THREE.HemisphereLight('#fff6e8','#9cb896',.42);scene.add(hemi);
  scene.fog=new THREE.Fog('#c8e4ff',55,180);
  let current=-1;
  const env:Environment={sun,hemi,sky,daylight:.72,elevation:1,direction:new THREE.Vector3(),
    update(progress,dt){
      // 每轮开始后天色在大约 10 秒里平滑过去，不跳。
      const target=Math.min(1,Math.max(0,progress));current=current<0?target:current+(target-current)*Math.min(1,dt/3.5);
      const {elevation,direction}=sunAt(current);
      env.elevation=elevation;env.direction.copy(direction);
      sun.position.copy(center).addScaledVector(direction,70);
      const low=1-THREE.MathUtils.smoothstep(elevation,THREE.MathUtils.degToRad(4),THREE.MathUtils.degToRad(40));
      sun.color.setRGB(1,1-.24*low,1-.5*low);
      // 灯具是室内主光；阳光只在窗口附近补一点冷暖和方向（12.17）。
      sun.intensity=.55*THREE.MathUtils.smoothstep(elevation,THREE.MathUtils.degToRad(.5),THREE.MathUtils.degToRad(12))*(1-.1*low);
      sky.material.uniforms.sunPosition.value.copy(direction);sky.material.uniforms.rayleigh.value=1.2+1.8*low;
      (scene.fog as THREE.Fog).color.setRGB(.73-.05*low,.8-.2*low,.92-.36*low);
      // 辅助光只填暗部，傍晚不靠大幅提环境光或曝光把全屋刷亮。
      hemi.intensity=.42+.08*low;
      env.daylight=.72-.12*low;
      return Math.abs(target-current)>.002;
    },
    setShadow(size){if(sun.shadow.mapSize.x===size)return;sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null as unknown as THREE.WebGLRenderTarget;},
    dispose(){scene.remove(sky,sun,sun.target,hemi);sky.geometry.dispose();sky.material.dispose();sun.shadow.map?.dispose();}};
  return env;
}
/**
 * 新画风户外的天穹：天顶饱和的天蓝渐变到地平线的浅雾蓝，地平线上方点缀几团像素风的白云（不用原版那一整层白云，
 * 低角度看过去它像一块白天花板）。不受雾影响，放在很远的大球里面。
 */
export function createSkyDome(top:string,horizon:string,seed=7){
  const W=1024,H=512,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;
  const g=c.createLinearGradient(0,0,0,H/2);g.addColorStop(0,top);g.addColorStop(.75,horizon);g.addColorStop(1,horizon);c.fillStyle=g;c.fillRect(0,0,W,H/2);c.fillStyle=horizon;c.fillRect(0,H/2,W,H/2);
  let s=seed>>>0||1;const r=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  // 一团云：几块错开的白色长方块，底下压一道浅灰蓝的阴影；离地平线越近越扁。
  for(let i=0;i<26;i++){const x=Math.floor(r()*W),y=Math.floor(H*(.2+r()*.24)),k=.6+(y/H-.2)*2.2,w=Math.floor((36+r()*70)*k),h=Math.max(4,Math.floor((8+r()*10)*k));
    for(let j=0;j<4;j++){const bx=x+Math.floor((r()-.5)*w*.7),bw=Math.floor(w*(.45+r()*.5)),bh=Math.floor(h*(.6+r()*.6)),by=y-Math.floor(bh*r()*.6);
      for(const dx of [0,-W,W]){c.fillStyle='rgba(214,226,240,.95)';c.fillRect(bx+dx,by+bh-2,bw,3);c.fillStyle='rgba(255,255,255,.96)';c.fillRect(bx+dx,by,bw,bh-1);}}}
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;
  const dome=new THREE.Mesh(new THREE.SphereGeometry(250,48,24),new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false,depthWrite:false}));
  dome.name='sky-dome';dome.renderOrder=-2;dome.frustumCulled=false;return dome;
}
