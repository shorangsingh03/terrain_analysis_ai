import cv2
import numpy as np
import torch
import torch.nn.functional as F
import os
from PIL import Image

class LandslideSimulationEngine:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[ML ENGINE] Initialized PyTorch processing pipeline on: {self.device}")

    def compute_gradient_mask(self, img_tensor):
        """Computes slope shear vector fields using PyTorch Sobel convolution kernels."""
        gray = 0.299 * img_tensor[:, 0:1] + 0.587 * img_tensor[:, 1:2] + 0.114 * img_tensor[:, 2:3]
        
        sobel_x = torch.tensor([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=torch.float32, device=self.device).view(1, 1, 3, 3)
        sobel_y = torch.tensor([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=torch.float32, device=self.device).view(1, 1, 3, 3)
        
        grad_x = F.conv2d(gray, sobel_x, padding=1)
        grad_y = F.conv2d(gray, sobel_y, padding=1)
        
        magnitude = torch.sqrt(grad_x**2 + grad_y**2)
        magnitude = (magnitude - magnitude.min()) / (magnitude.max() - magnitude.min() + 1e-6)
        return magnitude

    def generate_simulation_video(self, input_path: str, output_path: str, frames_count: int = 90, fps: int = 30):
        """Generates realistic landslide displacement video with soil failure physics and volumetric dust clouds."""
        if input_path.lower().endswith(('.mp4', '.avi', '.mov', '.webm')):
            cap = cv2.VideoCapture(input_path)
            ret, frame = cap.read()
            cap.release()
            if not ret:
                raise ValueError("Could not extract frame from input video source.")
        else:
            frame = cv2.imread(input_path)

        if frame is None:
            raise ValueError(f"Failed to read image at path: {input_path}")

        # Standardize frame resolution to 1024x576 (16:9)
        h, w = 576, 1024
        frame = cv2.resize(frame, (w, h))

        # PyTorch Tensor conversion [1, 3, H, W]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(rgb_frame).permute(2, 0, 1).unsqueeze(0).to(self.device)

        # Calculate high-gradient shear zone
        slope_map = self.compute_gradient_mask(img_tensor)
        y_weight = torch.linspace(1.0, 0.2, h, device=self.device).view(1, 1, h, 1).repeat(1, 1, 1, w)
        shear_zone = (slope_map * y_weight > 0.35).float()
        shear_zone = F.gaussian_blur(shear_zone, kernel_size=(31, 31), sigma=(10.0, 10.0))

        # Setup MP4 Writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

        # Initialize Rock & Debris Boulders
        num_rocks = 250
        rock_x = (torch.rand(num_rocks, device=self.device) * 0.7 + 0.15) * w
        rock_y = (torch.rand(num_rocks, device=self.device) * 0.25 + 0.15) * h
        rock_vx = (torch.rand(num_rocks, device=self.device) - 0.5) * 2.5
        rock_vy = torch.rand(num_rocks, device=self.device) * 3.5 + 4.5
        rock_sizes = torch.rand(num_rocks, device=self.device) * 8.0 + 3.0

        for f in range(frames_count):
            t = f / float(frames_count)
            current_tensor = img_tensor.clone()

            # Downhill terrain advection
            vertical_shift = int(t * 36.0)
            if vertical_shift > 0:
                shifted_tensor = torch.roll(current_tensor, shifts=vertical_shift, dims=2)
                current_tensor = torch.where(
                    shear_zone > 0.15,
                    current_tensor * (1.0 - t * 0.5) + shifted_tensor * (t * 0.5),
                    current_tensor
                )

            # Convert back to NumPy BGR image
            frame_bg = (current_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0).astype(np.uint8)
            frame_bg = cv2.cvtColor(frame_bg, cv2.COLOR_RGB2BGR)

            # Volumetric avalanche dust layer
            dust_mask = np.zeros((h, w), dtype=np.float32)
            center_y = int(h * 0.25 + t * h * 0.6)
            radius_x = int(w * 0.3 + t * 90)
            radius_y = int(40 + t * 140)
            cv2.ellipse(dust_mask, (int(w * 0.5), center_y), (radius_x, radius_y), 0, 0, 360, 1.0, -1)
            dust_mask = cv2.GaussianBlur(dust_mask, (121, 121), 40)

            # Dust color overlay blend
            dust_color = np.array([115, 135, 155], dtype=np.uint8)
            alpha = np.clip(dust_mask * 0.8 * min(1.0, t * 2.0), 0.0, 0.85)[:, :, None]
            frame_bg = (frame_bg * (1.0 - alpha) + dust_color * alpha).astype(np.uint8)

            # Tumbling rock physics rendering
            rock_y += rock_vy
            rock_x += rock_vx + torch.sin(rock_y * 0.04) * 1.2
            
            px = rock_x.cpu().numpy().astype(int)
            py = rock_y.cpu().numpy().astype(int)
            sizes = rock_sizes.cpu().numpy().astype(int)

            for i in range(num_rocks):
                if 0 <= px[i] < w and 0 <= py[i] < h:
                    r = sizes[i]
                    pts = np.array([
                        [px[i] - r, py[i] + r],
                        [px[i] + r, py[i] - int(r * 0.5)],
                        [px[i] + int(r * 0.5), py[i] + r * 2],
                        [px[i] - int(r * 0.5), py[i] + r]
                    ], np.int32)
                    cv2.fillPoly(frame_bg, [pts], (35, 45, 55))
                    cv2.polylines(frame_bg, [pts], True, (15, 20, 25), 1)

            out.write(frame_bg)

        out.release()
        return output_path

engine = LandslideSimulationEngine()

def run_photorealistic_landslide_pipeline(input_media_path: str, output_video_path: str):
    return engine.generate_simulation_video(input_media_path, output_video_path)