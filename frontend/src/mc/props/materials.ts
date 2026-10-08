import * as THREE from 'three';
import {createFlatBatch} from './geometry';
import {clothWeave,woodGrain} from './surfaceTextures';
/**
 * 视觉宪法色板：蜜木 / 奶油 / 高饱和队色（蓝·品红）/ 亮黄点缀。
 * styled=true 时平涂无木纹；默认色板与 styled 都走青春饱和，不再用灰蓝灰红。
 */
export const PALETTE={wood:'#d4a86a',woodDark:'#a87840',cream:'#F0E6D2',board:'#fff8ea',ink:'#2b2136',blue:'#3d8bff',red:'#ff4d9a',bench:'#ff4d9a',stone:'#e8d9bc',brass:'#f0c84a',brassDark:'#c39962',lampOff:'#54332a',leaf:'#3dba6e',leafDark:'#2e9a58',pot:'#fff8ea',paper:'#fff8ea',gray:'#9b6fe0',flame:'#ffe0b2'} as const;
export interface PropMaterials {
  wood:THREE.MeshStandardMaterial;woodDark:THREE.MeshStandardMaterial;clothPro:THREE.MeshStandardMaterial;clothCon:THREE.MeshStandardMaterial;clothJudge:THREE.MeshStandardMaterial;
  stone:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;brassDark:THREE.MeshStandardMaterial;lampOff:THREE.MeshStandardMaterial;board:THREE.MeshStandardMaterial;paper:THREE.MeshStandardMaterial;
  pot:THREE.MeshStandardMaterial;leaf:THREE.MeshStandardMaterial;leafDark:THREE.MeshStandardMaterial;candle:THREE.MeshStandardMaterial;flame:THREE.MeshStandardMaterial;
  levels:{value:Float32Array};
  flatBatch:THREE.MeshStandardMaterial;
  glow(color:string,intensity:number):THREE.MeshStandardMaterial;
  redstoneLamp(on:boolean):THREE.MeshStandardMaterial;
  indicator(map:THREE.Texture,off:THREE.Vector4,on:THREE.Vector4):THREE.MeshStandardMaterial;
  owned:Array<THREE.Material|THREE.Texture>;env(map:THREE.Texture|null,intensity:number):void;
  styled:boolean;
}
/** 新画风：与 PALETTE 同源，略提亮墙面与队色。 */
const STYLED:Record<keyof typeof PALETTE,string>={wood:'#d4a86a',woodDark:'#a87840',cream:'#fff8ea',board:'#fff8ea',ink:'#2b2136',blue:'#3d8bff',red:'#ff4d9a',bench:'#e03880',stone:'#F0E6D2',brass:'#f0c84a',brassDark:'#c39962',lampOff:'#54332a',leaf:'#3dba6e',leafDark:'#2e9a58',pot:'#fff8ea',paper:'#fffdf6',gray:'#9b6fe0',flame:'#ffe8c0'};
export function createMaterials(styled=false):PropMaterials {
  const owned:Array<THREE.Material|THREE.Texture>=[];
  const keep=<T extends THREE.Material|THREE.Texture>(x:T)=>{owned.push(x);return x;};
  const flat=(color:string,rough=.92)=>keep(new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0}));
  const P=styled?STYLED:PALETTE,grain=styled?null:keep(woodGrain()),weave=styled?null:keep(clothWeave());
  const wood=(color:string,rough:number)=>keep(new THREE.MeshStandardMaterial({name:'wood',color,map:grain,bumpMap:grain,bumpScale:.009,roughness:styled?.92:rough,metalness:0}));
  const cloth=(color:string)=>keep(new THREE.MeshStandardMaterial({name:'cloth',color,map:weave,bumpMap:weave,bumpScale:.001,roughness:.99,metalness:0}));
  const copper=(color:string,rough:number)=>keep(new THREE.MeshStandardMaterial({name:'copper',color,roughness:styled?.6:rough,metalness:styled?.15:.78}));
  const levels={value:new Float32Array(10)},flatBatch=keep(createFlatBatch()),tileMats=new Map<THREE.Texture,THREE.MeshStandardMaterial>();
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
    g.fillStyle=on?'#f0c84a':'#6b4433';g.fillRect(0,0,32,32);
    for(let y=0;y<32;y+=8)for(let x=0;x<32;x+=8){g.fillStyle=on?'#ffd86a':'#54332a';g.fillRect(x,y,8,8);g.fillStyle=on?'#ffe8a0':'#4a2e22';g.fillRect(x+1,y+1,6,6);}
    if(on){g.fillStyle='#fff6d0';g.fillRect(12,12,8,8);}
    const t=keep(new THREE.CanvasTexture(cv));t.magFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;
    return keep(new THREE.MeshStandardMaterial({map:t,color:'#ffffff',emissive:'#ffffff',emissiveMap:t,emissiveIntensity:on?1.5:.12,roughness:.7}));
  };
  const m:PropMaterials={
    wood:wood(P.wood,.5),woodDark:wood(P.woodDark,.58),clothPro:cloth(P.blue),clothCon:cloth(P.red),clothJudge:cloth(P.gray),
    stone:flat(P.stone,.86),brass:copper(P.brass,.3),brassDark:copper(P.brassDark,.4),lampOff:flat(P.lampOff,.8),board:wood(P.woodDark,.58),paper:flat(P.paper,.9),
    pot:flat(P.pot,.95),leaf:flat(P.leaf,.95),leafDark:flat(P.leafDark,.95),candle:flat('#fff8ea',.85),
    flame:keep(new THREE.MeshStandardMaterial({color:'#e0e7e9',emissive:P.flame,emissiveIntensity:1.2,roughness:.5})),styled,
    levels,flatBatch,glow,redstoneLamp,indicator:glowTile,owned,
    env(map,intensity=.9){for(const x of owned)if(x instanceof THREE.MeshStandardMaterial){x.envMap=map;x.envMapIntensity=intensity*(x.name==='copper'?1.8:x.name==='cloth'?.12:1);x.needsUpdate=true;}},
  };
  return m;
}
