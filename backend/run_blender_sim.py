import sys
import os
import random
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
mesh_path = args[0] if len(args) > 0 else os.path.abspath("backend/output_assets/terrain.obj")
texture_path = args[1] if len(args) > 1 else os.path.abspath("backend/output_assets/texture.jpg")
output_mp4 = os.path.abspath("backend/output_assets/landslide_render.mp4")

# Delete old render if it exists
if os.path.exists(output_mp4):
    try:
        os.remove(output_mp4)
    except Exception:
        pass

bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 60

scene.render.filepath = output_mp4
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'

# Import Ground Mesh
if os.path.exists(mesh_path):
    if hasattr(bpy.ops.wm, 'obj_import'):
        bpy.ops.wm.obj_import(filepath=mesh_path)
    else:
        bpy.ops.import_scene.obj(filepath=mesh_path)

terrain = bpy.context.selected_objects[0] if bpy.context.selected_objects else None

if terrain:
    bpy.context.view_layer.objects.active = terrain
    bpy.ops.rigidbody.object_add(type='PASSIVE')
    terrain.rigid_body.collision_shape = 'MESH'

# Spawn Landslide Debris
random.seed(42)
for i in range(35):
    rx = random.uniform(-4, 4)
    ry = random.uniform(3, 7)
    rz = random.uniform(-4, 4)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=random.uniform(0.3, 0.6), location=(rx, ry, rz))
    rock = bpy.context.active_object
    bpy.ops.rigidbody.object_add(type='ACTIVE')

# Camera Setup angled at horizontal mesh center
bpy.ops.object.camera_add(location=(0, 15, 22), rotation=(-0.6, 0, 0))
scene.camera = bpy.context.active_object

# Bake Physics and Render Animation
bpy.ops.ptcache.bake_all(bake=True)
bpy.ops.render.render(animation=True)