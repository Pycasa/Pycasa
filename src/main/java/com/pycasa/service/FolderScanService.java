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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

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

    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private final AtomicInteger scanned = new AtomicInteger(0);
    private final AtomicInteger total = new AtomicInteger(0);

    public record ScanStatus(boolean running, int scanned, int total) {}

    public ScanStatus getScanStatus() {
        return new ScanStatus(scanning.get(), scanned.get(), total.get());
    }

    public void triggerScan() {
        if (scanning.compareAndSet(false, true)) {
            new Thread(this::doScan).start();
        }
    }

    private void doScan() {
        try {
            List<MonitoredFolder> folders = db.listFolders();
            scanned.set(0);
            total.set(0);
            notificationService.scanStarted();

            for (MonitoredFolder folder : folders) {
                File dir = new File(folder.path);
                if (!dir.exists() || !dir.isDirectory()) {
                    LOG.warnf("Folder does not exist or is not a directory: %s", folder.path);
                    continue;
                }
                scanDirectory(dir, folder.id);
            }
            int finalCount = scanned.get();
            LOG.infof("Scan complete. Indexed %d images.", finalCount);
            notificationService.scanCompleted(finalCount);
        } catch (Exception e) {
            LOG.error("Scan failed", e);
            notificationService.scanError(e.getMessage());
        } finally {
            scanning.set(false);
        }
    }

    private void scanDirectory(File dir, String folderId) {
        try {
            Files.walkFileTree(dir.toPath(), new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String name = file.getFileName().toString().toLowerCase();
                    String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
                    if (IMAGE_EXTENSIONS.contains(ext)) {
                        total.incrementAndGet();
                        indexImage(file, folderId, attrs);
                        scanned.incrementAndGet();
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
            LOG.warnf("Failed to scan directory %s: %s", dir, e.getMessage());
        }
    }

    private void indexImage(Path file, String folderId, BasicFileAttributes attrs) {
        try {
            String path = file.toAbsolutePath().toString();
            ImageRecord existing = db.findImageByPath(path);
            if (existing != null) return;

            ImageRecord img = new ImageRecord();
            img.id = "img_" + UUID.randomUUID().toString().replace("-", "");
            img.file_path = path;
            img.folder_id = folderId;
            img.file_size = attrs.size();
            img.modified_at = attrs.lastModifiedTime().toMillis();
            img.created_at = attrs.creationTime().toMillis();
            img.indexed_at = System.currentTimeMillis();
            img.ai_analysed = false;
            img.tags = new ArrayList<>();

            db.save(img.id, img);

            int s = scanned.get();
            int t = total.get();
            notificationService.scanProgress(s, t, file.getFileName().toString());
        } catch (Exception e) {
            LOG.warnf("Failed to index image %s: %s", file, e.getMessage());
        }
    }
}
