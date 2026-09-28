"""Pack Meshy rig animation GLBs into one browser asset.

The animation exports repeat the same 3D mesh and texture. This script copies only
animation accessor data for additional clips, keeping a single mesh and texture.
"""

import argparse
import copy
import json
import struct
from pathlib import Path


def read_glb(path):
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError(f"Invalid GLB: {path}")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError(f"Missing JSON chunk: {path}")
    document = json.loads(data[20 : 20 + json_length])
    binary_header = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<I4s", data, binary_header)
    if binary_type != b"BIN\0":
        raise ValueError(f"Missing binary chunk: {path}")
    binary = data[binary_header + 8 : binary_header + 8 + binary_length]
    return document, binary


def append_clip(destination, binary, source, source_binary, name):
    if len(source.get("animations", [])) != 1:
        raise ValueError(f"Expected one animation in {name}")
    destination_nodes = {node.get("name"): index for index, node in enumerate(destination["nodes"])}
    source_meshes = [(node.get("name"), bool(node.get("mesh"))) for node in source["nodes"]]
    target_meshes = [(node.get("name"), bool(node.get("mesh"))) for node in destination["nodes"]]
    if source_meshes != target_meshes:
        raise ValueError(f"Node hierarchy differs for {name}")
    clip = copy.deepcopy(source["animations"][0])
    copied_accessors = {}

    def copy_accessor(old_index):
        if old_index in copied_accessors:
            return copied_accessors[old_index]
        accessor = copy.deepcopy(source["accessors"][old_index])
        if "sparse" in accessor:
            raise ValueError("Sparse animation accessors are unsupported")
        view = copy.deepcopy(source["bufferViews"][accessor["bufferView"]])
        if view.get("buffer", 0) != 0:
            raise ValueError("Expected a single binary buffer")
        start = view.get("byteOffset", 0)
        content = source_binary[start : start + view["byteLength"]]
        binary.extend(b"\0" * (-len(binary) % 4))
        view["byteOffset"] = len(binary)
        view["buffer"] = 0
        binary.extend(content)
        accessor["bufferView"] = len(destination["bufferViews"])
        destination["bufferViews"].append(view)
        new_index = len(destination["accessors"])
        destination["accessors"].append(accessor)
        copied_accessors[old_index] = new_index
        return new_index

    for sampler in clip["samplers"]:
        sampler["input"] = copy_accessor(sampler["input"])
        sampler["output"] = copy_accessor(sampler["output"])
    for channel in clip["channels"]:
        node_name = source["nodes"][channel["target"]["node"]].get("name")
        channel["target"]["node"] = destination_nodes[node_name]
    clip["name"] = name
    destination["animations"].append(clip)


def write_glb(path, document, binary):
    binary.extend(b"\0" * (-len(binary) % 4))
    document["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    size = 12 + 8 + len(json_bytes) + 8 + len(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, size)
        + struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
        + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base, base_binary = read_glb(args.source / "character-sit-idle.glb")
    base_binary = bytearray(base_binary)
    base["animations"][0]["name"] = "AN_Character_SitIdle"
    for filename, name in (
        ("character-sit-talk.glb", "AN_Character_SitTalk"),
        ("character-stand-talk.glb", "AN_Character_StandTalk"),
    ):
        source, source_binary = read_glb(args.source / filename)
        append_clip(base, base_binary, source, source_binary, name)
    write_glb(args.output, base, base_binary)
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size,
                      "animations": [clip["name"] for clip in base["animations"]]}))


if __name__ == "__main__":
    main()
