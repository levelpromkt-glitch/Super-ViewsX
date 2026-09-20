FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
