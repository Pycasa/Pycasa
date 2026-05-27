#!/usr/bin/env bash
set -euo pipefail

REPO="Pycasa/Pycasa"
INSTALL_DIR="${PYCASA_INSTALL_DIR:-$HOME/.pycasa}"
JAR_NAME="pycasa.jar"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ️  $*${RESET}"; }
success() { echo -e "${GREEN}✅ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${RESET}"; }
error()   { echo -e "${RED}❌ $*${RESET}" >&2; exit 1; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ██████╗ ██╗   ██╗ ██████╗ █████╗ ███████╗ █████╗ "
echo "  ██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗██╔════╝██╔══██╗"
echo "  ██████╔╝ ╚████╔╝ ██║     ███████║███████╗███████║"
echo "  ██╔═══╝   ╚██╔╝  ██║     ██╔══██║╚════██║██╔══██║"
echo "  ██║        ██║   ╚██████╗██║  ██║███████║██║  ██║"
echo "  ╚═╝        ╚═╝    ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Your photos, your server, your rules.${RESET}"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v java &>/dev/null; then
  error "Java 17+ is required but not found. Install it from https://adoptium.net and re-run."
fi

JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [[ "$JAVA_VERSION" -lt 17 ]]; then
  error "Java 17+ is required. Found Java ${JAVA_VERSION}. Install a newer version from https://adoptium.net"
fi

success "Java ${JAVA_VERSION} found."

if ! command -v curl &>/dev/null; then
  error "'curl' is required but not found. Please install it and re-run."
fi

# ── Fetch latest release ──────────────────────────────────────────────────────
info "Fetching latest release info from GitHub..."

RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") \
  || error "Could not reach GitHub API. Check your internet connection."

VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | grep -o '"v[^"]*"' | tr -d '"')
JAR_URL=$(echo "$RELEASE_JSON" | grep -o 'https://[^"]*runner\.jar' | head -1)

[[ -z "$VERSION" ]] && error "Could not determine the latest release version."
[[ -z "$JAR_URL" ]] && error "Could not find a JAR asset in the latest release (${VERSION})."

info "Latest release: ${BOLD}${VERSION}${RESET}"

# ── Download ──────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
JAR_PATH="${INSTALL_DIR}/${JAR_NAME}"

info "Downloading Pycasa ${VERSION}..."
curl -L --progress-bar "$JAR_URL" -o "$JAR_PATH" \
  || error "Download failed. Please check your connection and try again."

success "Downloaded to ${JAR_PATH}"

# ── Launcher script ───────────────────────────────────────────────────────────
LAUNCHER="/usr/local/bin/pycasa"

if [[ -w "/usr/local/bin" ]] || sudo -n true 2>/dev/null; then
  cat > /tmp/pycasa-launcher <<'EOF'
#!/usr/bin/env bash
# Usage: pycasa [--port <port>] [extra JVM args...]
PORT=3000
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|-p)
      PORT="$2"; shift 2 ;;
    *)
      EXTRA_ARGS+=("$1"); shift ;;
  esac
done

exec java -Dquarkus.http.port="${PORT}" "${EXTRA_ARGS[@]}" -jar "INSTALL_DIR_PLACEHOLDER/pycasa.jar"
EOF
  # Substitute the real install dir
  sed -i.bak "s|INSTALL_DIR_PLACEHOLDER|${INSTALL_DIR}|g" /tmp/pycasa-launcher
  rm -f /tmp/pycasa-launcher.bak
  chmod +x /tmp/pycasa-launcher
  sudo mv /tmp/pycasa-launcher "$LAUNCHER" 2>/dev/null || mv /tmp/pycasa-launcher "$LAUNCHER"
  success "Launcher installed at ${LAUNCHER}  →  run 'pycasa' from anywhere."
else
  warn "Could not install launcher to /usr/local/bin (no write permission)."
  warn "You can still run Pycasa with:"
  echo -e "    ${BOLD}java -Dquarkus.http.port=3000 -jar ${JAR_PATH}${RESET}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}🎉 Pycasa ${VERSION} is ready!${RESET}"
echo ""
echo -e "  ${BOLD}Start Pycasa:${RESET}"
if [[ -f "$LAUNCHER" ]]; then
  echo -e "    ${CYAN}pycasa${RESET}                       # default port 3000"
  echo -e "    ${CYAN}pycasa --port 8080${RESET}           # custom port"
else
  echo -e "    ${CYAN}java -jar ${JAR_PATH}${RESET}"
  echo -e "    ${CYAN}java -Dquarkus.http.port=8080 -jar ${JAR_PATH}${RESET}   # custom port"
fi
echo ""
echo -e "  ${BOLD}Then open:${RESET}  http://localhost:3000  (or your chosen port)"
echo -e "  ${BOLD}Login:${RESET}      admin / admin  (change after first login)"
echo ""
echo -e "  ${BOLD}Optional — AI features:${RESET}"
echo -e "    Install Ollama → https://ollama.com"
echo -e "    ${CYAN}ollama pull llava${RESET}"
echo ""
