package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"time"
	"unsafe"

	"github.com/getlantern/systray"
	"golang.org/x/sys/windows"
)

var (
	jarProcess    *exec.Cmd
	appConfig     *Config
	edgeProcesses []*exec.Cmd
)

func showMessageBox(title, text string, style uintptr) {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	textPtr, _ := windows.UTF16PtrFromString(text)
	windows.NewLazySystemDLL("user32.dll").NewProc("MessageBoxW").Call(
		0,
		uintptr(unsafe.Pointer(textPtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		style,
	)
}

func main() {
	var err error
	appConfig, err = LoadConfig()
	if err != nil {
		showMessageBox("Pycasa Error", fmt.Sprintf("Failed to load config: %v", err), 0x00000010) // MB_ICONERROR
		return
	}

	// 1. Check if Pycasa is already running
	if IsPortOpen(appConfig.Port) {
		// If responsive, focus the window and exit
		if IsServerHealthy(appConfig.Port) {
			if FocusWindow("Pycasa") {
				return
			}
			// If not focused (e.g. window closed), just open Edge and exit
			err = launchEdge(fmt.Sprintf("http://127.0.0.1:%d", appConfig.Port))
			if err != nil {
				showMessageBox("Pycasa Error", fmt.Sprintf("Failed to open browser: %v", err), 0x00000010)
			}
			return
		}
		// If port is occupied but server is not healthy, alert the user
		showMessageBox("Pycasa Warning", fmt.Sprintf("Port %d is already in use by another application. Please free this port or change it in config.json.", appConfig.Port), 0x00000030) // MB_ICONWARNING
		return
	}

	// 2. Check and Install JRE if not present
	localJREDir := appConfig.LocalJRE
	if localJREDir == "" {
		localJREDir = filepath.Join(GetConfigDir(), "jre")
	}

	javaExe, err := FindJavaExecutable(localJREDir)
	if err != nil {
		// JRE is missing, start downloader
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			showMessageBox("Pycasa Error", fmt.Sprintf("Failed to start JRE installer server: %v", err), 0x00000010)
			return
		}
		tempPort := listener.Addr().(*net.TCPAddr).Port
		shutdownChan := make(chan struct{})

		// Start progress server
		go StartProgressServer(listener, shutdownChan)

		// Open Edge to display downloader progress
		edgeCmd, err := LaunchEdgeApp(fmt.Sprintf("http://127.0.0.1:%d/install", tempPort))
		if err != nil {
			close(shutdownChan)
			listener.Close()
			showMessageBox("Pycasa Error", fmt.Sprintf("Failed to open browser for JRE installation: %v", err), 0x00000010)
			return
		}

		// Download and install JRE to local config path
		installDir := filepath.Join(GetConfigDir(), "jre")
		err = DownloadAndInstallJRE(installDir)

		// Terminate downloader window and server
		if edgeCmd != nil && edgeCmd.Process != nil {
			edgeCmd.Process.Kill()
		}
		close(shutdownChan)
		listener.Close()

		if err != nil {
			showMessageBox("Pycasa Error", fmt.Sprintf("Failed to install Java Runtime Environment:\n%v\n\nPycasa cannot run without Java.", err), 0x00000010)
			return
		}

		// Find java executable again after install
		javaExe, err = FindJavaExecutable(installDir)
		if err != nil {
			showMessageBox("Pycasa Error", "Java installation verified but executable java.exe not found.", 0x00000010)
			return
		}
	}

	// 3. Locate Pycasa JAR file — always search relative to the exe's own directory
	// so the bundled JAR is found after installation to Program Files.
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)

	searchPatterns := []string{
		filepath.Join(exeDir, "*runner.jar"),
		filepath.Join(exeDir, "pycasa-*.jar"),
		filepath.Join(exeDir, "*.jar"),
	}

	var jarPath string
	for _, pattern := range searchPatterns {
		matches, err := filepath.Glob(pattern)
		if err == nil && len(matches) > 0 {
			jarPath = matches[0]
			break
		}
	}

	if jarPath == "" {
		showMessageBox("Pycasa Error", "Pycasa server JAR file not found.\n\nPlease reinstall Pycasa or contact support.", 0x00000010)
		return
	}

	// 4. Start Pycasa JAR in background
	jarProcess, err = StartJavaJar(javaExe, jarPath, appConfig.Port)
	if err != nil {
		showMessageBox("Pycasa Error", fmt.Sprintf("Failed to start server JAR: %v", err), 0x00000010)
		return
	}

	// 5. Run Tray Application (Blocks main thread)
	systray.Run(onReady, onExit)
}

