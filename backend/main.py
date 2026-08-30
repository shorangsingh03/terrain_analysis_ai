import os
import shutil
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from extract_frames import extract_frames
from hazard_engine import analyze_dem_hazards_from_matrix
from ml_terrain_engine import ml_engine

app = FastAPI(title="AeroTerrain AI Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "output_assets")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
MESH_DIR = os.path.join(OUTPUT_DIR, "3d_mesh")

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)
os.makedirs(MESH_DIR, exist_ok=True)

app.mount(
    "/output_assets", StaticFiles(directory=OUTPUT_DIR), name="output_assets"
)


@app.get("/")
def read_root():
    return {"status": "AeroTerrain AI Engine API running"}


@app.post("/api/process-video")
def process_video(file: UploadFile = File(...)):
    video_path = os.path.join(TEMP_DIR, file.filename)
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    frames = extract_frames(video_path, FRAMES_DIR, target_fps=1)
    target_frame = (
        frames[0]
        if (frames and len(frames) > 0)
        else os.path.join(FRAMES_DIR, "frame_0000.jpg")
    )

    elevation_matrix = ml_engine.predict_depth_map(target_frame)
    ml_engine.export_textured_obj(target_frame, elevation_matrix, MESH_DIR)
    metrics = analyze_dem_hazards_from_matrix(elevation_matrix)

    return {
        "status": "success",
        "metrics": metrics,
        "elevation_matrix": elevation_matrix.tolist(),
    }