package main

import (
	"log"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/getlantern/systray"
)

// SetupTray configures the system tray icon, tooltip, menu items, and listens to user interactions
func SetupTray(port int, onOpen func(), onSettings func(), onQuit func()) {
	systray.SetIcon(IconBytes)
	systray.SetTitle("Pycasa")
	systray.SetTooltip("Pycasa Photo Manager")

	mOpen := systray.AddMenuItem("Open app", "Open the Pycasa Web Gallery")
	mSettings := systray.AddMenuItem("Settings", "Configure Pycasa")
	mLogs := systray.AddMenuItem("View Logs", "View server logs")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Shutdown Pycasa and Exit")

	// Start a goroutine to handle clicks on the system tray menu items
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				onOpen()

			case <-mSettings.ClickedCh:
				onSettings()

			case <-mLogs.ClickedCh:
				configDir := GetConfigDir()
				logFilePath := filepath.Join(configDir, "logs", "pycasa.log")
				
				// Open the log file using Windows Notepad
				cmd := exec.Command("notepad.exe", logFilePath)
				cmd.SysProcAttr = &syscall.SysProcAttr{
					CreationFlags: 0x08000000, // CREATE_NO_WINDOW
				}
				if err := cmd.Start(); err != nil {
					log.Printf("Failed to open logs: %v", err)
				}

			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}
