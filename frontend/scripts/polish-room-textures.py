"""Sharpen an AI-generated room GLB without touching its architecture.

Run once against the original GLB (the script refuses an already finished room):
  blender -b -t 4 --python-exit-code 1 -P scripts/polish-room-textures.py -- \
    --source ORIGINAL.glb --palette ../public/scenes/scene-office.png

What it does, following the 精模 recipe (see public/models/README.md):
  - deletes tiny disconnected noise islands,
  - snaps every baseColor texel to a palette median-cut from the room's own
    pixel scene image, and switches the map to nearest-neighbour sampling,
  - disconnects normal / metallic / roughness maps (the soft "AI painting"
    shading they bake in) and forces an unlit-feeling matte material.

Geometry, UVs and the seat layout are left untouched.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--palette", type=Path, required=True, help="pixel scene image to cut the palette from")
    parser.add_argument("--colors", type=int, default=16)
    parser.add_argument("--dedupe", type=float, default=0.09, help="palette 去重的感知距离阈值")
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def cut_palette(image, wanted, dedupe):
    """Median-cut the pixel scene into a small palette, like the 精模 recipe."""
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    # Blender 5.2 的 image.pixels 对 8 位图返回的就是 sRGB 原始值（实测采样验证过），
    # 不再做线性↔sRGB 转换：两次转换会把整块调色板压暗、暗部挤成一团丢色相
    rgb = np.clip(pixels.reshape(height, width, 4)[:, :, :3], 0, 1)
    # 精模的做法：中位切分到约 3×wanted 个箱，再按感知距离去重
    box = rgb[::4, ::4].reshape(-1, 3)
    palettes = [box]
    while len(palettes) < wanted * 3:
        palettes.sort(key=lambda b: -np.ptp(b, axis=0).max())
        widest = palettes.pop(0)
        channel = int(np.argmax(np.ptp(widest, axis=0)))
        split = np.median(widest[:, channel])
        left, right = widest[widest[:, channel] <= split], widest[widest[:, channel] > split]
        if not len(left) or not len(right):
            palettes.append(widest)
            break
        palettes += [left, right]
    # 按像素数量从多到少去重：地毯、桌面这些大色块先保住名额，碎色靠后
    colors = sorted(((b.mean(axis=0), len(b)) for b in palettes), key=lambda cb: -cb[1])

    kept = []
    for color, _ in colors:
        if all(np.linalg.norm(color - other) > dedupe for other in kept):
            kept.append(color)
        if len(kept) >= wanted:
            break
    return np.array(kept)


def augment_shadows(palette, dedupe=0.02):
    """给像素数最多的几个色块补 0.8 / 0.6 两档暗色。

    AI 原画的烘焙阴影因此吸到「同色相的暗色调」上（经典像素画的两档明暗），
    而不是吸附到描边的墨色上形成斑块。"""
    shades = [color * factor for color in palette[:8] for factor in (0.8, 0.6)]
    merged = [np.asarray(color) for color in list(palette) + shades]
    kept = []
    for color in merged:
        if all(np.linalg.norm(color - other) > dedupe for other in kept):
            kept.append(color)
    return np.array(kept)


def snap_to_palette(image, palette):
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    source = values.reshape(height, width, 4)
    rgb = np.clip(source[:, :, :3], 0, 1)
    result = np.empty_like(rgb)
    for row in range(0, height, 128):
        count = min(128, height - row)
        block = rgb[row:row + count].reshape(-1, 1, 3)
        distances = ((block - palette.reshape(1, -1, 3)) ** 2).sum(axis=2)
        nearest = palette[distances.argmin(axis=1)]
        result[row:row + count] = nearest.reshape(count, width, 3)
    changed = int((np.abs(result - rgb).max(axis=2) > 0.02).sum())
    source[:, :, :3] = result
    image.pixels.foreach_set(source.ravel())
    image.update()
    image.pack()
    return changed


def polish_texture(image):
    """Remove isolated atlas speckles, keeping three-pixel-wide edges intact."""
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    source = values.reshape(height, width, 4)
    padded = np.pad(source[:, :, :3], ((1, 1), (1, 1), (0, 0)), mode="edge")
    result = source.copy()
    changed = 0
    for row in range(0, height, 64):
        count = min(64, height - row)
        neighbours = np.stack([
            padded[row + dy:row + dy + count, dx:dx + width]
            for dy in range(3) for dx in range(3)
        ])
        median = np.partition(neighbours, 4, axis=0)[4]
        center = source[row:row + count, :, :3]
        matching = np.sum(np.max(np.abs(neighbours - center), axis=3) < 0.025, axis=0)
        isolated = (matching <= 2) & (np.max(np.abs(median - center), axis=2) > 0.04)
        result[row:row + count, :, :3] = np.where(isolated[:, :, None], median, center)
        changed += int(np.sum(isolated))
    image.pixels.foreach_set(result.ravel())
    image.update()
    image.pack()
    return changed


def main():
    args = arguments()
    output = args.output or args.source
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected a single fused mesh, got {len(meshes)}")
    room = meshes[0]
    if any(o.name.startswith("SM_Finish_") for o in bpy.context.scene.objects):
        raise RuntimeError("This room has already been refined.")
    room.data.calc_loop_triangles()
    before_triangles = len(room.data.loop_triangles)

    # 1) 删掉太小的孤立碎片（房间最长边约 1.9，2cm 的碎片只可能是生成噪点）
    removed = {"islands": 0, "triangles": 0}
    bm = bmesh.new()
    bm.from_mesh(room.data)
    parent = list(range(len(bm.verts)))
    index = {v: i for i, v in enumerate(bm.verts)}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for edge in bm.edges:
        a, b = find(index[edge.verts[0]]), find(index[edge.verts[1]])
        if a != b:
            parent[a] = b
    groups = {}
    for i, vertex in enumerate(bm.verts):
        groups.setdefault(find(i), []).append(vertex)
    drop_faces = []
    for vertices in groups.values():
        # 房间主体是个大岛（几万顶点），只检查小岛；对角线只在小岛上算，避免 O(n²) 扫到大岛
        if len(vertices) > 64:
            continue
        faces = {face for vertex in vertices for face in vertex.link_faces}
        if not faces:
            continue
        points = [v.co for v in vertices]
        diagonal = max((a - b).length for a in points for b in points)
        if diagonal < 0.02 and len(faces) < 24:
            drop_faces.extend(faces)
            removed["islands"] += 1
            removed["triangles"] += sum(len(face.verts) - 2 for face in faces)
    if drop_faces:
        bmesh.ops.delete(bm, geom=list(set(drop_faces)), context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(room.data)
    bm.free()
    room.data.update()

    # 2) 贴图：吸附调色板 + 最近邻采样；断开法线/金属度/粗糙度
    palette_image = bpy.data.images.load(str(args.palette.resolve()))
    palette = augment_shadows(cut_palette(palette_image, args.colors, args.dedupe))
    bpy.data.images.remove(palette_image)
    mat = room.data.materials[0]
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for socket in ("Normal", "Metallic", "Roughness"):
        for link in list(shader.inputs[socket].links):
            mat.node_tree.links.remove(link)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 0.9
    texture = next(link.from_node for link in shader.inputs["Base Color"].links if link.from_node.type == "TEX_IMAGE")
    texture.interpolation = "Closest"
    snapped = snap_to_palette(texture.image, palette)
    speckles = polish_texture(texture.image)

    room.data.calc_loop_triangles()
    after_triangles = len(room.data.loop_triangles)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output.resolve()), export_format="GLB",
                              export_materials="EXPORT", export_animations=False,
                              export_extras=True, export_yup=True)
    report = {
        "source": args.source.name, "palette_colors": len(palette),
        "source_triangles": before_triangles, "triangles": after_triangles,
        "removed_islands": removed["islands"], "removed_triangles": removed["triangles"],
        "snapped_texels": snapped, "speckle_texels": speckles,
        "output": str(output), "output_bytes": output.stat().st_size,
    }
    print("POLISH_REPORT " + json.dumps(report))


if __name__ == "__main__":
    main()
