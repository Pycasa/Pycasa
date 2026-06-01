package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type ProgressInfo struct {
	Percent int    `json:"percent"`
	Status  string `json:"status"`
}

var (
	progressMu sync.RWMutex
	currentProgress ProgressInfo = ProgressInfo{Percent: 0, Status: "Initializing..."}
	progressClients []chan ProgressInfo
	clientsMu sync.Mutex
)

func updateProgress(percent int, status string) {
	progressMu.Lock()
	currentProgress = ProgressInfo{Percent: percent, Status: status}
	progressMu.Unlock()

	clientsMu.Lock()
	defer clientsMu.Unlock()
	for _, ch := range progressClients {
		// Non-blocking send
		select {
		case ch <- currentProgress:
		default:
		}
	}
}

// DownloadAndInstallJRE downloads the latest Adoptium Temurin JRE 17 and unzips it into targetDir.
func DownloadAndInstallJRE(targetDir string) error {
	url := "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse"
	
	updateProgress(1, "Connecting to JRE download server...")
	
	// Create request
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request: %w", err)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to Adoptium servers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download server returned status: %s", resp.Status)
	}

	totalSize := resp.ContentLength
	tempZipFile := filepath.Join(os.TempDir(), "pycasa_jre_temp.zip")
	
	out, err := os.Create(tempZipFile)
	if err != nil {
		return fmt.Errorf("failed to create temporary zip file: %w", err)
	}
	defer func() {
		out.Close()
		os.Remove(tempZipFile) // Clean up temp zip
	}()

	updateProgress(2, "Downloading JRE 17 zip file...")

	// Copy with progress tracking
	buffer := make([]byte, 32*1024)
	var downloaded int64
	lastUpdate := time.Now()

	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			_, writeErr := out.Write(buffer[:n])
			if writeErr != nil {
				return fmt.Errorf("failed to write to temporary file: %w", writeErr)
			}
			downloaded += int64(n)
			
			// Limit progress updates to avoid flooding
			if time.Since(lastUpdate) > 100*time.Millisecond || downloaded == totalSize {
				var percent int
				if totalSize > 0 {
					// Map download to 2% - 85% range, leave remaining for extraction
					percent = int(2 + (float64(downloaded)/float64(totalSize))*83)
				} else {
					percent = 40 // Fallback if content-length is unknown
				}
				mbDownloaded := float64(downloaded) / 1024 / 1024
				var totalMBStr string
				if totalSize > 0 {
					totalMBStr = fmt.Sprintf("/%.1f MB", float64(totalSize)/1024/1024)
				}
				status := fmt.Sprintf("Downloading JRE 17... (%.1f%s)", mbDownloaded, totalMBStr)
				updateProgress(percent, status)
				lastUpdate = time.Now()
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("error reading download stream: %w", err)
		}
	}

	out.Close()
	updateProgress(85, "Download complete. Verifying archive...")

	// Extract ZIP
	updateProgress(86, "Installing JRE... (Preparing extraction)")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create target JRE folder: %w", err)
	}

	archive, err := zip.OpenReader(tempZipFile)
	if err != nil {
		return fmt.Errorf("failed to open downloaded zip file: %w", err)
	}
	defer archive.Close()

	totalFiles := len(archive.File)
	for i, file := range archive.File {
		// Strip root folder name (e.g. "jdk-17.0.7+7-jre/bin/java.exe" -> "bin/java.exe")
		parts := strings.Split(file.Name, "/")
		if len(parts) <= 1 {
			continue // Skip the root directory folder itself
		}
		strippedPath := filepath.Join(parts[1:]...)
		filePath := filepath.Join(targetDir, strippedPath)

		// Update progress for extraction (map 86% - 99%)
		if i%50 == 0 || i == totalFiles-1 {
			percent := int(86 + (float64(i)/float64(totalFiles))*13)
			updateProgress(percent, fmt.Sprintf("Extracting files... (%d/%d)", i+1, totalFiles))
		}

		if file.FileInfo().IsDir() {
			os.MkdirAll(filePath, file.Mode())
			continue
		}

		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			return err
		}

		dstFile, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, file.Mode())
		if err != nil {
			return err
		}

		srcFile, err := file.Open()
		if err != nil {
			dstFile.Close()
			return err
		}

		if _, err := io.Copy(dstFile, srcFile); err != nil {
			dstFile.Close()
			srcFile.Close()
			return err
		}

		dstFile.Close()
		srcFile.Close()
	}

	updateProgress(100, "Java Runtime Environment installed successfully!")
	time.Sleep(500 * time.Millisecond) // Give UI a brief moment to show 100%
	return nil
}

// StartProgressServer starts a temporary local server to serve the download page and stream SSE progress.
func StartProgressServer(listener net.Listener, shutdownChan chan struct{}) {
	mux := http.NewServeMux()

	// Serve the progress page HTML
	mux.HandleFunc("/install", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(ProgressHTML))
	})

	// Server-Sent Events (SSE) endpoint for progress updates
	mux.HandleFunc("/progress", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		// Register client channel
		ch := make(chan ProgressInfo, 10)
		clientsMu.Lock()
		progressClients = append(progressClients, ch)
		clientsMu.Unlock()

		defer func() {
			clientsMu.Lock()
			for i, c := range progressClients {
				if c == ch {
					progressClients = append(progressClients[:i], progressClients[i+1:]...)
					break
				}
			}
			clientsMu.Unlock()
			close(ch)
		}()

		// Send initial state
		progressMu.RLock()
		initData, _ := json.Marshal(currentProgress)
		progressMu.RUnlock()
		fmt.Fprintf(w, "data: %s\n\n", string(initData))
		flusher.Flush()

		// Stream updates
		for {
			select {
			case info := <-ch:
				data, err := json.Marshal(info)
				if err == nil {
					fmt.Fprintf(w, "data: %s\n\n", string(data))
					flusher.Flush()
				}
			case <-r.Context().Done():
				return
			case <-shutdownChan:
				return
			}
		}
	})

	server := &http.Server{
		Handler: mux,
	}

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("Progress server error: %v", err)
		}
	}()

	// Wait for shutdown trigger
	<-shutdownChan
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	server.Shutdown(ctx)
}
