FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend /app/backend
COPY agents /app/agents
COPY mcp-server /app/mcp-server
COPY data /app/data
ENV PYTHONPATH=/app
EXPOSE 8001
CMD ["python", "mcp-server/server.py"]
