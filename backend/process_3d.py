import sys
import os
import cv2
import numpy as np

def generate_terrain_mesh(video_path, output_obj_path, height_scale=1.8, foliage_blur=8, edge_feathering=12):
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        frame = np.ones((512, 512, 3), dtype=np.uint8) * 128

    grid_res = 180
    img_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    img_resized = cv2.resize(img_gray, (grid_res, grid_res))

    # 1. Low-Pass Noise Blur (Foliage Smoothness)
    blur_k = max(1, int(foliage_blur) | 1) # Ensure odd integer
    denoised = cv2.GaussianBlur(img_resized, (blur_k, blur_k), 0).astype(np.float32) / 255.0

    # 2. Edge Falloff Mask (Feathering Border Elevation)
    feather_pct = float(edge_feathering) / 100.0
    mask = np.ones((grid_res, grid_res), dtype=np.float32)
    
    if feather_pct > 0:
        x = np.linspace(-1, 1, grid_res)
        y = np.linspace(-1, 1, grid_res)
        xx, yy = np.meshgrid(x, y)
        dist = np.sqrt(xx**2 + yy**2)
        mask = np.clip(1.0 - (dist - (1.0 - feather_pct)) / feather_pct, 0, 1)

    # 3. Elevation Calculation
    elevation = denoised * mask * float(height_scale)

    # 4. Generate Vertices (Y is UP for horizontal ground orientation)
    vertices = []
    uvs = []
    x_range = np.linspace(-10, 10, grid_res)
    z_range = np.linspace(-10, 10, grid_res)

    for i in range(grid_res):
        for j in range(grid_res):
            x = x_range[j]
            z = z_range[i]
            y = elevation[i, j] # Height maps to Y axis
            vertices.append((x, y, z))
            uvs.append((j / (grid_res - 1), 1.0 - (i / (grid_res - 1))))

    # 5. Build Quad / Triangle Faces
    faces = []
    for i in range(grid_res - 1):
        for j in range(grid_res - 1):
            v1 = i * grid_res + j + 1
            v2 = i * grid_res + (j + 1) + 1
            v3 = (i + 1) * grid_res + (j + 1) + 1
            v4 = (i + 1) * grid_res + j + 1
            faces.append((v1, v2, v3))
            faces.append((v1, v3, v4))

    # 6. Write OBJ File
    with open(output_obj_path, 'w') as f:
        f.write("# AeroTerrain Horizontal Ground Mesh\n")
        for v in vertices:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for uv in uvs:
            f.write(f"vt {uv[0]:.4f} {uv[1]:.4f}\n")
        for face in faces:
            f.write(f"f {face[0]}/{face[0]} {face[1]}/{face[1]} {face[2]}/{face[2]}\n")

if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else "backend/temp_uploads/source_video.mp4"
    h_scale = float(sys.argv[2]) if len(sys.argv) > 2 else 1.8
    f_blur = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    e_feather = float(sys.argv[4]) if len(sys.argv) > 4 else 12

    out_obj = os.path.abspath("backend/output_assets/terrain.obj")
    os.makedirs(os.path.dirname(out_obj), exist_ok=True)
    generate_terrain_mesh(v_path, out_obj, h_scale, f_blur, e_feather)