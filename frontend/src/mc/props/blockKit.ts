import * as THREE from 'three';
import {mesh} from './geometry';
import type {Kit} from './furniture';
export type BlockFns=Pick<Kit,'block'|'blockCyl'|'painting'>;
/**
 * 给道具工具箱接上方块贴图：贴真实方块贴图的道具（木板桌面、羊毛椅垫、原木树桩）从方块图集切出那一格做成能平铺的小贴图，
 * 按每米 16 像素铺在各个面上，和方块世界的比例一样；同一张贴图只切一次。还有原版的画。新画风房间和辩论室的道具共用。
 */
export interface BlockTextureSource {atlas:{width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>};atlasTexture:THREE.Texture;textures:Map<string,THREE.Texture>}
export function blockTextures(mat:Kit['mat'],assets:BlockTextureSource,keep:<T extends THREE.Material|THREE.Texture>(x:T)=>T):BlockFns{
  const tiles=new Map<string,THREE.MeshStandardMaterial>(),atlasImage=assets.atlasTexture.image as CanvasImageSource|undefined;
  // tint 给贴图乘一层颜色：白羊毛这种浅色贴图乘上任意颜色，就得到带像素纹理的任意色布料。
  const tile=(name:string,tint?:string,glow=0)=>{const id=name+'|'+(tint??'')+'|'+glow;let m=tiles.get(id);if(m)return m;const t=assets.atlas.textures[name];
    if(!t||!atlasImage){m=mat(tint??'#b08a5a');tiles.set(id,m);return m;}
    const cv=document.createElement('canvas');cv.width=t.width;cv.height=Math.min(t.height,t.width);const c=cv.getContext('2d')!;c.imageSmoothingEnabled=false;c.drawImage(atlasImage,t.x,t.y,cv.width,cv.height,0,0,cv.width,cv.height);
    const tex=keep(new THREE.CanvasTexture(cv));tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestMipmapLinearFilter;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    m=keep(new THREE.MeshStandardMaterial({map:tex,color:tint??'#ffffff',roughness:.9,metalness:0,alphaTest:.1,emissive:glow?'#ffffff':'#000000',emissiveMap:glow?tex:null,emissiveIntensity:glow}));tiles.set(id,m);return m;};
  const pick=(faces:{side:string;top?:string;bottom?:string;tint?:string;glow?:number},which:'side'|'top'|'bottom')=>which==='side'?faces.side:which==='top'?faces.top??faces.side:faces.bottom??faces.top??faces.side;
  const block:Kit['block']=(parent,w,h,d,faces,x=0,y=0,z=0)=>{const g=new THREE.BoxGeometry(w,h,d),uv=g.getAttribute('uv');
    // 盒子六个面：+x、-x、+y、-y、+z、-z，每面的贴图按面的实际尺寸重复。
    const size:[number,number][]=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]],which=['side','side','top','bottom','side','side'] as const;
    for(let f=0;f<6;f++)for(let i=f*4;i<f*4+4;i++)uv.setXY(i,uv.getX(i)*size[f][0],uv.getY(i)*size[f][1]);
    // 六个面同一张贴图时只用一个材质，合并静态物件时能和同材质的零件并成一次绘制。
    const names=which.map(wh=>pick(faces,wh)),m=new THREE.Mesh(g,names.every(n=>n===names[0])?tile(names[0],faces.tint,faces.glow):names.map(n=>tile(n,faces.tint,faces.glow)));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const painting:Kit['painting']=(parent,name,w,h,x=0,y=0,z=0,yaw=0,frame='block/spruce_planks')=>{const g=new THREE.Group(),tex=assets.textures.get('painting/'+name+'.png');block(g,w+.12,h+.12,.06,{side:frame});
    if(tex){tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.NearestFilter;tex.needsUpdate=true;g.add(mesh(new THREE.PlaneGeometry(w,h),keep(new THREE.MeshStandardMaterial({map:tex,roughness:.9})),0,0,.032,false));}
    g.position.set(x,y,z);g.rotation.y=yaw;parent.add(g);return g;};
  const blockCyl:Kit['blockCyl']=(parent,rt,rb,h,faces,x=0,y=0,z=0,seg=24)=>{const g=new THREE.CylinderGeometry(rt,rb,h,seg),uv=g.getAttribute('uv'),idx=g.getIndex()!,seen=new Set<number>();
    // 侧面绕一圈按周长重复，顶面、底面按直径重复（每个顶点只属于一个面）。
    for(const gr of g.groups)for(let i=gr.start;i<gr.start+gr.count;i++){const v=idx.getX(i);if(seen.has(v))continue;seen.add(v);const r=gr.materialIndex===1?rt:rb;
      if(gr.materialIndex===0)uv.setXY(v,uv.getX(v)*Math.PI*2*Math.max(rt,rb),uv.getY(v)*h);else uv.setXY(v,uv.getX(v)*2*r,uv.getY(v)*2*r);}
    const names=[faces.side,faces.top??faces.side,faces.bottom??faces.top??faces.side],m=new THREE.Mesh(g,names.every(n=>n===names[0])?tile(names[0],faces.tint,faces.glow):names.map(n=>tile(n,faces.tint,faces.glow)));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  return {block,blockCyl,painting};
}
