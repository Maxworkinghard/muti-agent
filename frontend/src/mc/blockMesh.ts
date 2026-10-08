import * as THREE from 'three';
import type {Assets} from './assets';
import {blockModels,resolveModel,resolveTexture,facePoints,transformPoint,defaultUv,directions,key,fullBlock,type Block} from './blockModel';
import type {LightGrid} from './light';
interface AnimationFace {vertex:number;tile:Assets['atlas']['textures'][string];coords:number[][]}
interface Batch {position:number[];uv:number[];color:number[];normal:number[];light:number[];ao:number[];index:number[];animations:AnimationFace[]}
/** 方块的公用着色参数：游戏光照网格（方块光、天光）当作间接光，强度可以整体调。 */
/** 游戏里不按生物群系染色的方块：材质包的模型就算带了染色编号也不染（樱花、杜鹃、苍白橡树的叶子本来就是自己的颜色）。 */
const UNTINTED=/^(cherry|azalea|flowering_azalea|pale_oak)_leaves$/;
export interface BlockShading {lightMap:THREE.Texture;indirect:{value:number};direct:{value:number};/** false：不按生物群系给草和树叶染色（新画风的贴图已经画好了颜色） */tint?:boolean;/** 染色用的颜色，不设就用原版平原 */colors?:{grass?:string;foliage?:string;birch?:string;spruce?:string}}
/** 游戏原版的顶点环境光遮蔽：两侧都被挡住时最暗，按挡住的格数分四档。 */
const AO_LEVELS=[.42,.62,.8,1];
function vertexAo(cells:Map<string,Block>,b:Block,normal:THREE.Vector3,p:THREE.Vector3){
  const n=[Math.round(normal.x),Math.round(normal.y),Math.round(normal.z)];
  if(Math.abs(n[0])+Math.abs(n[1])+Math.abs(n[2])!==1)return 1;
  const axis=n.findIndex(v=>v!==0),others=[0,1,2].filter(i=>i!==axis);
  // 面外侧那一层格子里，挨着这个顶点的两个边格和一个角格。
  const outside=[p.x,p.y,p.z].map((v,i)=>i===axis?Math.floor(v+n[i]*.5):v);
  const dir=others.map(i=>{const v=[p.x,p.y,p.z][i],cell=[b.x,b.y,b.z][i];return v-cell>.5?1:-1;});
  const base=others.map((i,k)=>Math.floor([p.x,p.y,p.z][i]+(dir[k]>0?-.01:.01)));
  const solid=(o0:number,o1:number)=>{const c=[0,0,0];c[axis]=outside[axis];c[others[0]]=base[0]+o0;c[others[1]]=base[1]+o1;return fullBlock(cells.get(key(c[0],c[1],c[2])));};
  const s1=solid(dir[0],0),s2=solid(0,dir[1]),corner=solid(dir[0],dir[1]);
  return AO_LEVELS[s1&&s2?0:3-Number(s1)-Number(s2)-Number(corner)];
}
/** 动画帧按贴图实际宽度算（高清贴图放大过，说明文件里的尺寸还是原版的）；只有同时写了宽高时才按比例。 */
function frameSize(tile:Assets['atlas']['textures'][string]):[number,number]{const a=tile.animation;if(!a)return [tile.width,tile.width];return [tile.width,a.width&&a.height?tile.width*a.height/a.width:tile.width];}
export function buildBlockMesh(blocks:Block[],assets:Assets,light:LightGrid,shading:BlockShading,neighbors=blocks):THREE.Group {
  const group=new THREE.Group(),cells=new Map(neighbors.map(b=>[key(b.x,b.y,b.z),b]));
  // 不透明贴图的 alpha 恒为 1，可与镂空贴图共用 alphaTest，减少场景和阴影的一组绘制。
  const batches:Record<string,Batch>=Object.fromEntries(['solid','translucent'].map(k=>[k,{position:[],uv:[],color:[],normal:[],light:[],ao:[],index:[],animations:[]}])) as Record<string,Batch>;
  for(const b of blocks)for(const ref of blockModels(assets,b)){
    const model=resolveModel(assets.models,ref.model);
    for(const e of model.elements??[])for(const [face,f] of Object.entries(e.faces)){
      const texture=resolveTexture(model,f.texture),tile=assets.atlas.textures[texture];if(!tile)throw new Error('拼图缺少贴图：'+texture+'（房间改过以后要重新运行 npm run mc:import）');
      const points=facePoints(e,face).map(p=>transformPoint(p,e,ref).add(new THREE.Vector3(b.x,b.y,b.z)));
      const raw=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0]));
      // 面积为零的面（模型里有些退化的面）法线算不出来，受光时会出无效值，泛光会把它扩散成整屏黑，直接跳过。
      if(raw.lengthSq()<1e-12)continue;const normal=raw.normalize();
      if(f.cullface){const d=transformPoint(directions[f.cullface].map(n=>n+.5),{from:[0,0,0],to:[16,16,16],faces:{}},ref).subScalar(.5);if(fullBlock(cells.get(key(b.x+Math.round(d.x),b.y+Math.round(d.y),b.z+Math.round(d.z)))))continue;}
      const batch=batches[tile.alpha==='translucent'?'translucent':'solid'],base=batch.position.length/3;
      const uv=f.uv??defaultUv(e,face),size=frameSize(tile)[1];
      let coords=[[uv[0],uv[3]],[uv[2],uv[3]],[uv[2],uv[1]],[uv[0],uv[1]]];
      const rotation=((f.rotation??0)/90+(ref.uvlock&&Math.abs(normal.y)>.5?(ref.y??0)/90:0))%4;coords=coords.map((_,i)=>coords[(i+rotation)%4]);
      if(ref.uvlock){coords=points.map(p=>{const x=(p.x-b.x)*16,y=(p.y-b.y)*16,z=(p.z-b.z)*16;return Math.abs(normal.y)>.5?[x,normal.y>0?z:16-z]:Math.abs(normal.x)>.5?[normal.x>0?16-z:z,16-y]:[normal.z>0?x:16-x,16-y];});}
      if(tile.animation)batch.animations.push({vertex:base,tile,coords});
      const tc=shading.colors??{},tint=new THREE.Color(f.tintindex===undefined||shading.tint===false||UNTINTED.test(b.id)?'#ffffff':b.id==='lily_pad'?'#208030':b.id.includes('birch')?tc.birch??'#80A755':b.id.includes('spruce')?tc.spruce??'#619961':b.id.includes('leaves')?tc.foliage??'#77AB2F':tc.grass??'#91BD59');
      // 方块完整贴在格子边界上的面用原版的顶点遮蔽；楼梯、灯笼等内部的面按周围取样。
      const onBoundary=points.every(p=>[p.x,p.y,p.z].some((v,i)=>Math.abs(normal.getComponent(i))>.5&&Math.abs(v-Math.round(v))<1e-4));
      for(let i=0;i<4;i++){
        const p=points[i],outside=p.clone().addScaledVector(normal,.05);let bl=0,sky=0,count=0,blocked=0;
        const axes=['x','y','z'].filter(a=>Math.abs(normal[a as 'x'|'y'|'z'])<.5) as ('x'|'y'|'z')[];
        for(const aa of [-.08,.08])for(const bb of [-.08,.08]){const v=outside.clone();if(axes[0])v[axes[0]]+=aa;if(axes[1])v[axes[1]]+=bb;const [l,s]=light.sample(v.x,v.y,v.z);bl+=l;sky+=s;count++;if(fullBlock(cells.get(key(Math.floor(v.x),Math.floor(v.y),Math.floor(v.z)))))blocked++;}
        const ao=model.ambientocclusion===false?1:onBoundary&&e.shade!==false?vertexAo(cells,b,normal,p):1-blocked*.12;
        batch.position.push(p.x,p.y,p.z);batch.normal.push(normal.x,normal.y,normal.z);
        batch.uv.push((tile.x+coords[i][0]/16*tile.width)/assets.atlas.width,1-(tile.y+coords[i][1]/16*size)/assets.atlas.height);
        batch.color.push(tint.r,tint.g,tint.b);batch.light.push(Math.max(e.light_emission??0,bl/count),sky/count);batch.ao.push(ao);
      }
      batch.index.push(base,base+1,base+2,base,base+2,base+3);
    }
  }
  for(const [pass,batch] of Object.entries(batches)){if(!batch.position.length)continue;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(batch.position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(batch.color,3));geo.setAttribute('mcLight',new THREE.Float32BufferAttribute(batch.light,2));geo.setAttribute('mcAO',new THREE.Float32BufferAttribute(batch.ao,1));geo.setIndex(batch.index);geo.computeBoundingSphere();
    geo.setAttribute('mcNextUv',geo.getAttribute('uv').clone());geo.setAttribute('mcBlend',new THREE.Float32BufferAttribute(new Float32Array(batch.position.length/3),1));
    const pbr=!!assets.normalTexture;
    const mat=new THREE.MeshStandardMaterial({map:assets.atlasTexture,normalMap:assets.normalTexture,roughnessMap:assets.ormTexture,metalnessMap:assets.ormTexture,roughness:pbr?1:.86,metalness:pbr?1:0,envMapIntensity:0,vertexColors:true,alphaTest:.1,transparent:pass==='translucent',depthWrite:pass!=='translucent',side:THREE.DoubleSide});
    mat.onBeforeCompile=shader=>{
      shader.uniforms.mcLightMap={value:shading.lightMap};shader.uniforms.mcIndirect=shading.indirect;shader.uniforms.mcDirect=shading.direct;
      shader.vertexShader='attribute vec2 mcLight; attribute float mcAO; attribute vec2 mcNextUv; attribute float mcBlend; varying vec2 vMcLight; varying float vMcAO; varying vec2 vMcNextUv; varying float vMcBlend;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMcLight=(mcLight+0.5)/16.0;vMcAO=mcAO;vMcNextUv=mcNextUv;vMcBlend=mcBlend;');
      shader.fragmentShader='uniform sampler2D mcLightMap; uniform float mcIndirect; uniform float mcDirect; varying vec2 vMcLight; varying float vMcAO; varying vec2 vMcNextUv; varying float vMcBlend;\n'+shader.fragmentShader
        .replace('#include <map_fragment>','#ifdef USE_MAP\ndiffuseColor *= mix(texture2D(map,vMapUv),texture2D(map,vMcNextUv),vMcBlend);\n#endif')
        // 游戏光照网格当间接光（墙角按原版的遮蔽变暗），真实的太阳和灯光是直接光。
        .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += texture2D(mcLightMap,vMcLight).rgb * vMcAO * diffuseColor.rgb * mcIndirect;\nreflectedLight.directDiffuse *= mix(1.0, vMcAO, 0.35) * mcDirect;\nreflectedLight.directSpecular *= mcDirect;');
    };
    mat.customProgramCacheKey=()=> 'mc-lit-blocks';const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    if(batch.animations.length)mesh.userData.animate=(now:number)=>{const uv=geo.getAttribute('uv'),next=geo.getAttribute('mcNextUv'),blend=geo.getAttribute('mcBlend');for(const face of batch.animations){const tile=face.tile,a=tile.animation!,[w,h]=frameSize(tile),columns=Math.max(1,Math.floor(tile.width/w)),count=columns*Math.max(1,Math.floor(tile.height/h));const frames=(a.frames??Array.from({length:count},(_,i)=>i)).map(f=>typeof f==='number'?{index:f,time:a.frametime??1}:f);let tick=now/50%frames.reduce((n,f)=>n+f.time,0),index=0;while(tick>=frames[index].time){tick-=frames[index].time;index++;}for(let j=0;j<4;j++){const point=face.coords[j],current=frames[index].index,future=frames[(index+1)%frames.length].index,coord=(f:number)=>[(tile.x+(f%columns)*w+point[0]/16*w)/assets.atlas.width,1-(tile.y+Math.floor(f/columns)*h+point[1]/16*h)/assets.atlas.height];uv.setXY(face.vertex+j,...coord(current) as [number,number]);next.setXY(face.vertex+j,...coord(future) as [number,number]);blend.setX(face.vertex+j,a.interpolate?tick/frames[index].time:0);}}uv.needsUpdate=next.needsUpdate=blend.needsUpdate=true;};
  }
  return group;
}
export function disposeObject(object:THREE.Object3D){object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Sprite){if(o instanceof THREE.Mesh)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
