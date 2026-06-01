@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo Building Pycasa Windows Wrapper Executable
echo ===================================================
echo.

:: Check for Go installation
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Go is not installed or not in your Windows PATH.
    echo Please install Go from https://go.dev/dl/ to compile the wrapper.
    echo.
    pause
    exit /b 1
)

echo [1/5] Fetching dependencies and tidying go.mod...
go mod tidy
if %errorlevel% neq 0 (
    echo [ERROR] Failed to fetch Go dependencies.
    echo.
    pause
    exit /b %errorlevel%
)

echo [2/5] Embedding app icon into executable...
go install github.com/akavel/rsrc@latest
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install rsrc tool.
    pause
    exit /b %errorlevel%
)
rsrc -ico favicon.ico -o resource.syso
if %errorlevel% neq 0 (
    echo [ERROR] Failed to generate resource file from icon.
    pause
    exit /b %errorlevel%
)

echo [3/5] Compiling Pycasa.exe (with hidden console window and embedded icon)...
go build -ldflags "-H windowsgui -s -w" -o Pycasa.exe .
if %errorlevel% neq 0 (
    echo [ERROR] Go compilation failed.
    echo.
    pause
    exit /b %errorlevel%
)

echo [4/5] Checking for Pycasa server JAR file...
set "JAR_EXISTS=0"
for %%f in (*runner.jar pycasa-*.jar) do (
    set "JAR_EXISTS=1"
    set "FOUND_JAR=%%f"
)

if "!JAR_EXISTS!"=="1" (
    echo [INFO] Local server JAR already exists: !FOUND_JAR!
) else (
    echo Server JAR not found locally. Fetching latest release from GitHub...
    powershell -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; try { $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/Pycasa/Pycasa/releases/latest'; $a = $r.assets | Where-Object { $_.name -like '*runner.jar' -or $_.name -like '*.jar' } | Select-Object -First 1; if ($a) { Write-Host ('Downloading latest server JAR: ' + $a.name + ' (' + [math]::round($a.size/1MB, 1) + ' MB)...'); Invoke-WebRequest -Uri $a.browser_download_url -OutFile $a.name; Write-Host 'Download complete' } else { throw 'No JAR asset found' } } catch { Write-Warning ('Failed to download from GitHub: ' + $_.Exception.Message) }"
)

echo [5/5] Building Windows installer (PycasaSetup.exe)...

:: Look for ISCC.exe (Inno Setup compiler) in standard install locations
set "ISCC="
for %%p in (
    "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    "%ProgramFiles%\Inno Setup 6\ISCC.exe"
    "%ProgramFiles(x86)%\Inno Setup 5\ISCC.exe"
    "%ProgramFiles%\Inno Setup 5\ISCC.exe"
) do (
    if exist %%p set "ISCC=%%p"
)

if "!ISCC!"=="" (
    echo [WARNING] Inno Setup not found. Skipping installer build.
    echo           Download from https://jrsoftware.org/isdl.php to build the installer.
    echo           The bare Pycasa.exe was still built successfully.
) else (
    echo Using Inno Setup compiler: !ISCC!
    !ISCC! pycasa.iss
    if !errorlevel! neq 0 (
        echo [ERROR] Inno Setup compilation failed.
        pause
        exit /b !errorlevel!
    )
    echo [INFO] Installer created: dist\PycasaSetup.exe
)

echo.
echo ===================================================
echo [SUCCESS] Build completed successfully!
echo.
echo   Wrapper exe : apps/windows/Pycasa.exe
echo   Installer   : apps/windows/dist/PycasaSetup.exe
echo.
echo Distribute 'PycasaSetup.exe' to end users.
echo ===================================================
echo.
pause
