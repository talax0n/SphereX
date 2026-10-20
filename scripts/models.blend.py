"""Blender half of `npm run models`: reimport each raw bake and write it back Draco-compressed."""
import os
import sys

import bpy

src, dst = sys.argv[sys.argv.index("--") + 1 :][:2]
for name in sorted(os.listdir(src)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, name))
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(dst, name),
        export_format="GLB",
        export_attributes=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="NONE",
        export_texcoords=False,
        # carries each node's source hash through for `npm run models -- --check`
        export_extras=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_color_quantization=8,
        # surf is a small whole number the shader rounds, and centre only steers cloud fading
        export_draco_generic_quantization=12,
    )
    print(f"models: {name} {os.path.getsize(os.path.join(dst, name)) // 1024} KB")
