"""Straighten the AI-warped walls of a polished room GLB.

Run after polish-room-textures.py (textures are untouched):
  blender -b -t 4 --python-exit-code 1 -P scripts/polish-room-geometry.py -- \
    --source ROOM.glb

The Meshy rooms' walls lean and bulge (baked-in perspective). For each of the
four sides this script fits a vertical plane to the wall faces, then shifts
every vertex in the side's band by the plane's local deviation from the wall's
median position. Flat deviations (window recesses, trim offsets, furniture
standing against the wall) are preserved — only the low-frequency warp is
removed. Floors, ceilings and interior geometry outside the bands are untouched.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def fit_plane_u(points):
    """最小二乘拟合 u = a + b*v + c*w，返回 (a, b, c) 与残差中位绝对值。"""
    array = np.array([[1.0, p[0], p[1]] for p in points])
    targets = np.array([p[2] for p in points])
    coef, *_ = np.linalg.lstsq(array, targets, rcond=None)
    residuals = array @ coef - targets
    mad = float(np.median(np.abs(residuals - np.median(residuals))))
    return coef, mad


def main():
    args = arguments()
    output = args.output or args.source
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected a single fused mesh, got {len(meshes)}")
    room = meshes[0]
    matrix = room.matrix_world
    inverse = matrix.inverted()

    bm = bmesh.new()
    bm.from_mesh(room.data)
    bm.faces.ensure_lookup_table()
    matrix3 = matrix.to_3x3()

    world_centers = []
    world_normals = []
    areas = []
    for face in bm.faces:
        center = matrix @ face.calc_center_median()
        normal = (matrix3 @ face.normal).normalized()
        world_centers.append(center)
        world_normals.append(normal)
        areas.append(face.calc_area())
    centers = np.array([tuple(c) for c in world_centers])
    normals = np.array([tuple(n) for n in world_normals])
    areas = np.array(areas)

    # 边界用顶点而不是面心：外伸的小物件（植物叶子）会把面心边界推出去，让墙落到带外
    all_verts = np.array([tuple(matrix @ v.co) for v in bm.verts])
    bounds_low = all_verts.min(axis=0)
    bounds_high = all_verts.max(axis=0)
    size = bounds_high - bounds_low
    max_warp = max(size[0], size[1]) * 0.05

    # 四个侧边：min/max x（左右）与 min/max y（前后）。u 是墙面法向轴，(v, w) 是面内两轴。
    sides = {
        "left": (0, bounds_low[0], +1.0),
        "right": (0, bounds_high[0], -1.0),
        "front": (1, bounds_low[1], +1.0),
        "back": (1, bounds_high[1], -1.0),
    }

    report = {}
    for name, (axis, extreme, inward) in sides.items():
        # 带内、法线朝屋内、接近竖直的面才算这面墙的；墙被外伸物推出带外时逐级加宽带重试
        facing = normals[:, axis] * inward > 0.5
        vertical = np.abs(normals[:, 2]) < 0.5
        selected = np.array([], dtype=int)
        for widen in (1.0, 2.5, 5.0):
            band = max(size[0], size[1]) * 0.03 * widen
            distance = extreme - centers[:, axis]
            in_band = (distance >= -band * 0.5) & (distance <= band)
            selected = np.where(in_band & facing & vertical)[0]
            if len(selected) >= 8:
                break
        if len(selected) < 8:
            report[name] = {"faces": int(len(selected)), "skipped": "too few faces"}
            continue
        face_verts = []
        for index in selected:
            face_verts.append(bm.faces[int(index)])
        primary_areas = areas[selected]
        threshold = np.percentile(primary_areas, 60)
        primary_indices = [i for i, index in enumerate(selected) if areas[index] >= threshold]
        if len(primary_indices) < 8:
            primary_indices = list(range(len(selected)))
        # 拟合平面用主面的面心：坐标重排为 (v, w, u)
        v_axis, w_axis = [a for a in (0, 1, 2) if a != axis]
        fit_points = [(centers[index][v_axis], centers[index][w_axis], centers[index][axis]) for index in selected[primary_indices]]
        coef, mad = fit_plane_u(fit_points)
        # 两轮：剔除离群值再拟合一次
        array = np.array([[1.0, p[0], p[1]] for p in fit_points])
        targets = np.array([p[2] for p in fit_points])
        inliers = np.abs(array @ coef - targets) < max(mad * 4, band * 0.15)
        if inliers.sum() >= 8:
            coef, mad = fit_plane_u([p for p, keep in zip(fit_points, inliers) if keep])
        if mad > max(size[0], size[1]) * 0.015:
            report[name] = {"faces": int(len(selected)), "skipped": f"plane fit too noisy (mad {mad:.4f})"}
            continue
        median_u = float(np.median(centers[selected][:, axis]))

        # 每个顶点的修正量 = 平面在该 (v, w) 处的位置 − 墙的中位位置；夹到 max_warp 内
        # 邻面全在带内（朝向/竖直同判定）才允许移动；与带外几何共享的顶点保持不动，融合网格不会被拉裂
        movable_keys = set()
        for face in face_verts:
            for vertex in face.verts:
                key = vertex.index
                if key in movable_keys:
                    continue
                linked_ok = True
                for linked in vertex.link_faces:
                    linked_center = matrix @ linked.calc_center_median()
                    linked_normal = (matrix3 @ linked.normal).normalized()
                    d = extreme - linked_center[axis]
                    if not (d >= -band * 0.5 and d <= band and linked_normal[axis] * inward > 0.5 and abs(linked_normal[2]) < 0.5):
                        linked_ok = False
                        break
                if linked_ok:
                    movable_keys.add(key)
        vertex_deltas = {}
        warp_values = []
        index_to_vert = {v.index: v for v in bm.verts}
        for key in movable_keys:
            vertex = index_to_vert[key]
            world_point = matrix @ vertex.co
            v, w = world_point[v_axis], world_point[w_axis]
            plane_u = coef[0] + coef[1] * v + coef[2] * w
            delta = plane_u - median_u
            delta = max(-max_warp, min(max_warp, delta))
            vertex_deltas[key] = delta
            warp_values.append(abs(delta))
        for key, delta in vertex_deltas.items():
            if not delta:
                continue
            vertex = index_to_vert[key]
            world_point = matrix @ vertex.co
            world_point[axis] -= delta
            vertex.co = inverse @ world_point
        report[name] = {
            "faces": int(len(selected)),
            "primary_faces": int(len(primary_indices)),
            "vertices_moved": int(len(vertex_deltas)),
            "max_warp": round(float(np.max(warp_values)), 4) if warp_values else 0.0,
            "median_warp": round(float(np.median(warp_values)), 4) if warp_values else 0.0,
            "plane": [round(float(c), 4) for c in coef],
        }

    bm.to_mesh(room.data)
    bm.free()
    room.data.update()

    # 移动过顶点后清掉导入时的自定义法线，避免陈旧法线造成明暗条带
    for layer in list(room.data.attributes):
        if layer.name in {"custom_normal", ".custom_normal"} or "normal" in layer.name.lower():
            try:
                room.data.attributes.remove(layer)
            except Exception:
                pass

    bpy.ops.export_scene.gltf(filepath=str(output.resolve()), export_format="GLB",
                              export_materials="EXPORT", export_animations=False,
                              export_extras=True, export_yup=True)
    print("GEOMETRY_REPORT " + json.dumps({
        "source": args.source.name, "sides": report,
        "output": str(output), "output_bytes": output.stat().st_size,
    }))


if __name__ == "__main__":
    main()
