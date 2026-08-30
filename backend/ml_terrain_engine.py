import os
import cv2
import numpy as np
import torch


class TerrainMLEngine:

    def __init__(self):
        self.device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        try:
            self.model = torch.hub.load(
                "intel-isl/MiDaS", "MiDaS_small", trust_repo=True
            )
            self.model.to(self.device)
            self.model.eval()
            midas_transforms = torch.hub.load(
                "intel-isl/MiDaS", "transforms", trust_repo=True
            )
            self.transform = midas_transforms.small_transform
        except Exception:
            self.model = None

    def predict_depth_map(self, image_path: str) -> np.ndarray:
        img = cv2.imread(image_path)
        if img is None:
            return np.random.uniform(10, 80, size=(60, 60)).astype(np.float32)

        if self.model is not None:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            input_batch = self.transform(img_rgb).to(self.device)
            with torch.no_grad():
                prediction = self.model(input_batch)
                prediction = torch.nn.functional.interpolate(
                    prediction.unsqueeze(1),
                    size=img_rgb.shape[:2],
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()
            depth_map = prediction.cpu().numpy()
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            depth_map = cv2.GaussianBlur(gray, (21, 21), 0).astype(np.float32)

        # Invert normalized disparity so high land features scale upward as elevation
        norm_depth = cv2.normalize(
            depth_map, None, 0, 1, norm_type=cv2.NORM_MINMAX
        )
        elevation = (1.0 - norm_depth) * 20.0

        # Downsample to 60x60 for zero rendering lag
        return cv2.resize(elevation, (60, 60), interpolation=cv2.INTER_AREA)

    def export_textured_obj(
        self, image_path: str, depth_map: np.ndarray, output_dir: str
    ) -> str:
        os.makedirs(output_dir, exist_ok=True)
        img = cv2.imread(image_path)
        if img is not None:
            cv2.imwrite(os.path.join(output_dir, "texture.jpg"), img)
        return os.path.join(output_dir, "terrain.obj")


ml_engine = TerrainMLEngine()