"""Prepare Meshy room GLBs for the web without changing the source files.

Run with Blender in background mode:
  blender -b -t 4 -P scripts/prepare-3d-scenes.py -- --source <3d-models-directory>
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target-triangles", type=int, default=180_000)
    parser.add_argument("--texture-size", type=int, default=2048)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def triangle_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def render_preview(meshes, output):
    scene = bpy.context.scene
    points = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) / 2
    size = high - low
    camera_data = bpy.data.cameras.new("CAM_ScenePreview")
    camera = bpy.data.objects.new("CAM_ScenePreview", camera_data)
    scene.collection.objects.link(camera)
    camera.location = center + Vector((size.x * 0.12, -size.length * 0.9, size.length * 1.1))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    scene.camera = camera
    bpy.context.view_layer.update()
    local = [camera.matrix_world.inverted() @ p for p in points]
    x_range = max(p.x for p in local) - min(p.x for p in local)
    y_range = max(p.y for p in local) - min(p.y for p in local)
    camera_data.ortho_scale = max(x_range, y_range * 1.5) * 1.12
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.5
    world = bpy.data.worlds.new("World_Preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.14, 0.13, 0.17, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = world
    for name, position, energy in (
        ("Key", (-2, -3, 5), 450),
        ("Fill", (3, 1, 4), 250),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = 4
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(output.with_name(output.stem + "-preview.png"))
    bpy.ops.render.render(write_still=True)


def prepare(name, source, output, target_triangles, texture_size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{name}: no mesh imported")

    before = sum(triangle_count(obj.data) for obj in meshes)
    ratio = min(1.0, target_triangles / before)
    if ratio < 1.0:
        for obj in meshes:
            modifier = obj.modifiers.new("Web scene LOD", "DECIMATE")
            modifier.ratio = ratio
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    resized = []
    for image in bpy.data.images:
        if image.type == "IMAGE" and max(image.size) > texture_size:
            width, height = image.size
            scale = texture_size / max(width, height)
            image.scale(round(width * scale), round(height * scale))
            image.pack()
            resized.append(image.name)

    after = sum(triangle_count(obj.data) for obj in meshes)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_animations=False,
    )
    print(json.dumps({
        "scene": name,
        "source_triangles": before,
        "triangles": after,
        "resized_images": resized,
        "output_bytes": output.stat().st_size,
    }))
    render_preview(meshes, output)


def main():
    args = arguments()
    output_dir = Path(__file__).resolve().parents[1] / "public" / "models"
    for name in ("scene-roundtable", "scene-debate", "scene-office"):
        source = args.source / name / f"{name}.glb"
        if not source.is_file():
            raise FileNotFoundError(source)
        prepare(name, source, output_dir / f"{name}.glb", args.target_triangles, args.texture_size)


if __name__ == "__main__":
    main()
