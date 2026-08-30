import os
import cv2


def extract_frames(video_path: str, output_folder: str, target_fps: int = 1):
    """Extracts lightweight, resized frames from a video at a fixed rate

    (1 frame per second, capped at 20 frames max) to eliminate pipeline delays.
    """
    os.makedirs(output_folder, exist_ok=True)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return []

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    frame_interval = max(1, int(fps / target_fps))

    count = 0
    saved_count = 0
    extracted_paths = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Save 1 frame every second and stop at 20 frames max for speed
        if count % frame_interval == 0:
            resized_frame = cv2.resize(frame, (640, 360))
            frame_filename = os.path.join(
                output_folder, f"frame_{saved_count:04d}.jpg"
            )
            cv2.imwrite(frame_filename, resized_frame)
            extracted_paths.append(frame_filename)
            saved_count += 1

            if saved_count >= 20:
                break

        count += 1

    cap.release()
    print(
        f"Successfully extracted {saved_count} frames to '{output_folder}'"
    )
    return extracted_paths


# Function aliases to prevent import crashes in main.py
extract_frames_from_video = extract_frames
process_frames = extract_frames