func onReady() {
	// Set up the tray menu
	SetupTray(
		appConfig.Port,
		func() { // onOpen
			if !FocusWindow("Pycasa") {
				launchEdge(fmt.Sprintf("http://127.0.0.1:%d", appConfig.Port))
			}
		},
		func() { // onSettings
			if !FocusWindow("Pycasa") {
				launchEdge(fmt.Sprintf("http://127.0.0.1:%d/settings", appConfig.Port))
			} else {
				// If window is open, navigate to settings by opening settings URL
				launchEdge(fmt.Sprintf("http://127.0.0.1:%d/settings", appConfig.Port))
			}
		},
		func() { // onQuit
			systray.Quit()
		},
	)

	// Poll Pycasa server health check in background. Once healthy, open the UI
	go func() {
		retries := 0
		maxRetries := 60 // 60 retries * 500ms = 30 seconds max wait
		for retries < maxRetries {
			if IsServerHealthy(appConfig.Port) {
				err := launchEdge(fmt.Sprintf("http://127.0.0.1:%d", appConfig.Port))
				if err != nil {
					logError("Failed to auto-open app in browser: %v", err)
				}
				return
			}
			time.Sleep(500 * time.Millisecond)
			retries++
		}
		// If server failed to start, show dialog
		showMessageBox("Pycasa Timeout", "Pycasa server is taking too long to start. You can check the logs via the System Tray menu.", 0x00000030)
	}()
}

func onExit() {
	logError("onExit: force-killing all processes (kill -9 equivalent)...")

	// --- Kill Edge windows ---
	for i, cmd := range edgeProcesses {
		if cmd != nil && cmd.Process != nil {
			logError("Force-killing Edge process %d (PID: %d)", i, cmd.Process.Pid)
			ForceKillPID(cmd.Process.Pid)
		}
	}

	// --- Kill JAR: Layer 1 - use tracked PID ---
	if jarProcess != nil && jarProcess.Process != nil {
		pid := jarProcess.Process.Pid
		logError("Force-killing JAR process (PID: %d) via TerminateProcess + taskkill...", pid)
		ForceKillPID(pid)
	} else {
		logError("jarProcess PID not available, falling back to port-based kill...")
	}

	// --- Kill JAR: Layer 2 - nuke by port (catches any JVM that slipped through) ---
	if appConfig != nil {
		logError("Force-killing any process on port %d via netstat...", appConfig.Port)
		ForceKillByPort(appConfig.Port)
	}

	logError("Force exit complete.")
	os.Exit(0)
}

func logError(format string, args ...interface{}) {
	configDir := GetConfigDir()
	logsDir := filepath.Join(configDir, "logs")
	os.MkdirAll(logsDir, 0755)

	logFilePath := filepath.Join(logsDir, "pycasa.log")
	logFile, err := os.OpenFile(logFilePath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0644)
	if err == nil {
		defer logFile.Close()
		logFile.WriteString(fmt.Sprintf("[ERROR] "+format+"\n", args...))
	}
}

func launchEdge(url string) error {
	cmd, err := LaunchEdgeApp(url)
	if err != nil {
		return err
	}
	if cmd != nil {
		edgeProcesses = append(edgeProcesses, cmd)
	}
	return nil
}
