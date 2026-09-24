#!/usr/bin/env python3
"""Crop a horizontal clip to 9:16 centered on the speaking face.

Not a full per-frame tracker: for a 10-30s talking-head clip the speaker
rarely moves enough to need one, and per-frame tracking + a time-varying
ffmpeg filter graph would be a lot more CPU on a single-core VM for little
gain. Instead this samples faces across the clip, takes the median face
center, and does one static crop + ffmpeg encode.

Falls back to a plain center crop if no face is found anywhere in the
sample (better to ship something than to fail the whole download).
"""
import sys
import json
import subprocess

import cv2
import numpy as np

MODEL_PATH = "/app/models/face_detection_yunet_2023mar.onnx"
SAMPLE_COUNT = 15
OUT_WIDTH = 1080
OUT_HEIGHT = 1920


def sample_face_center_x(input_path: str):
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        return None, 0, 0

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if width == 0 or height == 0 or frame_count <= 0:
        cap.release()
        return None, width, height

    detector = cv2.FaceDetectorYN.create(MODEL_PATH, "", (width, height), score_threshold=0.6)

    centers = []
    step = max(1, frame_count // SAMPLE_COUNT)
    for idx in range(0, frame_count, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            continue
        _, faces = detector.detect(frame)
        if faces is None:
            continue
        # Largest face by area = whoever is on camera closest/most prominent.
        largest = max(faces, key=lambda f: f[2] * f[3])
        center_x = float(largest[0] + largest[2] / 2)
        centers.append(center_x)

    cap.release()
    if not centers:
        return None, width, height
    return float(np.median(centers)), width, height


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "usage: vertical_crop.py <input> <output>"}))
        sys.exit(1)

    input_path, output_path = sys.argv[1], sys.argv[2]

    try:
        center_x, width, height = sample_face_center_x(input_path)
    except Exception as e:  # noqa: BLE001 - always fall back, never hard-fail the request
        center_x, width, height = None, 0, 0
        print(json.dumps({"warning": f"face detection failed: {e}"}), file=sys.stderr)

    if width == 0 or height == 0:
        # Couldn't even read the video; let ffprobe-less ffmpeg figure out
        # dimensions and just center-crop.
        crop_filter = f"crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale={OUT_WIDTH}:{OUT_HEIGHT}"
        used_face = False
    else:
        crop_w = min(width, round(height * 9 / 16))
        cx = center_x if center_x is not None else width / 2
        crop_x = int(max(0, min(width - crop_w, cx - crop_w / 2)))
        crop_filter = f"crop={crop_w}:{height}:{crop_x}:0,scale={OUT_WIDTH}:{OUT_HEIGHT}"
        used_face = center_x is not None

    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-vf", crop_filter,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", "copy",
            output_path,
        ],
        capture_output=True,
        text=True,
        timeout=110,
    )

    if result.returncode != 0:
        print(json.dumps({"ok": False, "error": result.stderr[-2000:]}))
        sys.exit(1)

    print(json.dumps({"ok": True, "usedFaceDetection": used_face}))


if __name__ == "__main__":
    main()
