# crawler-service (T07) — FastAPI + RSS/红线/搜索
FROM python:3.11-slim

WORKDIR /app

# 先装依赖以利用层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝应用代码
COPY . .

# 端口 8003 (任务铁律, 与 docker-compose profiles:["backend"] 对应)
EXPOSE 8003

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
