import * as THREE from 'three';
import type {LightGrid} from '../light';
/** 写实物品和人物共用游戏里的方块光、天光；物体移动后按世界坐标取样。 */
export function createPropIndirectLight(grid:LightGrid,table:THREE.Texture){
  const {min,max}=grid.bounds,width=max[0]-min[0]+1,height=max[1]-min[1]+1,depth=max[2]-min[2]+1,data=new Uint8Array(width*height*depth*4);
  for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [b,s]=grid.sample(x+min[0],y+min[1],z+min[2]),i=((z*height+y)*width+x)*4;data[i]=Math.round(b/15*255);data[i+1]=Math.round(s/15*255);data[i+3]=255;}
  const texture=new THREE.Data3DTexture(data,width,height,depth);texture.format=THREE.RGBAFormat;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  const materials=new Set<THREE.MeshStandardMaterial>();
  return {bind(root:THREE.Object3D){root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(!(mat instanceof THREE.MeshStandardMaterial)||materials.has(mat))continue;materials.add(mat);const prior=mat.onBeforeCompile.bind(mat),key=mat.customProgramCacheKey();
    mat.onBeforeCompile=(shader,renderer)=>{prior(shader,renderer);shader.uniforms.propGrid={value:texture};shader.uniforms.propTable={value:table};shader.uniforms.propOrigin={value:new THREE.Vector3(...min).addScalar(-.5)};shader.uniforms.propSize={value:new THREE.Vector3(width,height,depth)};
      shader.vertexShader='varying vec3 vPropWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 propPosition=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\npropPosition=instanceMatrix*propPosition;\n#endif\nvPropWorld=(modelMatrix*propPosition).xyz;');
      shader.fragmentShader='precision highp sampler3D;uniform sampler3D propGrid;uniform sampler2D propTable;uniform vec3 propOrigin;uniform vec3 propSize;varying vec3 vPropWorld;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nvec2 propLevels=texture(propGrid,(vPropWorld-propOrigin)/propSize).rg;\nreflectedLight.indirectDiffuse+=texture2D(propTable,(propLevels*15.0+.5)/16.0).rgb*diffuseColor.rgb*.12;');};
    mat.customProgramCacheKey=()=> 'mc-prop-grid:'+key;mat.needsUpdate=true;
  }});},dispose(){texture.dispose();}};
}
