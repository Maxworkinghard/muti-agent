import * as THREE from 'three';
import type {Assets} from './assets';
import type {Room} from './rooms/debate';
import type {DirectorState} from './director';
/** 游戏里由代码画的方块：现在只剩队旗（钟、讲台的书、告示牌在第二轮换成了写实物品）。 */
function texturedBox(size:number[],center:number[],material:THREE.Material,uvOrigin:number[],sheet:number[]){
  const [w,h,d]=size,[u,v]=uvOrigin,g=new THREE.BoxGeometry(w/16,h/16,d/16);g.translate(...center as [number,number,number]);const uv=g.getAttribute('uv'),rects=[[u+d+w,v+d,d,h],[u,v+d,d,h],[u+d,v,w,d],[u+d+w,v,w,d],[u+d,v+d,w,h],[u+2*d+w,v+d,w,h]];
  for(let f=0;f<6;f++){const [x,y,ww,hh]=rects[f];for(let j=0;j<4;j++){const i=f*4+j;uv.setXY(i,(x+uv.getX(i)*ww)/sheet[0],1-(y+(1-uv.getY(i))*hh)/sheet[1]);}}
  const mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export function createEntities(assets:Assets,room:Room){
  const root=new THREE.Group(),banners:THREE.Mesh[]=[],owned:Array<THREE.Texture|THREE.Material>=[];
  for(const b of room.banners){
    const canvas=document.createElement('canvas'),density=assets.credit?4:1;canvas.width=canvas.height=64*density;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
    const layers=[['banner_base',b.side==='pro'?'#3C44AA':'#B02E26'],['gradient_up',b.side==='pro'?'#3AB3DA':'#F38BAA'],['curly_border','#F9FFFE'],['rhombus','#F9FFFE'],['circle',b.side==='pro'?'#3C44AA':'#B02E26']];
    for(const [name,color] of layers){const temp=document.createElement('canvas');temp.width=temp.height=canvas.width;const tc=temp.getContext('2d')!;tc.drawImage(assets.textures.get('entity/banner/'+name+'.png')!.image as CanvasImageSource,0,0,temp.width,temp.height);tc.globalCompositeOperation='source-in';tc.fillStyle=color;tc.fillRect(0,0,temp.width,temp.height);c.drawImage(temp,0,0);}
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;owned.push(t);
    const material=new THREE.MeshStandardMaterial({map:t,alphaTest:.1,side:THREE.DoubleSide,roughness:.95,envMapIntensity:0});owned.push(material);
    const flag=texturedBox([20,40,1],[0,-1.25,0],material,[0,0],[64,64]);flag.position.set(...b.position);flag.rotation.y=b.yaw;root.add(flag);banners.push(flag);
  }
  return {root,update(s:DirectorState){for(const flag of banners)flag.rotation.x=s.reduced?0:Math.sin(s.now/5000*Math.PI*2)*.055;},dispose(){owned.forEach(o=>o.dispose());root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}};
}
