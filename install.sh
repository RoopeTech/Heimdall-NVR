#!/usr/bin/env bash

# Heimdall NVR Linux Installer
# Automatically installs python packages, npm packages, compiles frontend assets, and sets up launch configurations.

set -e

# Visual colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}       Heimdall NVR - LINUX INSTALLER     ${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

# Function to check if a command exists
check_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Check for system dependencies
missing_deps=()
if ! check_cmd python3; then missing_deps+=("python3" "python3-pip" "python3-venv"); fi
if ! check_cmd node; then missing_deps+=("nodejs"); fi
if ! check_cmd npm; then missing_deps+=("npm"); fi
if ! check_cmd ffmpeg; then missing_deps+=("ffmpeg"); fi

if [ ${#missing_deps[@]} -ne 0 ]; then
    echo -e "${YELLOW}[!] Some system dependencies are missing: ${missing_deps[*]}${NC}"
    echo "Please install them via your distribution's package manager first."
    echo ""
    
    # Detect package manager
    if check_cmd apt-get; then
        echo -e "${CYAN}Suggested command for Debian/Ubuntu:${NC}"
        echo "  sudo apt update && sudo apt install -y python3 python3-pip python3-venv nodejs npm ffmpeg"
    elif check_cmd pacman; then
        echo -e "${CYAN}Suggested command for Arch Linux:${NC}"
        echo "  sudo pacman -Syu python python-pip nodejs npm ffmpeg"
    elif check_cmd dnf; then
        echo -e "${CYAN}Suggested command for Fedora:${NC}"
        echo "  sudo dnf install python3 python3-pip nodejs npm ffmpeg"
    fi
    echo ""
    read -p "Have you installed the packages? (y/n): " choice
    if [[ "$choice" != "y" && "$choice" != "Y" ]]; then
        echo -e "${RED}[-] Installation cancelled. Please install dependencies and rerun.${NC}"
        exit 1
    fi
fi

# Get project root folder path
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

# 2. Setup python virtual environment
echo -e "\n${CYAN}[*] Setting up Python virtual environment...${NC}"
if [ ! -d "backend/venv" ]; then
    python3 -m venv backend/venv
    echo -e "${GREEN}[+] Virtual environment created successfully.${NC}"
else
    echo -e "${YELLOW}[*] Virtual environment already exists.${NC}"
fi

# Install python dependencies inside venv
echo -e "${CYAN}[*] Installing Python packages...${NC}"
backend/venv/bin/pip install --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt
echo -e "${GREEN}[+] Python packages installed.${NC}"

# 3. Setup Frontend
echo -e "\n${CYAN}[*] Installing Frontend packages (Node.js)...${NC}"
cd frontend
npm install
echo -e "${GREEN}[+] Node packages installed.${NC}"

echo -e "${CYAN}[*] Compiling Frontend UI assets...${NC}"
npm run build
echo -e "${GREEN}[+] Frontend compiled to static assets.${NC}"
cd ..

# 4. Create Launcher Scripts
echo -e "\n${CYAN}[*] Creating run.sh launcher script...${NC}"
cat << 'EOF' > run.sh
#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
echo "Starting Heimdall NVR..."
source backend/venv/bin/activate
python3 backend/main.py
EOF
chmod +x run.sh
echo -e "${GREEN}[+] run.sh created and made executable.${NC}"

# 5. Create Desktop Menu Entry (.desktop)
echo -e "${CYAN}[*] Creating desktop launcher application entry...${NC}"
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

cat << EOF > "$DESKTOP_DIR/Heimdall-nvr.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=Heimdall NVR
Comment=IP Camera Viewer & NVR Dashboard
Exec=$PROJECT_ROOT/run.sh
Path=$PROJECT_ROOT
Icon=camera-video
Terminal=false
Categories=Utility;Network;
EOF
chmod +x "$DESKTOP_DIR/Heimdall-nvr.desktop"
echo -e "${GREEN}[+] Desktop shortcut created at $DESKTOP_DIR/Heimdall-nvr.desktop${NC}"
echo -e "    You will be able to search and launch 'Heimdall NVR' from your application menu."

echo -e "\n${GREEN}=============================================${NC}"
echo -e "${GREEN}          INSTALLATION COMPLETE!             ${NC}"
echo -e "${GREEN}=============================================${NC}"
echo -e " You can now start the app by running: ./run.sh"
echo -e " or by finding it in your Desktop Application Menu."
echo ""
