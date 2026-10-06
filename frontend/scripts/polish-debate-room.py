"""Rectify the Meshy room's architecture, retaining its furniture and seat layout.

Run once against an original GLB (the script refuses an already finished room):
  blender -b -t 4 -P scripts/polish-debate-room.py -- --source ORIGINAL.glb

The AI-generated shell is replaced with vertical walls and a level ceiling.
Furniture UVs remain intact. Ceiling and near walls are cut away in overview.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/models/scene-debate-meshy.glb")
    parser.add_argument("--report", type=Path)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name, hex_color, unlit=False):
    rgb = tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new("MAT_" + name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = 0.88
    shader.inputs["Metallic"].default_value = 0
    if unlit:
        nodes.remove(shader)
        shader = nodes.new("ShaderNodeEmission")
        shader.inputs["Color"].default_value = (*rgb, 1)
        output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
        mat.node_tree.links.new(shader.outputs[0], output.inputs["Surface"])
    mat.diffuse_color = (*rgb, 1)
    return mat


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
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    base = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if any(o.name.startswith("SM_Finish_") for o in base):
        raise RuntimeError("Use the original GLB; this room has already been refined.")
    if len(base) != 1:
        raise RuntimeError("Expected the original, single-mesh Meshy debate room.")
    room = base[0]
    room.data.calc_loop_triangles()
    original_triangles = len(room.data.loop_triangles)
    original_bounds = [room.matrix_world @ Vector(p) for p in room.bound_box]
    low = Vector(tuple(min(p[i] for p in original_bounds) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in original_bounds) for i in range(3)))
    # Source is in Blender's Z-up system; glTF's depth Z becomes Blender -Y.
    floor_height = -0.304
    ceiling_height = 0.050
    bm = bmesh.new()
    bm.from_mesh(room.data)
    remove = []
    for face in bm.faces:
        points = [room.matrix_world @ v.co for v in face.verts]
        center = sum(points, Vector()) / len(points)
        boundary = abs(center.x) > 0.735 or abs(center.y) > 0.735
        tall_shell = any(p.z > ceiling_height - 0.005 for p in points) and (abs(center.x) > 0.70 or abs(center.y) > 0.70)
        old_floor = max(p.z for p in points) < floor_height + 0.026 and abs(face.normal.z) > 0.55
        if boundary or tall_shell or old_floor:
            remove.append(face)
    removed_shell_triangles = len(remove)
    bmesh.ops.delete(bm, geom=remove, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(room.data)
    bm.free()
    # Remove the small baked slope in each long tabletop. This narrow height band
    # leaves the chairs, wood end blocks, microphones and the central lectern alone.
    leveled_vertices = 0
    inverse = room.matrix_world.inverted()
    for vertex in room.data.vertices:
        point = room.matrix_world @ vertex.co
        inner_edge = 0.4456 - point.y * 0.467
        if -0.03 < point.y < 0.36 and inner_edge - 0.006 < abs(point.x) < inner_edge + 0.16 and -0.227 < point.z < -0.210:
            point.z = -0.218
            vertex.co = inverse @ point
            leveled_vertices += 1
    room.data.update()
    room["roomMetrics"] = {"floor": floor_height, "ceiling": ceiling_height,
                           "eyeHeight": 0.168, "lookHeight": 0.168,
                           "seatLift": 0.0, "avatarHeight": 0.05}

    mat = room.data.materials[0]
    mat.name = "MAT_Room_PixelAtlas"
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for socket in ("Normal", "Metallic", "Roughness"):
        for link in list(shader.inputs[socket].links):
            mat.node_tree.links.remove(link)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 0.9
    texture = next(link.from_node for link in shader.inputs["Base Color"].links if link.from_node.type == "TEX_IMAGE")
    texture.interpolation = "Closest"
    cleaned = polish_texture(texture.image)

    collection = bpy.data.collections.new("COL_Debate_Finish")
    bpy.context.scene.collection.children.link(collection)
    colors = {
        "Carpet": material("Carpet_SeaGreen", "4e8179"),
        "Runner": material("Carpet_DeepGreen", "426f6c"),
        "Gold": material("Trim_Ochre", "c8aa70"),
        "Wood": material("Timber_Walnut", "654838"),
        "Dark": material("Ink_Charcoal", "353244"),
        "Blue": material("Team_Blue", "447da0"),
        "Red": material("Team_Terracotta", "a9574d"),
        "Cream": material("Ceiling_Parchment", "e6d3ae", True),
        "Ivory": material("Lamp_Ivory", "fff0c9", True),
        "Glass": material("Window_DustyBlue", "5c86a2"),
        "GlassShade": material("Window_ShadedBlue", "4b718e"),
        "Plaster": material("Wall_WarmPlaster", "dfcca8"),
        "Panel": material("Wall_OakPanel", "ba9367"),
        "Leaves": material("Plant_Sage", "477568"),
        "LeavesShade": material("Plant_Shadow", "365e52"),
    }

    # Connection map: carpet meets a solid level foundation; wall bottoms meet
    # floor_height; all wall tops meet ceiling_height. Rectangular windows fit
    # actual wall openings. The plaque and its lettering touch the back wall.
    # Ceiling beams overlap the level roof and lamps touch their mounts.
    # These dimensions use the source model's units, not a physical metre scale.
    active_wall = None
    def link_object(obj, ceiling=False):
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        obj["stageCeiling"] = ceiling
        if active_wall:
            obj["stageWall"] = active_wall
        return obj

    def cube(name, location, dimensions, mat, bevel=0, ceiling=False):
        bpy.ops.mesh.primitive_cube_add(size=2, location=location)
        obj = bpy.context.object
        obj.name = ("SM_Ceiling_" if ceiling else "SM_Finish_") + name
        obj.scale = Vector(dimensions) / 2
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(mat)
        if bevel:
            modifier = obj.modifiers.new("Soft crafted edges", "BEVEL")
            modifier.width = bevel
            modifier.segments = 2
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        return link_object(obj, ceiling)

    def mesh(name, vertices, faces, mat, ceiling=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(("SM_Ceiling_" if ceiling else "SM_Finish_") + name, data)
        collection.objects.link(obj)
        data.materials.append(mat)
        obj["stageCeiling"] = ceiling
        if active_wall:
            obj["stageWall"] = active_wall
        return obj

    def beam(name, a, b, width, depth, mat, ceiling=False):
        a, b = Vector(a), Vector(b)
        forward = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(forward.z) < 0.98 else Vector((1, 0, 0))
        right = forward.cross(up).normalized()
        up = right.cross(forward).normalized()
        vertices = [tuple(p + right * sx * width / 2 + up * sy * depth / 2)
                    for p in (a, b) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        return mesh(name, vertices, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat, ceiling)

    cube("Foundation", ((low.x + high.x) / 2, (low.y + high.y) / 2, (low.z + floor_height) / 2),
         (high.x - low.x, high.y - low.y, floor_height - low.z), colors["Dark"])
    # Leave a real surface offset above the foundation; coplanar surfaces flicker
    # and show large dark patches when the overview camera moves.
    cube("CarpetSurface", (0, 0.015, floor_height - 0.0015), (1.78, 1.79, 0.004), colors["Carpet"])
    cube("CenterRunner", (0, -0.075, floor_height + 0.0008), (0.47, 1.49, 0.0012), colors["Runner"])
    for half_x, half_y, center_y, label in ((0.815, 0.81, 0.015, "Outer"), (0.218, 0.723, -0.075, "Runner")):
        for x in (-half_x, half_x):
            cube(label + "Side", (x, center_y, floor_height + 0.0032), (0.003, half_y * 2, 0.0006), colors["Gold"])
        for y in (-half_y, half_y):
            cube(label + "End", (0, center_y + y, floor_height + 0.0032), (half_x * 2, 0.003, 0.0006), colors["Gold"])
    # Small woven geometric medallion in the aisle, away from every seat anchor.
    for radius, thickness in ((0.094, 0.003), (0.068, 0.002)):
        pts = [(math.sin(i * math.pi / 4) * radius, -0.40 + math.cos(i * math.pi / 4) * radius, floor_height + 0.0023) for i in range(8)]
        for i, p in enumerate(pts):
            beam("CarpetMedallion", p, pts[(i + 1) % 8], thickness, 0.0006, colors["Gold"])

    # Rebuild the original wall furniture rather than retaining pieces torn from
    # the fused shell. Shelf backs meet the wall, bench feet meet the floor.
    for center_x in (-0.635, 0.635):
        back_y, front_y = 0.910, 0.847
        cube("BookcaseBack", (center_x, back_y, floor_height + 0.075), (0.224, 0.007, 0.15), colors["Wood"])
        for dx in (-0.110, 0.110):
            cube("BookcaseSide", (center_x + dx, (back_y + front_y) / 2, floor_height + 0.075),
                 (0.009, back_y - front_y, 0.15), colors["Wood"])
        for row in range(4):
            z = floor_height + 0.006 + row * 0.046
            cube("Bookshelf", (center_x, (back_y + front_y) / 2, z), (0.228, back_y - front_y + 0.006, 0.007), colors["Wood"])
            if row == 3:
                continue
            for book in range(16):
                height = 0.025 + 0.004 * ((book + row) % 4)
                cube("Book", (center_x - 0.099 + book * 0.013, front_y + 0.011, z + 0.004 + height / 2),
                     (0.010, 0.027, height), colors[("Blue", "Gold", "Red", "Leaves", "GlassShade")[(book + row) % 5]])
                cube("BookSpineBand", (center_x - 0.099 + book * 0.013, front_y - 0.003, z + height * 0.7),
                     (0.007, 0.0012, 0.0015), colors["Gold"])
    for side in (-1, 1):
        for center_y in (-0.60, 0.16):
            center_x = side * 0.863
            seat_z = floor_height + 0.055
            cube("BenchSeat", (center_x, center_y, seat_z - 0.006), (0.077, 0.375, 0.012), colors["Wood"], 0.002)
            for y_offset in (-0.122, 0, 0.122):
                cube("BenchCushion", (center_x - side * 0.003, center_y + y_offset, seat_z + 0.005),
                     (0.068, 0.112, 0.010), colors["Red"], 0.003)
            cube("BenchBack", (side * 0.902, center_y, seat_z + 0.027), (0.008, 0.375, 0.058), colors["Wood"], 0.001)
            for y_offset in (-0.147, 0.147):
                for x_offset in (-0.024, 0.024):
                    cube("BenchLeg", (center_x + x_offset, center_y + y_offset, floor_height + 0.023),
                         (0.010, 0.010, 0.046), colors["Wood"], 0.001)
    for side in (-1, 1):
        for plant_y in (-0.83, -0.18, 0.76):
            plant_x = side * 0.825
            pot_z = floor_height + 0.022
            cube("Planter", (plant_x, plant_y, pot_z), (0.041, 0.041, 0.044), colors["Gold"], 0.003)
            cube("PlanterRim", (plant_x, plant_y, floor_height + 0.043), (0.046, 0.046, 0.007), colors["Panel"], 0.001)
            cube("PlanterSoil", (plant_x, plant_y, floor_height + 0.047), (0.034, 0.034, 0.002), colors["Dark"])
            base = Vector((plant_x, plant_y, floor_height + 0.047))
            top = base + Vector((0, 0, 0.096))
            beam("PlantStem", base, top, 0.0025, 0.0025, colors["LeavesShade"])
            for leaf in range(8):
                angle = leaf * math.pi * 0.77
                start = base + Vector((0, 0, 0.024 + leaf * 0.008))
                direction = Vector((math.cos(angle), math.sin(angle), 0.5)).normalized()
                right = Vector((-math.sin(angle), math.cos(angle), 0))
                length = 0.045 if leaf < 5 else 0.035
                end = start + direction * length
                mid = start.lerp(end, 0.5)
                verts = [tuple(start), tuple(mid - right * 0.009), tuple(end),
                         tuple(mid + right * 0.009), tuple(mid + Vector((0, 0, 0.004)))]
                mesh("PlantLeaf", verts, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)],
                     colors["Leaves" if leaf % 2 == 0 else "LeavesShade"])

    # Inset colored fascia keeps the original wood end blocks and microphones.
    for side, team in ((-1, "Blue"), (1, "Red")):
        # Inner desk face measured by horizontal rays at height -0.255:
        # x = side * (0.4456 + 0.467 * glTF_depth). Move 8mm toward the aisle.
        a = Vector((side * 0.254, 0.392, -0.256))
        b = Vector((side * 0.480, -0.092, -0.256))
        beam(team + "Fascia", a, b, 0.007, 0.056, colors[team])
        beam(team + "GoldEdge", a + Vector((0, 0, 0.029)), b + Vector((0, 0, 0.029)), 0.008, 0.002, colors["Gold"])
        for t in (0.33, 0.67):
            p = a.lerp(b, t)
            cube(team + "PanelJoin", p, (0.003, 0.004, 0.052), colors["Gold"])

    active_wall = "back"
    cube("BackBoard", (0, 0.891, -0.145), (0.465, 0.008, 0.170), colors["Dark"], 0.003)
    for x in (-0.244, 0.244):
        cube("BoardFrameSide", (x, 0.887, -0.145), (0.007, 0.010, 0.182), colors["Gold"], 0.001)
    for z in (-0.234, -0.056):
        cube("BoardFrameEnd", (0, 0.887, z), (0.495, 0.010, 0.007), colors["Gold"], 0.001)

    font_path = Path("C:/Windows/Fonts/msyhbd.ttc")
    if not font_path.exists():
        raise RuntimeError("Microsoft YaHei is required for the Chinese room plaque.")
    font = bpy.data.fonts.load(str(font_path))
    for body, size, z in (("辩论室", 0.065, -0.098), ("求真 · 明辨", 0.020, -0.157)):
        data = bpy.data.curves.new("DebatePlaque", "FONT")
        data.body = body
        data.font = font
        data.align_x = "CENTER"
        data.align_y = "CENTER"
        data.size = size
        data.extrude = 0.0003
        data.resolution_u = 3
        obj = bpy.data.objects.new("SM_Finish_PlaqueText", data)
        collection.objects.link(obj)
        obj.location = (0, 0.885, z)
        obj.rotation_euler.x = math.pi / 2
        data.materials.append(colors["Gold"])
        obj["stageWall"] = "back"
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)

    # Straight shell: same floor footprint, vertical walls, level cornice. Wall
    # segments surround real openings; panes do not float in front of solid walls.
    wall_thickness = 0.035
    sill, lintel = -0.140, 0.015
    windows = [(-0.38, 0.02), (0.33, 0.73)]
    wall_center_z = (floor_height + ceiling_height) / 2
    wall_height = ceiling_height - floor_height
    for side in (-1, 1):
        active_wall = "left" if side == -1 else "right"
        outer_x = low.x if side == -1 else high.x
        center_x = outer_x - side * wall_thickness / 2
        pane_x = outer_x - side * (wall_thickness + 0.001)
        span_y = high.y - low.y
        center_y = (low.y + high.y) / 2
        cube("WallBelowWindows", (center_x, center_y, (floor_height + sill) / 2),
             (wall_thickness, span_y, sill - floor_height), colors["Plaster"])
        cube("WallAboveWindows", (center_x, center_y, (lintel + ceiling_height) / 2),
             (wall_thickness, span_y, ceiling_height - lintel), colors["Plaster"])
        for a, b in ((low.y, windows[0][0]), (windows[0][1], windows[1][0]), (windows[1][1], high.y)):
            cube("WindowPier", (center_x, (a + b) / 2, (sill + lintel) / 2),
                 (wall_thickness, b - a, lintel - sill), colors["Plaster"])
        for index, (d0, d1) in enumerate(windows):
            lower0 = Vector((pane_x, d0, sill))
            lower1 = Vector((pane_x, d1, sill))
            upper0 = Vector((pane_x, d0, lintel))
            upper1 = Vector((pane_x, d1, lintel))
            for u in range(2):
                for v in range(2):
                    corners = []
                    for fu, fv in ((u / 2, v / 2), ((u + 1) / 2, v / 2),
                                   ((u + 1) / 2, (v + 1) / 2), (u / 2, (v + 1) / 2)):
                        corners.append(tuple(lower0.lerp(lower1, fu).lerp(upper0.lerp(upper1, fu), fv)))
                    mesh(f"Window{side}_{index}_{u}_{v}", corners, [(0, 1, 2, 3)],
                         colors["Glass" if u == v else "GlassShade"])
            for a, b in ((lower0, lower1), (upper0, upper1), (lower0, upper0), (lower1, upper1)):
                beam("WindowFrame", a, b, 0.010, 0.009, colors["Dark"])
            beam("WindowMullion", lower0.lerp(lower1, 0.5), upper0.lerp(upper1, 0.5), 0.006, 0.007, colors["Wood"])
            beam("WindowTransom", lower0.lerp(upper0, 0.5), lower1.lerp(upper1, 0.5), 0.006, 0.007, colors["Wood"])
            cube("WindowSill", (pane_x - side * 0.006, (d0 + d1) / 2, sill - 0.005),
                 (0.026, d1 - d0 + 0.018, 0.009), colors["Gold"], 0.001)
        trim_x = outer_x - side * (wall_thickness + 0.005)
        cube("Wainscot", (trim_x, center_y, (floor_height - 0.175) / 2),
             (0.006, span_y, -0.175 - floor_height), colors["Panel"])
        for z, height in ((floor_height + 0.006, 0.012), (-0.176, 0.009), (ceiling_height - 0.006, 0.012)):
            cube("WallRail", (trim_x - side * 0.003, center_y, z), (0.009, span_y, height), colors["Wood"])

    for wall, y in (("back", high.y - wall_thickness / 2), ("front", low.y + wall_thickness / 2)):
        active_wall = wall
        cube("EndWall", (0, y, wall_center_z), (high.x - low.x, wall_thickness, wall_height), colors["Plaster"])
        inner_y = y - (1 if wall == "back" else -1) * (wall_thickness / 2 + 0.004)
        cube("EndWainscot", (0, inner_y, (floor_height - 0.175) / 2),
             (high.x - low.x, 0.006, -0.175 - floor_height), colors["Panel"])
        for z, height in ((floor_height + 0.006, 0.012), (-0.176, 0.009), (ceiling_height - 0.006, 0.012)):
            cube("EndRail", (0, inner_y, z), (high.x - low.x, 0.010, height), colors["Wood"])
    active_wall = "back"
    for side, team in ((-1, "Blue"), (1, "Red")):
        x = side * 0.365
        cube("BannerRod", (x, 0.904, -0.037), (0.10, 0.013, 0.008), colors["Gold"], 0.001)
        mesh("TeamBanner", [(x - 0.042, 0.897, -0.041), (x + 0.042, 0.897, -0.041),
                            (x + 0.042, 0.897, -0.186), (x, 0.897, -0.211),
                            (x - 0.042, 0.897, -0.186)], [(0, 1, 2, 3, 4)], colors[team])
        for end_x in (x - 0.044, x + 0.044):
            beam("BannerBorder", (end_x, 0.895, -0.041), (end_x, 0.895, -0.186), 0.003, 0.003, colors["Gold"])
    # The entrance frame has vertical jambs and a level lintel, visible on turning.
    active_wall = "front"
    door_y = low.y + wall_thickness + 0.006
    for x in (-0.054, 0.054):
        cube("DoorLeaf", (x, door_y, floor_height + 0.127), (0.106, 0.014, 0.252), colors["Wood"], 0.002)
        cube("DoorInset", (x, door_y + 0.009, floor_height + 0.153), (0.077, 0.006, 0.15), colors["Panel"], 0.001)
    for x in (-0.115, 0.115):
        cube("DoorJamb", (x, door_y, floor_height + 0.130), (0.012, 0.022, 0.26), colors["Dark"])
    cube("DoorLintel", (0, door_y, floor_height + 0.263), (0.242, 0.022, 0.012), colors["Dark"])
    for x in (-0.012, 0.012):
        cube("DoorHandle", (x, door_y + 0.015, floor_height + 0.12), (0.004, 0.006, 0.027), colors["Gold"], 0.001)
    active_wall = None

    # All sides meet this level roof. No baked-in perspective taper in geometry.
    def roof_z(y):
        return ceiling_height

    mesh("Parchment", [(low.x, y, roof_z(y)) for y in (low.y, high.y)] +
                      [(high.x, y, roof_z(y)) for y in (high.y, low.y)], [(0, 1, 2, 3)], colors["Cream"], True)
    roof_y0, roof_y1 = low.y + wall_thickness - 0.004, high.y - wall_thickness + 0.004
    roof_x0, roof_x1 = low.x + wall_thickness - 0.004, high.x - wall_thickness + 0.004
    for x in (roof_x0, -0.46, 0, 0.46, roof_x1):
        beam("LongCoffer", (x, roof_y0, roof_z(roof_y0) - 0.007), (x, roof_y1, roof_z(roof_y1) - 0.007),
             0.014, 0.014, colors["Wood"], True)
    for y in (roof_y0, -0.30, 0.28, roof_y1):
        beam("CrossCoffer", (roof_x0, y, roof_z(y) - 0.007), (roof_x1, y, roof_z(y) - 0.007),
             0.014, 0.014, colors["Wood"], True)
    for y in (-0.42, 0.44):
        z = roof_z(y)
        cube("LampMount", (0, y, z - 0.009), (0.075, 0.075, 0.012), colors["Gold"], 0.003, True)
        cube("LampShade", (0, y, z - 0.020), (0.057, 0.057, 0.018), colors["Ivory"], 0.004, True)
        for x in (-0.031, 0.031):
            cube("LampRim", (x, y, z - 0.023), (0.004, 0.066, 0.012), colors["Wood"], 0.001, True)
        for dy in (-0.031, 0.031):
            cube("LampRim", (0, y + dy, z - 0.023), (0.066, 0.004, 0.012), colors["Wood"], 0.001, True)

    bpy.context.view_layer.update()
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    triangles = 0
    for obj in objects:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        if obj != room:
            for vertex in obj.data.vertices:
                point = obj.matrix_world @ vertex.co
                if any(point[i] < low[i] - 0.0001 or point[i] > high[i] + 0.0001 for i in range(3)):
                    raise RuntimeError(f"Added object expands seat bounds: {obj.name}")
    if triangles > original_triangles + 10_000:
        raise RuntimeError("The rectified room exceeds the web triangle budget.")
    # Batch by visibility. Retained furniture keeps its UVs; architecture is
    # divided into four walls and a ceiling for the cutaway overview.
    for is_ceiling, wall in ((False, ""), (True, ""), (False, "left"), (False, "right"), (False, "back"), (False, "front")):
        pieces = [o for o in bpy.context.scene.objects if o.type == "MESH" and o != room
                  and bool(o.get("stageCeiling", False)) == is_ceiling and o.get("stageWall", "") == wall]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in pieces:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = "SM_Ceiling_Details" if is_ceiling else ("SM_Wall_" + wall if wall else "SM_Finish_Details")
        obj["stageCeiling"] = is_ceiling
        if wall:
            obj["stageWall"] = wall
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(args.output.resolve()), export_format="GLB",
                             export_materials="EXPORT", export_animations=False,
                             export_extras=True, export_yup=True)
    report = {"source_triangles": original_triangles, "triangles": triangles,
              "net_triangle_change": triangles - original_triangles,
              "new_structure_triangles": triangles - (original_triangles - removed_shell_triangles),
              "removed_shell_triangles": removed_shell_triangles,
              "leveled_tabletop_vertices": leveled_vertices,
              "cleaned_texels": cleaned, "output_bytes": args.output.stat().st_size,
              "floor": floor_height, "ceiling": ceiling_height,
              "walls_vertical": True, "windows_rectangular": True}
    print(json.dumps(report))
    if args.report:
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
