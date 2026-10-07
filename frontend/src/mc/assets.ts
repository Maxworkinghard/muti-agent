import * as THREE from 'three';
export interface ModelFace { texture: string; uv?: number[]; rotation?: number; cullface?: string; tintindex?: number }
export interface ModelElement { from: number[]; to: number[]; rotation?: { origin: number[]; axis: 'x'|'y'|'z'; angle: number; rescale?: boolean }; shade?: boolean; light_emission?: number; faces: Record<string,ModelFace> }
export interface Model { parent?: string; textures?: Record<string,string|{sprite:string;force_translucent?:boolean}>; elements?: ModelElement[]; ambientocclusion?: boolean; display?: Record<string,{rotation?:number[];translation?:number[];scale?:number[]}> }
export interface ModelRef { model: string; x?: number; y?: number; uvlock?: boolean; weight?: number }
export interface BlockState { variants?: Record<string,ModelRef|ModelRef[]>; multipart?: Array<{when?: Record<string,unknown>;apply:ModelRef|ModelRef[]}> }
export interface AtlasTile { x:number;y:number;width:number;height:number;alpha:'opaque'|'cutout'|'translucent';animation?:{width?:number;height?:number;frametime?:number;frames?:Array<number|{index:number;time:number}>;interpolate?:boolean} }
export interface Atlas { width:number;height:number;textures:Record<string,AtlasTile> }
export type MaterialPack='original'|'hd'|'style';
export interface Manifest {version:string;jarSha1:string;blocks:string;items:string;atlas:string;atlasIndex:string;itemAtlas:string;itemAtlasIndex:string;font:string;textures:string[];sounds:Record<string,string[]>;counts:Record<string,number>;material?:MaterialPack}
interface HdManifest {pack:string;resolution:number;atlas:string;normal?:string;orm?:string;atlasIndex:string;textures:number;credit:string;entities?:Record<string,string>}
export interface Assets {manifest:Manifest;states:Record<string,BlockState>;models:Record<string,Model>;itemModels:Record<string,Model>;items:Record<string,unknown>;atlas:Atlas;atlasTexture:THREE.Texture;
  /** 高清材质包的法线、粗糙度/金属度贴图；没有导入高清时为 null，方块按原版的平面材质画 */normalTexture:THREE.Texture|null;ormTexture:THREE.Texture|null;
  /** 页面上显示实际加载的材质署名，包括回退后的原版。 */credit:string|null;
  itemAtlas:Atlas;itemTexture:THREE.Texture;textures:Map<string,THREE.Texture>;lightTexture:THREE.DataTexture;dispose():void}
