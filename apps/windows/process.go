package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	pFindWindow          = user32.NewProc("FindWindowW")
	pSetForegroundWindow = user32.NewProc("SetForegroundWindow")
)

// IsPortOpen checks if a TCP port is currently open and listening
func IsPortOpen(port int) bool {
	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", address, 100*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// IsServerHealthy checks if the Pycasa health endpoint is responsive
func IsServerHealthy(port int) bool {
	url := fmt.Sprintf("http://127.0.0.1:%d/api/health", port)
	client := http.Client{
		Timeout: 1 * time.Second,
	}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// FindEdgePath queries the Windows registry or checks standard paths to find msedge.exe
func FindEdgePath() string {
	// 1. Try Registry (HKEY_LOCAL_MACHINE)
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`, registry.QUERY_VALUE)
	if err == nil {
		val, _, err := k.GetStringValue("")
		k.Close()
		if err == nil && val != "" {
			return val
		}
	}

	// 2. Try Registry (HKEY_CURRENT_USER)
	k, err = registry.OpenKey(registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe`, registry.QUERY_VALUE)
	if err == nil {
		val, _, err := k.GetStringValue("")
		k.Close()
		if err == nil && val != "" {
			return val
		}
	}

	// 3. Try standard path
	stdPath := `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
	if _, err := os.Stat(stdPath); err == nil {
		return stdPath
	}

	// 4. Fallback to system search path
	return "msedge.exe"
}

// LaunchEdgeApp starts Microsoft Edge in "App Mode" pointing to the specified URL
func LaunchEdgeApp(url string) (*exec.Cmd, error) {
	edgePath := FindEdgePath()
	cmd := exec.Command(edgePath, "--app="+url)
	// Start as a detached background process so it doesn't block the Go app
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.CREATE_NO_WINDOW,
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return cmd, nil
}

// FindJavaExecutable attempts to find java.exe in the local JRE dir or system PATH
func FindJavaExecutable(localJREDir string) (string, error) {
	// 1. Check local JRE first
	if localJREDir != "" {
		localJava := filepath.Join(localJREDir, "bin", "java.exe")
		if _, err := os.Stat(localJava); err == nil {
			return localJava, nil
		}
	}

	// 2. Check system PATH
	path, err := exec.LookPath("java")
	if err == nil {
		return path, nil
	}

	return "", fmt.Errorf("java executable not found")
}

// StartJavaJar runs the Pycasa Quarkus JAR in the background and redirects output to a log file
func StartJavaJar(javaExe string, jarPath string, port int) (*exec.Cmd, error) {
	configDir := GetConfigDir()
	logsDir := filepath.Join(configDir, "logs")
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create logs directory: %w", err)
	}

	logFilePath := filepath.Join(logsDir, "pycasa.log")
	logFile, err := os.OpenFile(logFilePath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}

	// Write starting banner to log
	logFile.WriteString(fmt.Sprintf("\n\n--- PYCASA SERVER STARTING %s ---\n", time.Now().Format(time.RFC3339)))

	args := []string{
		"-jar",
		jarPath,
		"-Dquarkus.http.port=" + strconv.Itoa(port),
	}

	cmd := exec.Command(javaExe, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	// Ensure the command runs silently in the background with no console window flashing
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, err
	}

	// Keep log file handle open by closing it inside a goroutine after the process exits,
	// or close it here since the OS duplicates the handle for the child process stdout/stderr.
	logFile.Close()

	// Associate with Windows Job Object to guarantee process cleanup on exit
	if err := AssociateWithJobObject(cmd); err != nil {
		// Log warning but don't fail, we still have the Process.Kill() backup in onExit
		warnLogFile, err2 := os.OpenFile(logFilePath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0644)
		if err2 == nil {
			warnLogFile.WriteString(fmt.Sprintf("[WARNING] Job Object association failed: %v\n", err))
			warnLogFile.Close()
		}
	}

	return cmd, nil
}

// FocusWindow searches for a window with the given title and brings it to the front
func FocusWindow(title string) bool {
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return false
	}

	hwnd, _, _ := pFindWindow.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	if hwnd != 0 {
		pSetForegroundWindow.Call(hwnd)
		return true
	}
	return false
}

type JOBOBJECT_BASIC_LIMIT_INFORMATION struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type JOBOBJECT_EXTENDED_LIMIT_INFORMATION struct {
	BasicLimitInformation JOBOBJECT_BASIC_LIMIT_INFORMATION
	IoInfo                [96]byte // Placeholder for IoRateControlInformation struct
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

var hJob windows.Handle

// AssociateWithJobObject registers the child command process inside a Windows Job Object.
// The Job Object limits ensure that when the parent process exits or is closed, the child process is automatically killed by the OS.
func AssociateWithJobObject(cmd *exec.Cmd) error {
	var err error
	hJob, err = windows.CreateJobObject(nil, nil)
	if err != nil {
		return fmt.Errorf("CreateJobObject failed: %w", err)
	}

	info := JOBOBJECT_EXTENDED_LIMIT_INFORMATION{
		BasicLimitInformation: JOBOBJECT_BASIC_LIMIT_INFORMATION{
			LimitFlags: 0x2000, // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
		},
	}

	_, err = windows.SetInformationJobObject(
		hJob,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)),
		uint32(unsafe.Sizeof(info)),
	)
	if err != nil {
		windows.CloseHandle(hJob)
		hJob = 0
		return fmt.Errorf("SetInformationJobObject failed: %w", err)
	}

	hProcess, err := windows.OpenProcess(
		windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE,
		false,
		uint32(cmd.Process.Pid),
	)
	if err != nil {
		windows.CloseHandle(hJob)
		hJob = 0
		return fmt.Errorf("OpenProcess failed: %w", err)
	}
	defer windows.CloseHandle(hProcess)

	err = windows.AssignProcessToJobObject(hJob, hProcess)
	if err != nil {
		windows.CloseHandle(hJob)
		hJob = 0
		return fmt.Errorf("AssignProcessToJobObject failed: %w", err)
	}

	return nil
}
