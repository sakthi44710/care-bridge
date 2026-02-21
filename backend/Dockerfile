FROM python:3.11-slim@sha256:a90337798bffd4b8b2387eda60aaeb1a1ba99e9fc39302532f7ac1a3f8ffd12

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# AWS ECS / Fargate exposes on port 8000
ENV PORT=8000
EXPOSE ${PORT}

# Health check for ALB/ECS
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 2
