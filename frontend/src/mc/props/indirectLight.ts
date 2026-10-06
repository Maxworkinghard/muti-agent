import * as THREE from 'three';
import type {LightGrid} from '../light';
/** 写实物品和人物共用游戏里的方块光、天光；物体移动后按世界坐标取样。 */
export function createPropIndirectLight(grid:LightGrid,table:THREE.Texture){
  const width=25,height=13,depth=27,data=new Uint8Array(width*height*depth*4);
  for(let z=0;z<depth;z++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [b,s]=grid.sample(x-1,y,z-1),i=((z*height+y)*width+x)*4;data[i]=Math.round(b/15*255);data[i+1]=Math.round(s/15*255);data[i+3]=255;}
  const texture=new THREE.Data3DTexture(data,width,height,depth);texture.format=THREE.RGBAFormat;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
  const materials=new Set<THREE.MeshStandardMaterial>();
  return {bind(root:THREE.Object3D){root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(!(mat instanceof THREE.MeshStandardMaterial)||materials.has(mat))continue;materials.add(mat);const prior=mat.onBeforeCompile.bind(mat),key=mat.customProgramCacheKey();
    mat.onBeforeCompile=(shader,renderer)=>{prior(shader,renderer);shader.uniforms.propGrid={value:texture};shader.uniforms.propTable={value:table};
      shader.vertexShader='varying vec3 vPropWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 propPosition=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\npropPosition=instanceMatrix*propPosition;\n#endif\nvPropWorld=(modelMatrix*propPosition).xyz;');
      shader.fragmentShader='precision highp sampler3D;uniform sampler3D propGrid;uniform sampler2D propTable;varying vec3 vPropWorld;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nvec2 propLevels=texture(propGrid,(vPropWorld+vec3(1.5,.5,1.5))/vec3(25.,13.,27.)).rg;\nreflectedLight.indirectDiffuse+=texture2D(propTable,(propLevels*15.0+.5)/16.0).rgb*diffuseColor.rgb*.12;');};
    mat.customProgramCacheKey=()=> 'mc-prop-grid:'+key;mat.needsUpdate=true;
  }});},dispose(){texture.dispose();}};
}
