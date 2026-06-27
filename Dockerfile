# =========================================================
# BUILD STAGE (Build React Frontend)
# =========================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy webapp package files
COPY src/main/webapp/package*.json ./src/main/webapp/
RUN cd src/main/webapp && npm install

# Copy all source
COPY . .

# Build webapp
RUN cd src/main/webapp && npm run build

# =========================================================
# RUNTIME STAGE (FastAPI Backend)
# =========================================================
FROM python:3.11-slim

WORKDIR /app

# Copy requirements & install
COPY server/requirements.txt ./server/
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy source code and the compiled frontend dist
COPY server/ ./server/
COPY --from=builder /app/src/main/webapp/dist ./src/main/webapp/dist

# Expose app port
EXPOSE 3001

# Run FastAPI app
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "3001"]