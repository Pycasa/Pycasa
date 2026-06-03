@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo Building Pycasa Windows Installer
echo ===================================================
echo.

:: Optional: pass version as first argument, e.g. build.bat v1.2.3
:: Defaults to "dev" if not provided
set "APP_VERSION=%~1"
if "!APP_VERSION!"=="" set "APP_VERSION=dev"
echo Version: !APP_VERSION!
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

echo [1/7] Building Maven project (Java/Quarkus server)...
where mvn >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Maven is not installed or not in your Windows PATH.
    echo           Skipping Maven build and searching for existing JAR.
) else (
    echo Running: mvn clean package -DskipTests
    pushd ..\..
    call mvn clean package -DskipTests
    if !errorlevel! neq 0 (
        echo [ERROR] Maven build failed.
        popd
        pause
        exit /b !errorlevel!
    )
    popd
)

echo [2/7] Fetching dependencies and tidying go.mod...
go mod tidy
if %errorlevel% neq 0 (
    echo [ERROR] Failed to fetch Go dependencies.
    echo.
    pause
    exit /b %errorlevel%
)

echo [3/7] Embedding app icon into executable...
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

echo [4/7] Compiling Pycasa.exe (with hidden console window and embedded icon)...
go build -ldflags "-H windowsgui -s -w" -o Pycasa.exe .
if %errorlevel% neq 0 (
    echo [ERROR] Go compilation failed.
    echo.
    pause
    exit /b %errorlevel%
)

echo [5/7] Checking for Pycasa server JAR file...
set "JAR_EXISTS=0"
for %%f in (*runner.jar pycasa-*.jar) do (
    set "JAR_EXISTS=1"
    set "FOUND_JAR=%%f"
)

if "!JAR_EXISTS!"=="0" (
    if exist "..\..\target" (
        for %%f in (..\..\target\*runner.jar ..\..\target\pycasa-*.jar) do (
            if exist "%%f" (
                echo [INFO] Found local Maven target JAR: %%f
                copy /y "%%f" . >nul
                set "JAR_EXISTS=1"
                set "FOUND_JAR=%%~nxf"
            )
        )
    )
)

if "!JAR_EXISTS!"=="1" (
    echo [INFO] Server JAR ready: !FOUND_JAR!
) else (
    echo Server JAR not found locally. Fetching latest release from GitHub...
    powershell -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; try { $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/Pycasa/Pycasa/releases/latest'; $a = $r.assets | Where-Object { $_.name -like '*runner.jar' -or $_.name -like '*.jar' } | Select-Object -First 1; if ($a) { Write-Host ('Downloading latest server JAR: ' + $a.name + ' (' + [math]::round($a.size/1MB, 1) + ' MB)...'); Invoke-WebRequest -Uri $a.browser_download_url -OutFile $a.name; Write-Host 'Download complete' } else { throw 'No JAR asset found' } } catch { Write-Warning ('Failed to download from GitHub: ' + $_.Exception.Message) }"
)

:: Re-verify after fallback
set "JAR_EXISTS=0"
for %%f in (*runner.jar pycasa-*.jar) do (
    set "JAR_EXISTS=1"
    set "FOUND_JAR=%%f"
)
if "!JAR_EXISTS!"=="0" (
    echo [ERROR] JAR file is missing. Inno Setup will fail to compile.
    echo         Please run 'mvn clean package -DskipTests' in the root directory first.
    pause
    exit /b 1
)

echo [6/7] Generating installer branding images from favicon.ico...
powershell -NoProfile -ExecutionPolicy Bypass -File make-installer-images.ps1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to generate installer images.
    pause
    exit /b %errorlevel%
)

echo [7/7] Building Windows installer (PycasaSetup-!APP_VERSION!.exe)...

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
    !ISCC! /DMyAppVersion=!APP_VERSION! pycasa.iss
    if !errorlevel! neq 0 (
        echo [ERROR] Inno Setup compilation failed.
        pause
        exit /b !errorlevel!
    )
    echo [INFO] Installer created: dist\PycasaSetup-!APP_VERSION!.exe
)

echo.
echo ===================================================
echo [SUCCESS] Build completed successfully!
echo.
echo   Wrapper exe : Pycasa.exe
echo   Installer   : dist\PycasaSetup-!APP_VERSION!.exe
echo.
echo Distribute 'PycasaSetup-!APP_VERSION!.exe' to end users.
echo ===================================================
echo.
pause
