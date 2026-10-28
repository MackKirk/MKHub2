FROM node:20-slim as frontend
WORKDIR /work/frontend
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
# Install deps first for better caching
COPY frontend/package.json ./
# npm 10.8.2 (shipped with node:20) crashes on this graph:
# "Cannot read properties of null (reading 'edgesOut')"
RUN npm install -g npm@11 && npm install --no-audit --no-fund
# Now copy the rest and build
COPY frontend ./
RUN npm run build

FROM node:20-slim as portal
WORKDIR /work/portal
COPY portal/package.json ./
RUN npm install -g npm@11 && npm install --no-audit --no-fund
COPY portal ./
# Portal Vite aliases resolve hub design-system from ../frontend/src/...
COPY frontend/src/components/ui /work/frontend/src/components/ui
COPY frontend/src/lib/overlayRoot.ts /work/frontend/src/lib/overlayRoot.ts
# Hub UI files live outside /work/portal; symlink so Rollup finds portal deps (lucide-react, react).
RUN ln -s /work/portal/node_modules /work/frontend/node_modules
RUN npm run build

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies for pillow-heif (libheif)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    # libheif runtime + codecs and CLI tools
    libheif1 \
    libheif-dev \
    libde265-0 \
    libde265-dev \
    x265 \
    libx265-dev \
    libaom3 \
    libheif-examples \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Copy built frontend
COPY --from=frontend /work/frontend/dist ./frontend/dist
COPY --from=portal /work/portal/dist ./portal/dist

# Render sets $PORT; default to 8000
ENV PORT=8000
EXPOSE 8000
# Use shell form so $PORT is expanded by the shell at runtime
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'

