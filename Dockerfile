FROM node:20-slim as frontend
WORKDIR /work/frontend
# Install deps first for better caching
COPY frontend/package.json ./
# If a lockfile is added later, COPY it too for repeatable builds
# RUN npm ci
RUN npm install --no-audit --no-fund
# Now copy the rest and build
COPY frontend ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Copy built frontend
COPY --from=frontend /work/frontend/dist ./frontend/dist

# Render sets $PORT; default to 8000
ENV PORT=8000
EXPOSE 8000
# Use shell form so $PORT is expanded by the shell at runtime
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'

