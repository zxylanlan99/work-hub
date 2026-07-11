# StudyMind V2.0 — kb-service (FastGPT 网关, C3 仅检索后端)
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8002

# 端口固定 8002（与 docker-compose kb-service 映射一致，profiles:["backend"]）。
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