export const assetId=(id:string)=>id.replace(/^minecraft:/,'');
async function getJson<T>(p:string):Promise<T>{const r=await fetch('/mc/'+p);if(!r.ok)throw new Error('缺少游戏资源：/mc/'+p);return r.json();}
async function optionalPack(folder:string):Promise<HdManifest|null>{
  try{const p=await getJson<HdManifest>(folder+'/manifest.json');const files=[p.atlas,p.atlasIndex,p.normal,p.orm,...Object.values(p.entities??{})].filter((x):x is string=>!!x);
    const found=await Promise.all(files.map(async x=>{const r=await fetch('/mc/'+x,{method:'HEAD'}),type=r.headers.get('content-type')??'';return r.ok&&(x.endsWith('.json')?type.includes('json'):type.startsWith('image/'));}));return found.every(Boolean)?p:null;
  }catch{return null;}
}
function texture(loader:THREE.TextureLoader,p:string,color=true):Promise<THREE.Texture>{return new Promise((resolve,reject)=>loader.load('/mc/'+p,t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapNearestFilter;t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;resolve(t);},undefined,()=>reject(new Error('缺少游戏贴图：/mc/'+p))));}
/** 每张贴图各自缩小，四周补一圈边，远处缩小采样时不和相邻贴图串色。 */
function tileMipmaps(texture:THREE.Texture,atlas:Atlas){
  const source=texture.image as CanvasImageSource;const mipmaps:HTMLCanvasElement[]=[];
  for(let level=0;level<=Math.ceil(Math.log2(Math.max(atlas.width,atlas.height)));level++){
    const scale=2**level,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(atlas.width/scale));canvas.height=Math.max(1,Math.floor(atlas.height/scale));const c=canvas.getContext('2d')!;
    if(level===0)c.drawImage(source,0,0);else for(const t of Object.values(atlas.textures)){
      const x=Math.floor(t.x/scale),y=Math.floor(t.y/scale),w=Math.max(1,Math.floor(t.width/scale)),h=Math.max(1,Math.floor(t.height/scale));
      c.drawImage(source,t.x,t.y,t.width,t.height,x,y,w,h);
      c.drawImage(source,t.x,t.y,1,t.height,x-1,y,1,h);c.drawImage(source,t.x+t.width-1,t.y,1,t.height,x+w,y,1,h);
      c.drawImage(source,t.x,t.y,t.width,1,x,y-1,w,1);c.drawImage(source,t.x,t.y+t.height-1,t.width,1,x,y+h,w,1);
      for(const [xx,yy] of [[0,0],[1,0],[0,1],[1,1]])c.drawImage(source,t.x+xx*(t.width-1),t.y+yy*(t.height-1),1,1,x+(xx?w:-1),y+(yy?h:-1),1,1);
    }
    mipmaps.push(canvas);
  }
  texture.mipmaps=mipmaps;texture.generateMipmaps=false;texture.needsUpdate=true;
}
export async function loadAssets(progress:(n:number,s:string)=>void,anisotropy=1,material?:MaterialPack,extraTextures:string[]=[]):Promise<Assets>{
  progress(.05,'读取方块');let manifest:Manifest;
  try{manifest=await getJson<Manifest>('manifest.json');}catch{throw new Error('还没导入游戏资源：在 frontend 目录运行 npm run mc:import');}
  // 高清材质可选：读不到就用原版，不报错（第 11.3 节）。
  const chosen=material??manifest.material??'hd';
  const hd=chosen==='original'?null:await optionalPack('hd');
  const style=chosen==='style'?await optionalPack('style'):null;
  const pack=style??hd;
  const [blocks,items,atlas,itemAtlas]=await Promise.all([getJson<{states:Assets['states'];models:Assets['models']}>(manifest.blocks),getJson<{items:Assets['items'];models:Assets['itemModels']}>(manifest.items),getJson<Atlas>(pack?pack.atlasIndex:manifest.atlasIndex),getJson<Atlas>(manifest.itemAtlasIndex)]);
  const loader=new THREE.TextureLoader();
  const used=['painting/sunset.png','painting/sea.png','entity/player/wide/steve.png','environment/clouds.png','entity/banner/banner_base.png','entity/banner/gradient_up.png','entity/banner/curly_border.png','entity/banner/rhombus.png','entity/banner/circle.png','entity/cat/cat_tabby.png','entity/parrot/parrot_red_blue.png','particle/angry.png','particle/glint.png','particle/drip_hang.png','particle/drip_fall.png','particle/note.png',...Array.from({length:8},(_,i)=>'particle/generic_'+i+'.png')];
  used.push(...extraTextures.filter(p=>!used.includes(p)));
  const [atlasTexture,itemTexture,normalTexture,ormTexture,...images]=await Promise.all([texture(loader,pack?pack.atlas:manifest.atlas),texture(loader,manifest.itemAtlas),pack?.normal?texture(loader,pack.normal,false):Promise.resolve(null),pack?.orm?texture(loader,pack.orm,false):Promise.resolve(null),...used.map(p=>texture(loader,hd?.entities?.[p]??'textures/'+p))]);
  const textures=new Map(used.map((p,i)=>[p,images[i]]));progress(.55,'生成光照');
  for(const t of [atlasTexture,normalTexture,ormTexture]){if(!t)continue;tileMipmaps(t,atlas);t.minFilter=pack===hd&&hd?THREE.LinearMipmapLinearFilter:THREE.NearestMipmapNearestFilter;t.anisotropy=pack===hd&&hd?anisotropy:1;}
  tileMipmaps(itemTexture,itemAtlas);
  const font=new FontFace('MCFont','url(/mc/'+manifest.font+')');await font.load();document.fonts.add(font);
  const lightTexture=new THREE.DataTexture(new Uint8Array(16*16*4),16,16);lightTexture.colorSpace=THREE.NoColorSpace;lightTexture.magFilter=THREE.LinearFilter;lightTexture.minFilter=THREE.LinearFilter;
  return {manifest,...blocks,itemModels:items.models,items:items.items,atlas,atlasTexture,normalTexture,ormTexture,credit:pack?.credit??'原版 16×16',itemAtlas,itemTexture,textures,lightTexture,dispose(){for(const t of [atlasTexture,itemTexture,normalTexture,ormTexture])t?.dispose();lightTexture.dispose();textures.forEach(t=>t.dispose());document.fonts.delete(font);}};
}
