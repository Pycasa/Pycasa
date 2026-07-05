<div align="center">
   <img width="150" height="150" alt="logo-no-bg" src="https://github.com/user-attachments/assets/c73be700-2369-4ead-9875-b27a5a68a5cb" />

### Pycasa

**Your photos, your server, your rules.**

Pycasa is a self-hosted photo management application that runs entirely on your own machine. No cloud subscriptions, no data leaving your network. Point it at your photo folders and get a fast, searchable gallery with AI-powered descriptions, tags, and OCR — all processed locally.

<a href="https://pycasa.github.io/Pycasa/">Go to Website</a>

</div>


<div align="center">
   <img height="400" alt="timeline-light" src="https://github.com/user-attachments/assets/4bbd8b40-66de-4ac8-98d0-cbf7f8c33b55" />
</div>

<div align="center">
   <a href="https://www.producthunt.com/products/pycasa?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-pycasa" target="_blank" rel="noopener noreferrer"><img alt="Pycasa - A self-hosted modern AI photo manager | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1157300&amp;theme=light&amp;t=1780043143447"></a>
</div>

---

## Features

- **Timeline & Gallery views** — browse your photos chronologically or in a grid
- **AI image analysis** — automatic descriptions and tags via [Ollama](https://ollama.com) (local LLMs, no API keys needed)
- **OCR** — extract text from images using Tesseract
- **Vector embeddings** — semantic search powered by local embedding models
- **Folder monitoring** — add any folder on your machine; Pycasa scans and indexes it automatically
- **Tag filtering & search** — find photos by tags, date, or description
- **Embedded database** — uses SQLite — no external database to install or manage
- **Dockerized** — easy deployment with a single command on any platform

## Roadmap

- **Backends** — S3, NFS connectors


<div align="center">
   <img height="400" alt="ai-service-select" src="https://github.com/user-attachments/assets/a4d3e44f-fdcc-48eb-b671-fd069074e7dc" />
   <img height="400" alt="ai-service-ollama" src="https://github.com/user-attachments/assets/19a65b15-6a61-44c8-8064-b58eecf51b10" />
   <img height="400" alt="ai-analysis-image-preview" src="https://github.com/user-attachments/assets/fb4cf2d4-6645-4079-aa92-f8e0c33ce622" />
   <img height="400" alt="notifications" src="https://github.com/user-attachments/assets/982d5265-eee0-4c0a-b6d9-95f11c5ca09d" />
   <img height="400" alt="settings-ocr" src="https://github.com/user-attachments/assets/d853842b-9a54-4259-88ae-59effc13ec7c" />
   <img height="400" alt="timeline-dark" src="https://github.com/user-attachments/assets/de0331e2-b525-4ee1-b104-d03eeff9d19a" />
</div>

---

## Quick Start

### Run with Docker

The fastest way to get started is by running the Pycasa Docker container:

```bash
docker run -d -p 3000:3000 -v ~/Pictures:/photos pycasa/pycasa:latest
```

This starts Pycasa on **http://localhost:3000** and mounts your local `~/Pictures` directory to the `/photos` folder inside the container.

### Prerequisites

To run or build Pycasa locally, make sure you have the following installed:

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 20+ |
| [Ollama](https://ollama.com) | any (optional, for AI features) |

### Run in dev mode

```bash
make dev
```

This runs the FastAPI python server and Vite React frontend concurrently in development mode. The frontend opens at **http://localhost:3000** with hot reloading enabled, and the backend automatically hot-reloads on python code changes.

### Build & Run Production locally

To build the React production bundle and run the uvicorn production server:

```bash
make build
.venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 3000
```

The production assets will be built into `src/main/webapp/dist` and served statically by the FastAPI server.

## BYOAI (optional)

Pycasa uses [Ollama](https://ollama.com) for fully local AI — no API keys, no data sent to the cloud.

1. Install Ollama: https://ollama.com/download
2. Pull a vision model and a text model:
   ```bash
   ollama pull llava          # vision — describes images
   ollama pull llama3         # text — generates tags
   ollama pull nomic-embed-text  # embeddings — semantic search
   ```
3. In Pycasa, go to **Settings → AI** and enter your Ollama URL (`http://localhost:11434`)

## OCR Setup (optional)

Pycasa uses [Tesseract](https://github.com/tesseract-ocr/tesseract) for text extraction from images.

1. Install Tesseract:
   ```bash
   # macOS
   brew install tesseract

   # Ubuntu/Debian
   sudo apt install tesseract-ocr
   ```
2. In Pycasa, go to **Settings → OCR** and set the Tesseract data path (e.g. `/usr/share/tesseract-ocr/4.00/tessdata`)

## API Playground

API playground is available at **http://localhost:3000/docs** when the server is running.

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — Python 3.11 web framework, fast startup, automatic OpenAPI docs
- [SQLite](https://www.sqlite.org/) — light and robust SQL database embedded as a file
- [SQLAlchemy](https://www.sqlalchemy.org/) — Database ORM
- [Pillow](https://python-pillow.org/) — image processing & metadata extraction
- [face-recognition](https://github.com/ageitgey/face_recognition) — local face detection and clustering

**Frontend**
- [React 18](https://react.dev) + [Vite 5](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [React Router](https://reactrouter.com)

---

## Contributing

Contributions are welcome. Please open an issue before submitting a large PR so we can discuss the approach.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Open a pull request

### Appreciate the work

<p align="center">
  <a href="https://www.buymeacoffee.com/amithkoujalgi" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</p>
