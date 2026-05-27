#!/usr/bin/env bash
set -euo pipefail

REPO="Pycasa/Pycasa"
INSTALL_DIR="${PYCASA_INSTALL_DIR:-$HOME/.pycasa}"
JAR_NAME="pycasa.jar"
LAUNCHER="${INSTALL_DIR}/pycasa"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

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
  error "Java 17+ is required but not found.
Install it from: https://adoptium.net"
fi

JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)

if [[ "$JAVA_VERSION" -lt 17 ]]; then
  error "Java 17+ is required. Found Java ${JAVA_VERSION}.
Install a newer version from: https://adoptium.net"
fi

success "Java ${JAVA_VERSION} found."

if ! command -v curl &>/dev/null; then
  error "'curl' is required but not found."
fi

# ── Fetch latest release ──────────────────────────────────────────────────────
info "Fetching latest release info from GitHub..."

RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") \
  || error "Could not reach GitHub API."

VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | grep -o '"v[^"]*"' | tr -d '"')

JAR_URL=$(echo "$RELEASE_JSON" | grep -o 'https://[^"]*runner\.jar' | head -1)

[[ -z "$VERSION" ]] && error "Could not determine latest release version."
[[ -z "$JAR_URL" ]] && error "Could not find runner JAR in release assets."

info "Latest release: ${BOLD}${VERSION}${RESET}"

# ── Download ──────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"

JAR_PATH="${INSTALL_DIR}/${JAR_NAME}"

info "Downloading Pycasa ${VERSION}..."

curl -L --progress-bar "$JAR_URL" -o "$JAR_PATH" \
  || error "Download failed."

success "Downloaded to ${JAR_PATH}"

# ── Create launcher ───────────────────────────────────────────────────────────
info "Creating launcher..."

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash

PORT=3000
EXTRA_ARGS=()

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --port|-p)
      PORT="\$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("\$1")
      shift
      ;;
  esac
done

exec java -Dquarkus.http.port="\${PORT}" "\${EXTRA_ARGS[@]}" -jar "${JAR_PATH}"
EOF

chmod +x "$LAUNCHER"

success "Launcher created at ${LAUNCHER}"

# ── PATH setup helper ─────────────────────────────────────────────────────────
SHELL_RC="$HOME/.zshrc"

if [[ -n "${BASH_VERSION:-}" ]]; then
  SHELL_RC="$HOME/.bashrc"
fi

if grep -q "$INSTALL_DIR" "$SHELL_RC" 2>/dev/null; then
  success "Pycasa is already in your PATH."
else
  echo "" >> "$SHELL_RC"
  echo "# Pycasa" >> "$SHELL_RC"
  echo "export PATH=\"\$PATH:${INSTALL_DIR}\"" >> "$SHELL_RC"

  success "Added Pycasa to PATH in ${SHELL_RC}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}🎉 Pycasa ${VERSION} is ready!${RESET}"
echo ""

echo -e "${BOLD}Start Pycasa:${RESET}"
echo -e "    ${CYAN}pycasa${RESET}                       # default port 3000"
echo -e "    ${CYAN}pycasa --port 8080${RESET}           # custom port"

echo ""
echo -e "${GREEN}${BOLD}Reload your shell:${RESET}"
echo ""
echo -e "    ${CYAN}source ${SHELL_RC}${RESET}"

echo ""
echo -e "${GREEN}After that, you can launch Pycasa from anywhere using:${RESET}"
echo -e "    ${BOLD}${CYAN}pycasa${RESET}"

echo ""
echo -e "  ${BOLD}Open:${RESET}   http://localhost:3000"
echo -e "  ${BOLD}Login:${RESET} admin / admin"
echo ""

echo -e "  ${BOLD}Optional — AI features:${RESET}"
echo -e "    Install Ollama → https://ollama.com"
echo -e "    ${CYAN}ollama pull llava${RESET}"
echo ""