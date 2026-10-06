import * as THREE from 'three';
/** 将同材质、同形状的活动零件实例化，保留原层级用于椅子、手里的卡片和笔的动作。 */
export function batchMovingParts(scene:THREE.Scene,roots:THREE.Object3D[]){
  const root=new THREE.Group();root.name='batched-props';scene.add(root);
  const buckets=new Map<string,THREE.Mesh[]>();
  const hash=(g:THREE.BufferGeometry)=>{
    let h=2166136261;
    for(const name of Object.keys(g.attributes).sort()){const a=g.getAttribute(name);for(let i=0;i<a.array.length;i++){h=Math.imul(h^Math.round(Number(a.array[i])*100000),16777619);}}
    if(g.index)for(const n of g.index.array)h=Math.imul(h^n,16777619);
    return g.getAttribute('position').count+':'+h;
  };
  for(const root of roots)root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o instanceof THREE.SkinnedMesh||Array.isArray(o.material)||o.material instanceof THREE.ShaderMaterial||o.children.length||o.renderOrder)return;
    const key=o.material.uuid+':'+o.castShadow+':'+hash(o.geometry),list=buckets.get(key)??[];list.push(o);buckets.set(key,list);});
  const batches:Array<{mesh:THREE.InstancedMesh;sources:THREE.Mesh[]}>=[];
  for(const sources of buckets.values()){if(sources.length<2)continue;const first=sources[0],material=first.material as THREE.Material,mesh=new THREE.InstancedMesh(first.geometry,material,sources.length);mesh.name='batched-'+material.type;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);sources.forEach(o=>o.visible=false);root.add(mesh);batches.push({mesh,sources});}
  const visible=(o:THREE.Object3D)=>{for(let p=o.parent;p;p=p.parent)if(!p.visible)return false;return true;};
  return {root,update(){scene.updateMatrixWorld(true);for(const {mesh,sources} of batches){let count=0;for(const o of sources)if(visible(o))mesh.setMatrixAt(count++,o.matrixWorld);mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}},dispose(){for(const {mesh} of batches)mesh.dispose();root.removeFromParent();}};
}
