import * as THREE from 'three';
/**
 * 游戏的云（第 11.4 节，`environment/clouds.png`）：贴图上一个像素是 12×12 米的一块云，铺在礼堂上空 128 米的一张大平面上，
 * 和游戏一样慢慢往东飘，远处淡出。云的颜色跟着天色：下午偏白，傍晚被夕阳染成暖色、也更暗。
 */
const TILE=12*256,HEIGHT=130;
export function createClouds(texture:THREE.Texture){
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;
  const geometry=new THREE.PlaneGeometry(TILE*2,TILE*2);geometry.rotateX(Math.PI/2);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms:{map:{value:texture},offset:{value:0},color:{value:new THREE.Color(1,1,1)},center:{value:new THREE.Vector2(11,10)}},
    vertexShader:'varying vec2 vXZ;void main(){vec4 w=modelMatrix*vec4(position,1.0);vXZ=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform sampler2D map;uniform float offset;uniform vec3 color;uniform vec2 center;varying vec2 vXZ;
      void main(){vec2 uv=(vXZ-vec2(offset,0.0))/${TILE.toFixed(1)};if(texture2D(map,uv).a<.5)discard;float fade=1.0-smoothstep(900.0,${(TILE*.9).toFixed(1)},length(vXZ-center));gl_FragColor=vec4(color,.82*fade);}`});
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(11,HEIGHT,10);mesh.frustumCulled=false;mesh.renderOrder=-1;mesh.name='clouds';
  const warm=new THREE.Color(),white=new THREE.Color(1,1,1);
  return {mesh,
    /** dt 秒；sun 是太阳光的颜色，daylight 是 0～1 的天光系数。 */
    update(dt:number,sun:THREE.Color,daylight:number){material.uniforms.offset.value=(material.uniforms.offset.value+dt*.6)%TILE;const low=Math.min(1,Math.max(0,(1-daylight)*4));warm.copy(sun).lerp(white,1-low*.8).multiplyScalar(.95-.3*low);(material.uniforms.color.value as THREE.Color).copy(warm);},
    dispose(){geometry.dispose();material.dispose();}};
}
