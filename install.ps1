# Heimdall NVR Windows Installer
# Run this script to automatically install prerequisites, dependencies, compile the UI, and create shortcuts.

$ErrorActionPreference = "Stop"
Clear-Host

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Heimdall NVR - WINDOWS INSTALLER     " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check for Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Note: Not running as Administrator. If installation of packages fails, please restart this script as Administrator." -ForegroundColor Yellow
    Write-Host ""
}

# Set project root folder path
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = Get-Location }

# Function to check and install a tool using winget
function Ensure-Tool {
    param(
        [string]$Name,
        [string]$Command,
        [string]$WingetId
    )
    
    Write-Host "[*] Checking for $Name..." -NoNewline
    $path = Get-Command $Command -ErrorAction SilentlyContinue
    
    # Also check local bin directory for FFmpeg
    $localBinDir = Join-Path $ProjectRoot "backend\bin"
    if ($Name -eq "FFmpeg" -and -not $path) {
        $localFfmpeg = Join-Path $localBinDir "ffmpeg.exe"
        if (Test-Path $localFfmpeg) {
            $path = [PSCustomObject]@{ Source = $localFfmpeg }
        }
    }
    
    if ($path) {
        Write-Host " Found: $($path.Source)" -ForegroundColor Green
    } else {
        Write-Host " Not found. Installing $Name via winget..." -ForegroundColor Yellow
        $installed = $false
        try {
            # Run winget installer
            Start-Process winget -ArgumentList "install -e --id $WingetId --silent --accept-package-agreements --accept-source-agreements" -NoNewWindow -Wait
            # Reload path
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            # Re-check
            $path = Get-Command $Command -ErrorAction SilentlyContinue
            if ($path) {
                Write-Host "[+] Successfully installed $Name!" -ForegroundColor Green
                $installed = $true
            }
        } catch {
            # Ignore error and try fallback
        }
        
        if (-not $installed) {
            if ($Name -eq "FFmpeg") {
                Write-Host "[*] Winget failed. Attempting to download static FFmpeg build directly..." -ForegroundColor Yellow
                try {
                    if (-not (Test-Path $localBinDir)) { New-Item -ItemType Directory -Path $localBinDir | Out-Null }
                    
                    $ZipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.zip"
                    $ZipPath = Join-Path $env:TEMP "ffmpeg.zip"
                    
                    Write-Host "[*] Downloading FFmpeg zip (about 100MB, this may take a moment)..." -ForegroundColor Gray
                    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
                    
                    Write-Host "[*] Extracting FFmpeg..." -ForegroundColor Gray
                    $ExtractPath = Join-Path $env:TEMP "ffmpeg_extracted"
                    if (Test-Path $ExtractPath) { Remove-Item -Recurse -Force $ExtractPath }
                    Expand-Archive -Path $ZipPath -DestinationPath $ExtractPath
                    
                    $FFmpegExe = Get-ChildItem -Path $ExtractPath -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
                    if ($FFmpegExe) {
                        Copy-Item -Path $FFmpegExe.FullName -Destination (Join-Path $localBinDir "ffmpeg.exe") -Force
                        $FFprobeExe = Get-ChildItem -Path $ExtractPath -Filter "ffprobe.exe" -Recurse | Select-Object -First 1
                        if ($FFprobeExe) {
                            Copy-Item -Path $FFprobeExe.FullName -Destination (Join-Path $localBinDir "ffprobe.exe") -Force
                        }
                        Write-Host "[+] Successfully downloaded and set up local FFmpeg in backend/bin!" -ForegroundColor Green
                        
                        # Cleanup temp files
                        Remove-Item -Path $ZipPath -Force
                        Remove-Item -Recurse -Force $ExtractPath
                        return
                    } else {
                        throw "ffmpeg.exe not found in extracted archive"
                    }
                } catch {
                    Write-Host "[-] Direct download fallback failed: $_" -ForegroundColor Red
                }
            }
            
            Write-Host "[-] Failed to install $Name automatically. Please install it manually from the official website." -ForegroundColor Red
            Write-Host "    Link: https://apps.microsoft.com/detail/9nblggh4nbfm (or search for it)" -ForegroundColor Gray
            exit 1
        }
    }
}

