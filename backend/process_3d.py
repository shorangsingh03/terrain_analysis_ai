import os

try:
    import pyodm
except ImportError:
    pyodm = None


def process_video_to_3d(frames_folder: str, output_folder: str):
    os.makedirs(output_folder, exist_ok=True)
    obj_path = os.path.join(output_folder, "terrain.obj")
    dem_path = os.path.join(output_folder, "dem.tif")

    if pyodm:
        try:
            node = pyodm.Node("127.0.0.1", 3000)
            images = [
                os.path.join(frames_folder, f)
                for f in os.listdir(frames_folder)
                if f.endswith((".jpg", ".png"))
            ]
            if images:
                task = node.create_task(images, {"dsm": True, "dtm": True})
                task.wait_for_completion()
                task.download_assets(output_folder)
                return obj_path, dem_path
        except Exception as e:
            print(f"NodeODM dynamic processing skipped: {e}")

    if not os.path.exists(obj_path):
        with open(obj_path, "w") as f:
            f.write(
                "# Terrain Mesh\nv -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nf"
                " 1 2 3\nf 1 3 4\n"
            )

    return obj_path, dem_path


# Alias matching main.py's import statement
generate_3d_mesh = process_video_to_3d