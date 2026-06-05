package com.pycasa.service;

import com.pycasa.entity.ImageRecord;
import com.pycasa.entity.MonitoredFolder;
import com.pycasa.repository.DatabaseRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.io.File;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
@ApplicationScoped
public class FolderScanService {

    private static final Logger LOG = Logger.getLogger(FolderScanService.class);

    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif", ".heic", ".heif"
    );

    @Inject
    DatabaseRepository db;

    @Inject
    NotificationService notificationService;

    // -------------------------------------------------------------------------
    // Per-folder scan state
    // -------------------------------------------------------------------------

    private static class FolderScanState {
        final String folderId;
        final String folderLabel;
        final boolean force;
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        final AtomicInteger scanned  = new AtomicInteger(0);
        final AtomicInteger total    = new AtomicInteger(0);
        final AtomicLong lastBroadcast = new AtomicLong(0);
        volatile Thread thread;

        FolderScanState(String folderId, String folderLabel, boolean force) {
            this.folderId    = folderId;
            this.folderLabel = folderLabel;
            this.force       = force;
        }
    }

    /** Live scan states keyed by folder ID. Removed once scan finishes. */
    private final ConcurrentHashMap<String, FolderScanState> activeScanStates = new ConcurrentHashMap<>();

    // -------------------------------------------------------------------------
    // Global "any scan running" flag — kept for backward-compat API response
    // -------------------------------------------------------------------------
    private final AtomicBoolean anyScanRunning = new AtomicBoolean(false);

    public record ScanStatus(boolean running, int scanned, int total) {}

    public ScanStatus getScanStatus() {
        if (activeScanStates.isEmpty()) {
            return new ScanStatus(false, 0, 0);
        }
        int totalScanned = 0, totalImages = 0;
        for (FolderScanState s : activeScanStates.values()) {
            totalScanned += s.scanned.get();
            totalImages  += s.total.get();
        }
        return new ScanStatus(true, totalScanned, totalImages);
    }

    /** Returns the set of folder IDs that currently have an active scan. */
    public Set<String> getScanningFolderIds() {
        return Collections.unmodifiableSet(activeScanStates.keySet());
    }

    /** Returns true if the given folder currently has an active scan running. */
    public boolean isScanningFolder(String folderId) {
        return activeScanStates.containsKey(folderId);
    }

    // -------------------------------------------------------------------------
    // Trigger a full scan (all folders, each in its own thread)
    // -------------------------------------------------------------------------

    public void triggerScan() {
        List<MonitoredFolder> folders = db.listFolders();
        if (folders.isEmpty()) return;

        for (MonitoredFolder folder : folders) {
            startFolderScan(folder);
        }
    }

    // -------------------------------------------------------------------------
    // Start scan for a single folder
    // -------------------------------------------------------------------------

    public void startFolderScan(MonitoredFolder folder) {
        startFolderScan(folder, false);
    }

    public void startFolderScan(MonitoredFolder folder, boolean force) {
        // Skip if a scan for this folder is already running
        if (activeScanStates.containsKey(folder.id)) {
            LOG.infof("Scan already running for folder %s, skipping", folder.id);
            return;
        }

        String label = folder.label != null ? folder.label : new File(folder.path).getName();
        FolderScanState state = new FolderScanState(folder.id, label, force);
        activeScanStates.put(folder.id, state);
        anyScanRunning.set(true);

        Thread t = new Thread(() -> doFolderScan(folder, state));
        t.setDaemon(true);
        t.setName("folder-scan-" + folder.id);
        state.thread = t;
        t.start();
    }

    // -------------------------------------------------------------------------
    // Cancel the scan for a specific folder (called when folder is being deleted)
    // -------------------------------------------------------------------------

    public void cancelFolderScan(String folderId) {
        FolderScanState state = activeScanStates.get(folderId);
        if (state == null) return;  // no active scan

        LOG.infof("Cancelling scan for folder %s", folderId);
        state.cancelled.set(true);

        String label = state.folderLabel;
        notificationService.broadcast("scan:cancelling", Map.of(
                "message", "Cancelling scan: " + label,
                "folder_id", folderId,
                "folder_label", label
        ));

        // Interrupt the thread so any blocking I/O wakes up
        if (state.thread != null) {
            state.thread.interrupt();
        }

        // Wait up to 5 s for the thread to finish
        if (state.thread != null) {
            try { state.thread.join(5_000); } catch (InterruptedException ignored) {}
        }
    }

    // -------------------------------------------------------------------------
    // Per-folder scan logic
    // -------------------------------------------------------------------------

    private void doFolderScan(MonitoredFolder folder, FolderScanState state) {
        String label = state.folderLabel;
        try {
            notificationService.broadcast("scan:folder:started", Map.of(
                    "message", "Scanning: " + label,
                    "folder_id", folder.id,
                    "folder_label", label
            ));

            File dir = new File(folder.path);
            if (!dir.exists() || !dir.isDirectory()) {
                LOG.warnf("Folder does not exist: %s", folder.path);
                db.deleteImagesByFolderId(folder.id);
                notificationService.broadcast("scan:folder:completed", Map.of(
                        "message", "Scan skipped (path missing): " + label,
                        "folder_id", folder.id,
                        "folder_label", label,
                        "scanned", 0
                ));
                return;
            }

            scanDirectory(dir, folder.id, state);

            if (state.cancelled.get()) {
                LOG.infof("Scan cancelled for folder %s after %d images", folder.id, state.scanned.get());
                notificationService.broadcast("scan:folder:cancelled", Map.of(
                        "message", "Scan cancelled: " + label,
                        "folder_id", folder.id,
                        "folder_label", label,
                        "scanned", state.scanned.get()
                ));
                return;
            }

            cleanupDeletedImages(folder.id, state);

            int finalCount = state.scanned.get();
            LOG.infof("Scan complete for folder %s. Indexed %d images.", folder.id, finalCount);
            notificationService.broadcast("scan:folder:completed", Map.of(
                    "message", "Scan complete: " + label + " — " + finalCount + " images",
                    "folder_id", folder.id,
                    "folder_label", label,
                    "scanned", finalCount
            ));

        } catch (Exception e) {
            if (state.cancelled.get()) {
                // Interrupted during cancellation — treat as cancelled
                notificationService.broadcast("scan:folder:cancelled", Map.of(
                        "message", "Scan cancelled: " + label,
                        "folder_id", folder.id,
                        "folder_label", label,
                        "scanned", state.scanned.get()
                ));
            } else {
                LOG.errorf("Scan failed for folder %s: %s", folder.id, e.getMessage());
                notificationService.broadcast("scan:folder:error", Map.of(
                        "message", "Scan error: " + label,
                        "detail", e.getMessage() != null ? e.getMessage() : "unknown error",
                        "folder_id", folder.id,
                        "folder_label", label
                ));
            }
        } finally {
            activeScanStates.remove(folder.id);
            if (activeScanStates.isEmpty()) {
                anyScanRunning.set(false);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Directory walk
    // -------------------------------------------------------------------------

    private void scanDirectory(File dir, String folderId, FolderScanState state) {
        try {
            Files.walkFileTree(dir.toPath(), new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (state.cancelled.get() || Thread.currentThread().isInterrupted()) {
                        return FileVisitResult.TERMINATE;
                    }
                    String name = file.getFileName().toString().toLowerCase();
                    String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
                    if (IMAGE_EXTENSIONS.contains(ext)) {
                        state.total.incrementAndGet();
                        indexImage(file, folderId, attrs, state);
                        state.scanned.incrementAndGet();
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, java.io.IOException exc) {
                    LOG.warnf("Could not access file: %s", file);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (Exception e) {
            if (!state.cancelled.get()) {
                LOG.warnf("Failed to scan directory %s: %s", dir, e.getMessage());
            }
        }
    }

    private void cleanupDeletedImages(String folderId, FolderScanState state) {
        try {
            List<ImageRecord> dbImages = db.listImages(folderId, null, null, null, null, 1, 1000000, null, null, null, null, null);
            int deletedCount = 0;
            for (ImageRecord img : dbImages) {
                if (state.cancelled.get()) break;
                if (img.file_path != null && !new File(img.file_path).exists()) {
                    db.delete(img.id);
                    deletedCount++;
                    LOG.infof("Removed stale image record: %s", img.file_path);
                }
            }
            if (deletedCount > 0) {
                LOG.infof("Cleaned up %d stale image records for folder %s", deletedCount, folderId);
            }
        } catch (Exception e) {
            LOG.warnf("Cleanup failed for folder %s: %s", folderId, e.getMessage());
        }
    }

    private void indexImage(Path file, String folderId, BasicFileAttributes attrs, FolderScanState state) {
        try {
            String path = file.toAbsolutePath().toString();
            ImageRecord existing = db.findImageByPath(path);
            if (existing != null) {
                if (!state.force) return;   // incremental: skip already-indexed images
                // Force rescan: drop the old record so we re-index fresh below
                db.delete(existing.id);
            }

            ImageRecord img = new ImageRecord();
            img.id          = "img_" + UUID.randomUUID().toString().replace("-", "");
            img.file_path   = path;
            img.folder_id   = folderId;
            img.file_size   = attrs.size();
            img.modified_at = attrs.lastModifiedTime().toMillis();
            img.created_at  = attrs.creationTime().toMillis();
            img.indexed_at  = System.currentTimeMillis();
            img.ai_analysed = false;
            img.tags        = new ArrayList<>();

            db.save(img.id, img);

            long now  = System.currentTimeMillis();
            long last = state.lastBroadcast.get();
            if (now - last > 500) {
                state.lastBroadcast.set(now);
                notificationService.broadcast("scan:folder:progress", Map.of(
                        "folder_id",    folderId,
                        "folder_label", state.folderLabel,
                        "scanned",      state.scanned.get(),
                        "total",        state.total.get(),
                        "current_file", file.getFileName().toString()
                ));
            }
        } catch (Exception e) {
            LOG.warnf("Failed to index image %s: %s", file, e.getMessage());
        }
    }
}
