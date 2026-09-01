import subprocess
import os
import shutil
import sys
import cv2
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="AeroTerrain Local Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.abspath("backend/output_assets")
UPLOAD_DIR = os.path.abspath("backend/temp_uploads")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/output_assets", StaticFiles(directory=OUTPUT_DIR), name="output_assets")

def find_blender_binary():
    # 1. Check environment variable override
    env_path = os.environ.get("BLENDER_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Check System PATH
    blender_cli = shutil.which("blender")
    if blender_cli:
        return blender_cli

    # 3. Search standard Windows installation directories
    standard_paths = [
        r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.0\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 3.6\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 3.5\blender.exe",
    ]
    for p in standard_paths:
        if os.path.exists(p):
            return p

    return None

def extract_texture_from_video(video_path, output_texture_path):
    cap = cv2.VideoCapture(video_path)
    success, frame = cap.read()
    if success:
        cv2.imwrite(output_texture_path, frame)
    cap.release()

@app.post("/api/upload-video")
async def process_video(
    file: UploadFile = File(...),
    height_scale: str = Form("1.8"),
    foliage_blur: str = Form("8"),
    edge_feathering: str = Form("12")
):
    video_path = os.path.join(UPLOAD_DIR, "source_video.mp4")
    texture_path = os.path.join(OUTPUT_DIR, "texture.jpg")
    
    with open(video_path, "wb") as b:
        shutil.copyfileobj(file.file, b)

    extract_texture_from_video(video_path, texture_path)

    script = os.path.abspath("backend/process_3d.py")
    cmd = [sys.executable, script, video_path, height_scale, foliage_blur, edge_feathering]
    
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        print("Mesh Generation Error:", e.stderr or e.stdout)
        raise HTTPException(status_code=500, detail="Error generating 3D terrain mesh.")

    return {
        "status": "success",
        "mesh_url": "http://localhost:8000/output_assets/terrain.obj",
        "texture_url": "http://localhost:8000/output_assets/texture.jpg"
    }

class SimReq(BaseModel):
    mesh_filename: str = "terrain.obj"

@app.post("/api/simulate-landslide")
async def simulate(payload: SimReq):
    mesh_path = os.path.join(OUTPUT_DIR, payload.mesh_filename)
    texture_path = os.path.join(OUTPUT_DIR, "texture.jpg")
    sim_script = os.path.abspath("backend/run_blender_sim.py")

    blender_exe = find_blender_binary()
    if not blender_exe:
        raise HTTPException(
            status_code=500, 
            detail="Blender binary not found on machine. Please install Blender or add it to System PATH."
        )

    cmd = [blender_exe, "-b", "-P", sim_script, "--", mesh_path, texture_path]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return {
            "status": "success",
            "video_url": "http://localhost:8000/output_assets/landslide_render.mp4"
        }
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr if e.stderr else e.stdout
        raise HTTPException(status_code=500, detail=f"Blender Execution Failed: {err_msg[:250]}")