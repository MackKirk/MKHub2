FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render sets $PORT; default to 8000
ENV PORT=8000
EXPOSE 8000
# Use shell form so $PORT is expanded by the shell at runtime
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'

