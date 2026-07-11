# StudyMind V2.0 — agent-service
# 智能体大脑（Agno 底座）。端口 8001，与 docker-compose 中 agent-service 配置一致。
FROM python:3.11-slim

WORKDIR /app

# 先装依赖（利用层缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 再拷源码
COPY . .

EXPOSE 8001

# 入口：Agno 智能体服务
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