# 1. Install prerequisites via winget
Ensure-Tool -Name "Python 3" -Command "python" -WingetId "Python.Python.3.11"
Ensure-Tool -Name "Node.js" -Command "node" -WingetId "OpenJS.NodeJS.LTS"
Ensure-Tool -Name "FFmpeg" -Command "ffmpeg" -WingetId "Gyan.FFmpeg"

# 2. Setup python virtual environment
Write-Host ""
Write-Host "[*] Setting up Python virtual environment..." -ForegroundColor Cyan
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = Get-Location }

$VenvPath = Join-Path $ProjectRoot "backend\venv"
$PipPath = Join-Path $VenvPath "Scripts\pip.exe"
$PythonPath = Join-Path $VenvPath "Scripts\python.exe"
$PythonwPath = Join-Path $VenvPath "Scripts\pythonw.exe"

if (-not (Test-Path $VenvPath)) {
    try {
        Start-Process python -ArgumentList "-m venv backend/venv" -WorkingDirectory $ProjectRoot -NoNewWindow -Wait
        Write-Host "[+] Virtual environment created successfully." -ForegroundColor Green
    } catch {
        Write-Host "[-] Failed to create virtual environment: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[*] Virtual environment already exists." -ForegroundColor Gray
}

# Install python dependencies
Write-Host "[*] Installing Python packages in virtual environment..." -ForegroundColor Cyan
try {
    Start-Process $PipPath -ArgumentList "install -r backend/requirements.txt" -WorkingDirectory $ProjectRoot -NoNewWindow -Wait
    Write-Host "[+] Python dependencies installed." -ForegroundColor Green
} catch {
    Write-Host "[-] Failed to install Python dependencies: $_" -ForegroundColor Red
    exit 1
}

# 3. Setup Frontend
Write-Host ""
Write-Host "[*] Installing Frontend packages (Node.js)..." -ForegroundColor Cyan
$FrontendDir = Join-Path $ProjectRoot "frontend"

try {
    Start-Process npm -ArgumentList "install" -WorkingDirectory $FrontendDir -NoNewWindow -Wait
    Write-Host "[+] Node packages installed." -ForegroundColor Green
} catch {
    Write-Host "[-] Failed to run npm install in frontend directory: $_" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Compiling Frontend UI assets..." -ForegroundColor Cyan
try {
    Start-Process npm -ArgumentList "run build" -WorkingDirectory $FrontendDir -NoNewWindow -Wait
    Write-Host "[+] Frontend compiled to static assets." -ForegroundColor Green
} catch {
    Write-Host "[-] Failed to compile frontend: $_" -ForegroundColor Red
    exit 1
}

# 4. Create Launcher Scripts
Write-Host ""
Write-Host "[*] Creating launcher script..." -ForegroundColor Cyan
$LauncherPath = Join-Path $ProjectRoot "run.bat"
$LauncherContent = @"
@echo off
cd /d "%~dp0"
echo Starting Heimdall NVR...
echo Logging outputs to nvr.log...
start "" "%~dp0backend\venv\Scripts\pythonw.exe" backend\main.py > nvr.log 2>&1
"@
Set-Content -Path $LauncherPath -Value $LauncherContent -Force
Write-Host "[+] Launcher run.bat created." -ForegroundColor Green

# 5. Create Desktop Shortcut
Write-Host "[*] Creating Desktop shortcut..." -ForegroundColor Cyan
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $ShortcutPath = Join-Path ([System.Environment]::GetFolderPath("Desktop")) "Heimdall NVR.lnk"
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $LauncherPath
    $Shortcut.WorkingDirectory = $ProjectRoot
    # Use shell32.dll index 219 (video camera symbol) as icon
    $Shortcut.IconLocation = "shell32.dll, 219"
    $Shortcut.Description = "Launch Heimdall NVR Camera Dashboard"
    $Shortcut.Save()
    Write-Host "[+] Desktop shortcut created successfully!" -ForegroundColor Green
} catch {
    Write-Host "[!] Warning: Could not create desktop shortcut automatically. Launch the app using run.bat." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "          INSTALLATION COMPLETE!             " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host " You can now run the app via the 'Heimdall NVR' shortcut on your Desktop" -ForegroundColor Gray
Write-Host " or by double-clicking 'run.bat' in the project directory." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit..."
