FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --break-system-packages: Debian marks the system Python as externally
# managed (PEP 668); this is a single-purpose container image, not a shared
# system, so there's no conflicting package manager to protect here.
RUN pip3 install --no-cache-dir --break-system-packages opencv-python-headless numpy

RUN mkdir -p /app/models && curl -fsSL \
    https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
    -o /app/models/face_detection_yunet_2023mar.onnx

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# yt-dlp uses Deno (if present on PATH) to run YouTube's JS player challenges.
# Without it, YouTube is more likely to serve "Sign in to confirm you're not
# a bot" to datacenter IPs.
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /usr/local/bin \
    && rm /tmp/deno.zip \
    && chmod +x /usr/local/bin/deno

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY vertical_crop.py ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
