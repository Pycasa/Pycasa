<div align="center">
   <img width="150" height="150" alt="logo-no-bg" src="https://github.com/user-attachments/assets/c73be700-2369-4ead-9875-b27a5a68a5cb" />

### Pycasa
**Your photos, your server, your rules.**

</div>



Pycasa is a self-hosted photo management application that runs entirely on your own machine. No cloud subscriptions, no data leaving your network. Point it at your photo folders and get a fast, searchable gallery with AI-powered descriptions, tags, and OCR — all processed locally.

![Gallery view](screenshots/pycasa1.png)

---

## Features

- **Timeline & Gallery views** — browse your photos chronologically or in a grid
- **AI image analysis** — automatic descriptions and tags via [Ollama](https://ollama.com) (local LLMs, no API keys needed)
- **OCR** — extract text from images using Tesseract
- **Vector embeddings** — semantic search powered by local embedding models
- **Folder monitoring** — add any folder on your machine; Pycasa scans and indexes it automatically
- **Tag filtering & search** — find photos by tags, date, or description
- **Embedded database** — uses [Couchbase Lite](https://www.couchbase.com/products/lite/) — no external database to install or manage
- **Single binary** — ships as a self-contained jar with the UI bundled inside

![Timeline view](screenshots/pycasa2.png)
![AI tags](screenshots/pycasa3.png)

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Java | 17+ |
| Maven | 3.8+ |
| Node.js | 18+ |
| [Ollama](https://ollama.com) | any (optional, for AI features) |

### Run in dev mode

```bash
make dev
```

Opens at **http://localhost:3000** — UI hot-reloads on file save, Java reloads on next request.

### Build a production jar

```bash
make build
java -jar target/pycasa-server-1.0.0-SNAPSHOT-runner.jar
```

The jar includes the full UI. No separate web server needed.

---

## AI Setup (optional)

Pycasa uses [Ollama](https://ollama.com) for fully local AI — no API keys, no data sent to the cloud.

1. Install Ollama: https://ollama.com/download
2. Pull a vision model and a text model:
   ```bash
   ollama pull llava          # vision — describes images
   ollama pull llama3         # text — generates tags
   ollama pull nomic-embed-text  # embeddings — semantic search
   ```
3. In Pycasa, go to **Settings → AI** and enter your Ollama URL (`http://localhost:11434`)

---

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

---

## Project Structure

```
Pycasa/
├── src/
│   └── main/
│       ├── java/com/pycasa/     # Quarkus backend (Java 17)
│       │   ├── entity/          # Data models
│       │   ├── repository/      # Couchbase Lite data access
│       │   ├── resource/        # REST API endpoints (JAX-RS)
│       │   └── service/         # Business logic (AI, scanning, OCR)
│       ├── resources/
│       │   └── application.properties
│       └── webapp/              # React frontend (Vite)
│           └── src/
│               ├── components/  # UI components
│               ├── pages/       # Page views
│               └── lib/         # API client, utilities
├── pom.xml
└── Makefile
```

---

## API

Swagger UI is available at **http://localhost:/docs** when the server is running.

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/folders` | List monitored folders |
| `POST` | `/api/folders` | Add a folder |
| `GET` | `/api/images` | List images (supports filtering) |
| `POST` | `/api/images/scan` | Trigger a folder scan |
| `GET` | `/api/images/tags` | List all tags |
| `POST` | `/api/ai/analyze` | Run AI analysis on images |
| `GET` | `/api/ai/status` | AI analysis progress |
| `GET` | `/api/settings` | Get settings |
| `POST` | `/api/settings` | Update settings |

---

## Tech Stack

**Backend**
- [Quarkus](https://quarkus.io) — Java 17, fast startup, dev mode with hot reload
- [Couchbase Lite](https://www.couchbase.com/products/lite/) — embedded NoSQL, zero config
- [Ollama4j](https://github.com/ollama4j/ollama4j) — Ollama client for Java
- [Tess4J](https://tess4j.sourceforge.net) — Tesseract OCR wrapper

**Frontend**
- [React 18](https://react.dev) + [Vite 5](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [React Router](https://reactrouter.com)

**Build**
- [Quinoa](https://quarkiverse.github.io/quarkiverse-docs/quarkus-quinoa/dev/) — Quarkus extension that manages the Vite dev server and bundles the UI into the jar

---

## Contributing

Contributions are welcome. Please open an issue before submitting a large PR so we can discuss the approach.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Open a pull request

---

## License

MIT
