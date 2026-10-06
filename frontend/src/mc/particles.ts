import * as THREE from 'three';
import type {Assets} from './assets';
interface Particle {position:THREE.Vector3;born:number;kind:string;offset:number;seed:number}
export function createParticles(assets:Assets){
  const names=['angry','glint','drip_hang','drip_fall',...Array.from({length:8},(_,i)=>'generic_'+i),'note'];const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  names.forEach((n,i)=>c.drawImage(assets.textures.get('particle/'+n+'.png')!.image as CanvasImageSource,i%8*32,Math.floor(i/8)*32,32,32));
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.BufferGeometry(),material=new THREE.ShaderMaterial({uniforms:{atlas:{value:texture},scale:{value:420}},vertexShader:'attribute vec4 tile; attribute vec4 tint; attribute float pSize; varying vec4 vTile; varying vec4 vTint; void main(){vTile=tile;vTint=tint;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=pSize*420./-mv.z;}',fragmentShader:'uniform sampler2D atlas;varying vec4 vTile;varying vec4 vTint;void main(){vec4 c=texture2D(atlas,vTile.xy+vec2(gl_PointCoord.x,1.-gl_PointCoord.y)*vTile.zw)*vTint;if(c.a<.02)discard;gl_FragColor=c;}',transparent:true,depthWrite:false});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;let particles:Particle[]=[];
  return {points,spawn(position:THREE.Vector3,kind:string,now:number){
    // 烟花：一蓬多彩的小点从原地炸开再落下（第 12.7 节，结果庆祝）。
    if(kind==='firework'){for(let i=0;i<18;i++)particles.push({position:position.clone(),born:now+(i%3)*90,kind,offset:i,seed:(i*29+now)%101/101});particles=particles.slice(-128);return;}
    for(let i=0;i<4;i++)particles.push({position:position.clone().add(new THREE.Vector3((i-1.5)*.2,.05,(i%2-.5)*.2)),born:now+i*80,kind,offset:i,seed:(i*17+now)%101/101});particles=particles.slice(-128);},
    update(now:number){particles=particles.filter(p=>now-p.born<(p.kind==='firework'?2200:1400));const pos:number[]=[],tint:number[]=[],tile:number[]=[],sizes:number[]=[];const FIRE_COLORS=['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#FF9F45'];
    for(const p of particles){
      if(p.kind==='firework'){const t=Math.max(0,now-p.born)/2200;if(now<p.born)continue;const a=p.offset*2.399+p.seed*6.28,speed=.55+p.seed*.5;const v=p.position.clone();v.x+=Math.cos(a)*speed*t*2.2;v.z+=Math.sin(a)*speed*t*2.2;v.y+=t<.35?t*3.2:1.12-(t-.35)*2.2;const color=new THREE.Color(FIRE_COLORS[p.offset%6]);pos.push(v.x,v.y,v.z);tint.push(color.r,color.g,color.b,Math.sin(t*Math.PI)*(1-t*.4));tile.push(1/8,1-(1+1)/2,1/8,1/2);sizes.push(.22);continue;}
      const t=Math.max(0,now-p.born)/1400;if(now<p.born)continue;const v=p.position.clone();v.y+=p.kind==='water'?(t<.2?0:-(t-.2)*1.3):t*.7;const index=p.kind==='angry'?0:p.kind==='glint'?1:p.kind==='water'?(t<.2?2:3):p.kind==='note'?12:4+Math.min(7,Math.floor(t*8));const color=p.kind==='note'?new THREE.Color().setHSL(p.seed,.7,.55):new THREE.Color(p.kind==='glint'?'#65D75A':p.kind==='water'?'#3F76E4':p.kind==='smoke'?'#777777':'#FFFFFF');pos.push(v.x,v.y,v.z);tint.push(color.r,color.g,color.b,p.kind==='glint'?Math.sin(t*Math.PI)*(1-t):1-t);tile.push(index%8/8,1-(Math.floor(index/8)+1)/2,1/8,1/2);sizes.push(p.kind==='smoke'?.2+t*.25:.28);}
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('tile',new THREE.Float32BufferAttribute(tile,4));geometry.setAttribute('tint',new THREE.Float32BufferAttribute(tint,4));geometry.setAttribute('pSize',new THREE.Float32BufferAttribute(sizes,1));},dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
