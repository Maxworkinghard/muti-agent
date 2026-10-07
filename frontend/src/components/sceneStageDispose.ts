import { Group, Mesh, Texture } from 'three';

/** 释放模型占用的 GPU 资源：几何体、材质，以及材质里引用到的贴图（去重后各释放一次） */
export function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}
