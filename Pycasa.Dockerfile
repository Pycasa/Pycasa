# ---------- Builder stage ----------
FROM python:3.14.2-bookworm AS builder

WORKDIR /app

# System deps for building
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    cmake \
    ca-certificates \
    xz-utils \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy source
COPY . /app

RUN pip install build

RUN cd /app/server && python3 -m build --wheel

RUN pip install /app/server/dist/pycasa-*.whl

EXPOSE 3000

ENTRYPOINT ["pycasa"]
