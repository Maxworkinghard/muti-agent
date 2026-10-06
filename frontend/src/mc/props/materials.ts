import * as THREE from 'three';
import {createFlatBatch} from './geometry';
/**
 * 道具材质：颜色和物件语言对齐项目 2D 像素场景的色板（pixelDebateRoom），
 * 全部是平色的像素风，不做照片级写实；交互器件（拉杆、红石灯、钟、按钮）保持我的世界原味。
 * 开麦灯、阶段灯的亮度按座位逐级调（propGlow / propLevels）。
 */
export const PALETTE={wood:'#ab7646',woodDark:'#8a5b34',cream:'#f8e2bc',board:'#fbf3df',ink:'#3d3a42',blue:'#4e79a1',red:'#c45f53',bench:'#8d3d4a',stone:'#8f8a7e',brass:'#d9a441',brassDark:'#b0812e',lampOff:'#54332a',leaf:'#2f8a55',leafDark:'#1f6b40',pot:'#f4efe4',paper:'#f6f2e8',gray:'#b8b2a4',flame:'#ffb84d'} as const;
export interface PropMaterials {
  wood:THREE.MeshStandardMaterial;woodDark:THREE.MeshStandardMaterial;clothPro:THREE.MeshStandardMaterial;clothCon:THREE.MeshStandardMaterial;clothJudge:THREE.MeshStandardMaterial;
  stone:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;brassDark:THREE.MeshStandardMaterial;lampOff:THREE.MeshStandardMaterial;board:THREE.MeshStandardMaterial;paper:THREE.MeshStandardMaterial;
  pot:THREE.MeshStandardMaterial;leaf:THREE.MeshStandardMaterial;leafDark:THREE.MeshStandardMaterial;candle:THREE.MeshStandardMaterial;flame:THREE.MeshStandardMaterial;
  /** 红石灯亮起来和蜡烛火苗都走这一个倍乘器：值是每个座位当前的亮度 0..1。 */
  levels:{value:Float32Array};
  /** 合并平色道具时，颜色和粗糙度写入顶点，外观保持原来的材质参数。 */
  flatBatch:THREE.MeshStandardMaterial;
  glow(color:string,intensity:number):THREE.MeshStandardMaterial;
  /** 红石灯（第 12.12 节第 5 条）：手绘格纹贴图像素风，暗着也认得出是灯，亮了整面发光。 */
  redstoneLamp(on:boolean):THREE.MeshStandardMaterial;
  indicator(map:THREE.Texture,off:THREE.Vector4,on:THREE.Vector4):THREE.MeshStandardMaterial;
  owned:Array<THREE.Material|THREE.Texture>;env(map:THREE.Texture|null,intensity:number):void;
}
export function createMaterials():PropMaterials {
  const owned:Array<THREE.Material|THREE.Texture>=[];
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  const flat=(color:string,rough=.92)=>keep(new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0}));
  const levels={value:new Float32Array(10)},flatBatch=keep(createFlatBatch()),tileMats=new Map<THREE.Texture,THREE.MeshStandardMaterial>();
  // 亮部件（灯环、火苗）共用一个着色器注入：emissive 乘上 propLevels[座位]。
  const glow=(color:string,intensity:number)=>{const mat=keep(new THREE.MeshStandardMaterial({color:'#2a0c06',emissive:color,emissiveIntensity:intensity,roughness:.4}));mat.onBeforeCompile=shader=>{shader.uniforms.propLevels=levels;shader.vertexShader='attribute float propGlow;varying float vPropGlow;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPropGlow=propGlow;');shader.fragmentShader='uniform float propLevels[10];varying float vPropGlow;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=propLevels[int(vPropGlow+.5)];');};mat.customProgramCacheKey=()=>'mc-prop-indicator';return mat;};
  const glowTile=(map:THREE.Texture,off:THREE.Vector4,on:THREE.Vector4)=>{const cached=tileMats.get(map);if(cached)return cached;
    const mat=keep(new THREE.MeshStandardMaterial({map,color:'#ffffff',emissive:'#ffffff',emissiveMap:map,emissiveIntensity:1,roughness:.7}));tileMats.set(map,mat);
    mat.onBeforeCompile=shader=>{shader.uniforms.propLevels=levels;shader.uniforms.lampOff={value:off};shader.uniforms.lampOn={value:on};
      shader.vertexShader='attribute float propGlow;varying float vPropGlow;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPropGlow=propGlow;');
      shader.fragmentShader='uniform float propLevels[10];varying float vPropGlow;uniform vec4 lampOff;uniform vec4 lampOn;vec2 lampUv(vec2 uv){float on=step(.5,propLevels[int(vPropGlow+.5)]);return mix(uv,lampOn.xy+(uv-lampOff.xy)/lampOff.zw*lampOn.zw,on);}\n'+shader.fragmentShader
        .replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','lampUv(vMapUv)'))
        .replace('#include <emissivemap_fragment>',THREE.ShaderChunk.emissivemap_fragment.replaceAll('vEmissiveMapUv','lampUv(vEmissiveMapUv)')+'\ntotalEmissiveRadiance*=mix(.12,2.6,propLevels[int(vPropGlow+.5)]);');
    };mat.customProgramCacheKey=()=>'mc-prop-lamp-v2';return mat;};
  const redstoneLamp=(on:boolean)=>{
    const cv=document.createElement('canvas');cv.width=cv.height=32;const g=cv.getContext('2d')!;
    g.fillStyle=on?'#d8824a':'#6b4433';g.fillRect(0,0,32,32);
    for(let y=0;y<32;y+=8)for(let x=0;x<32;x+=8){g.fillStyle=on?'#e8935a':'#54332a';g.fillRect(x,y,8,8);g.fillStyle=on?'#f2a86b':'#4a2e22';g.fillRect(x+1,y+1,6,6);}
    if(on){g.fillStyle='#ffd9a8';g.fillRect(12,12,8,8);}
    const t=keep(new THREE.CanvasTexture(cv));t.magFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;
    return keep(new THREE.MeshStandardMaterial({map:t,color:'#ffffff',emissive:'#ffffff',emissiveMap:t,emissiveIntensity:on?1.5:.12,roughness:.7}));
  };
  const m:PropMaterials={
    wood:flat(PALETTE.wood),woodDark:flat(PALETTE.woodDark,.85),clothPro:flat(PALETTE.blue,.95),clothCon:flat(PALETTE.red,.95),clothJudge:flat(PALETTE.gray,.95),
    stone:flat(PALETTE.stone,.9),brass:flat(PALETTE.brass,.45),brassDark:flat(PALETTE.brassDark,.5),lampOff:flat(PALETTE.lampOff,.8),board:flat(PALETTE.woodDark),paper:flat(PALETTE.paper,.9),
    pot:flat(PALETTE.pot,.95),leaf:flat(PALETTE.leaf,.95),leafDark:flat(PALETTE.leafDark,.95),candle:flat('#f3ecd9',.85),
    flame:keep(new THREE.MeshStandardMaterial({color:'#7a4a1a',emissive:PALETTE.flame,emissiveIntensity:2.4,roughness:.5})),
    levels,flatBatch,glow,redstoneLamp,indicator:glowTile,owned,
    env(map,intensity=.9){for(const x of owned)if(x instanceof THREE.MeshStandardMaterial){x.envMap=map;x.envMapIntensity=intensity;x.needsUpdate=true;}},
  };
  return m;
}
