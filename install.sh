#!/usr/bin/env bash
# Evolve One-Click Installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/JhaSourav07/evolve/main/install.sh | bash

set -e

# Terminal colors
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ✦ EVOLVE — Autonomous AI Software Engineer"
echo "  1-Click Installer"
echo -e "${RESET}"

# 1. Check Operating System
OS="$(uname -s)"
case "${OS}" in
    Linux*)     PLATFORM="linux";;
    Darwin*)    PLATFORM="macos";;
    *)          PLATFORM="unknown";;
esac

if [ "${PLATFORM}" = "unknown" ]; then
    echo -e "${RED}✖ Unsupported operating system: ${OS}.${RESET}"
    echo "Evolve installer currently supports Linux and macOS. For Windows, use PowerShell:"
    echo "  irm https://raw.githubusercontent.com/JhaSourav07/evolve/main/install.ps1 | iex"
    exit 1
fi

echo -e "${CYAN}→ Detected platform:${RESET} ${PLATFORM}"

# 2. Check Git
if ! command -v git >/dev/null 2>&1; then
    echo -e "${RED}✖ Git is required but not installed.${RESET}"
    echo "Please install Git and re-run this script."
    exit 1
fi

# 3. Check Node.js
REQUIRED_NODE_VERSION=20
if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Node.js not detected.${RESET}"
    echo "Attempting to install Node.js via nvm / fnm / package manager..."
    if command -v brew >/dev/null 2>&1; then
        brew install node
    else
        echo -e "${RED}✖ Please install Node.js >= 20.0.0 (https://nodejs.org/) and re-run this installer.${RESET}"
        exit 1
    fi
fi

NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_VERSION}" ]; then
    echo -e "${RED}✖ Node.js >= ${REQUIRED_NODE_VERSION} is required (detected $(node -v)).${RESET}"
    echo "Please update Node.js (https://nodejs.org/) and re-run this installer."
    exit 1
fi
echo -e "${GREEN}✔ Node.js detected:${RESET} $(node -v)"

# 4. Check / Install pnpm
if ! command -v pnpm >/dev/null 2>&1; then
    echo -e "${CYAN}→ Installing pnpm...${RESET}"
    if command -v corepack >/dev/null 2>&1; then
        corepack enable
        corepack prepare pnpm@latest --activate 2>/dev/null || npm install -g pnpm
    else
        npm install -g pnpm
    fi
fi
echo -e "${GREEN}✔ pnpm detected:${RESET} $(pnpm -v)"

# 5. Clone or Update Evolve
INSTALL_DIR="${HOME}/.evolve/repo"
BIN_DIR="${HOME}/.local/bin"
mkdir -p "${BIN_DIR}"

if [ -d "${INSTALL_DIR}/.git" ]; then
    echo -e "${CYAN}→ Updating existing Evolve installation in ${INSTALL_DIR}...${RESET}"
    cd "${INSTALL_DIR}"
    git fetch origin main --quiet
    git reset --hard origin/main --quiet
else
    echo -e "${CYAN}→ Cloning Evolve into ${INSTALL_DIR}...${RESET}"
    mkdir -p "${INSTALL_DIR}"
    git clone --depth 1 https://github.com/JhaSourav07/evolve.git "${INSTALL_DIR}" --quiet
    cd "${INSTALL_DIR}"
fi

# 6. Install dependencies & build
echo -e "${CYAN}→ Installing dependencies and building packages...${RESET}"
pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent
pnpm run build

# 7. Create global executable wrapper
CLI_BIN="${INSTALL_DIR}/apps/cli/dist/index.js"
chmod +x "${CLI_BIN}"

WRAPPER="${BIN_DIR}/evolve"
cat << 'EOF' > "${WRAPPER}"
#!/usr/bin/env bash
INSTALL_DIR="${HOME}/.evolve/repo"
exec node "${INSTALL_DIR}/apps/cli/dist/index.js" "$@"
EOF
chmod +x "${WRAPPER}"

echo -e "${GREEN}✔ Created binary link:${RESET} ${WRAPPER}"

# 8. Ensure ~/.local/bin is in PATH
SHELL_CONFIG=""
case "${SHELL}" in
    */zsh)  SHELL_CONFIG="${HOME}/.zshrc";;
    */bash) SHELL_CONFIG="${HOME}/.bashrc";;
    *)      SHELL_CONFIG="${HOME}/.profile";;
esac

if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    if [ -n "${SHELL_CONFIG}" ] && [ -f "${SHELL_CONFIG}" ]; then
        if ! grep -q 'export PATH="\$HOME/.local/bin:\$PATH"' "${SHELL_CONFIG}" 2>/dev/null; then
            echo '' >> "${SHELL_CONFIG}"
            echo '# Evolve CLI PATH' >> "${SHELL_CONFIG}"
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${SHELL_CONFIG}"
            echo -e "${GREEN}✔ Added ${BIN_DIR} to PATH in ${SHELL_CONFIG}.${RESET}"
        fi
    fi
    export PATH="${BIN_DIR}:${PATH}"
fi

# 9. Verify Ollama
echo ""
echo -e "${CYAN}→ Checking Ollama connection...${RESET}"
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo -e "${GREEN}✔ Ollama is running locally.${RESET}"
else
    echo -e "${YELLOW}⚠ Ollama was not detected on http://localhost:11434.${RESET}"
    echo "  To start Ollama, install it from https://ollama.com and run:"
    echo -e "  ${BOLD}ollama run qwen2.5-coder:7b${RESET}"
fi

echo ""
echo -e "${GREEN}${BOLD}🎉 Installation Complete!${RESET}"
echo ""
echo -e "  Start using Evolve in any repository:"
echo -e "  ${CYAN}${BOLD}evolve${RESET}"
echo ""
echo -e "  Or run a task immediately:"
echo -e "  ${CYAN}${BOLD}evolve chat \"Analyze this repository and find authentication\"${RESET}"
echo ""
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    echo -e "${YELLOW}Note: Run 'source ${SHELL_CONFIG}' or restart your terminal to reload your PATH.${RESET}"
fi
echo ""
