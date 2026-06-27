package com.pycasa.resource;

import com.pycasa.entity.MonitoredFolder;
import com.pycasa.repository.DatabaseRepository;
import com.pycasa.service.FolderScanService;
import com.pycasa.service.NotificationService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.awt.FileDialog;
import java.awt.Frame;
import java.io.File;
import java.util.*;
import javax.swing.JFileChooser;
import javax.swing.SwingUtilities;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@Path("/api/folders")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class FolderResource {
    private static final Logger LOG = Logger.getLogger(FolderResource.class);

    @Inject DatabaseRepository db;

    @Inject FolderScanService scanService;

    @Inject NotificationService notificationService;

    @ConfigProperty(name = "couchbase.lite.database.directory")
    String dbDirectory;

    public record AddFolderRequest(String path, String label) {}

    @GET
    public Response listFolders() {
        try {
            // Retrieve folders
            List<MonitoredFolder> folders = db.listFolders();
            // Populate image counts for each folder
            for (MonitoredFolder f : folders) {
                try {
                    long cnt = db.countImagesByFolderId(f.id);
                    f.imageCount = cnt;
                } catch (Exception e) {
                    LOG.warnf("Failed to count images for folder %s: %s", f.id, e.getMessage());
                    f.imageCount = 0L;
                }
            }
            return Response.ok(folders).build();
        } catch (Exception e) {
            LOG.warn("listFolders failed: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", "Failed to list folders"))
                    .build();
        }
    }

    @POST
    public Response addFolder(AddFolderRequest req) {
        if (req.path() == null || req.path().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "path is required"))
                    .build();
        }
        File dir = new File(req.path());
        if (!dir.exists() || !dir.isDirectory()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Path does not exist or is not a directory"))
                    .build();
        }
        MonitoredFolder folder =
                new MonitoredFolder(
                        "folder_" + UUID.randomUUID().toString().replace("-", ""),
                        req.path(),
                        req.label() != null ? req.label() : dir.getName());
        db.save(folder.id, folder);
        // Trigger a scan for this folder only (not all folders)
        scanService.startFolderScan(folder);
        return Response.ok(folder).build();
    }

    @GET
    @Path("/scanning")
    public Response getScanningFolders() {
        return Response.ok(scanService.getScanningFolderIds()).build();
    }

    @POST
    @Path("/{id}/rescan")
    public Response rescanFolder(@PathParam("id") String id) {
        MonitoredFolder folder = db.get(id, MonitoredFolder.class);
        if (folder == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Folder not found"))
                    .build();
        }
        if (scanService.isScanningFolder(id)) {
            return Response.status(Response.Status.CONFLICT)
                    .entity(Map.of("error", "Scan already running for this folder"))
                    .build();
        }
        scanService.startFolderScan(folder, true);
        return Response.ok(Map.of("message", "Rescan started")).build();
    }

    @DELETE
    @Path("/{id}")
    public Response removeFolder(@PathParam("id") String id) {
        MonitoredFolder folder = db.get(id, MonitoredFolder.class);
        String folderLabel = folder != null && folder.label != null ? folder.label : id;
        String folderPath = folder != null && folder.path != null ? folder.path : id;

        long total = db.countImagesByFolderId(id);

        // Broadcast start event
        notificationService.broadcast(
                "folder-delete:started",
                Map.of(
                        "message", "Removing location: " + folderLabel,
                        "folder_id", id,
                        "folder_path", folderPath,
                        "total", total));

        // Run deletion in a background thread so the response returns immediately
        new Thread(
                        () -> {
                            try {
                                // Cancel any in-progress scan for this folder first, then wait for
                                // it to stop
                                scanService.cancelFolderScan(id);

                                db.deleteImagesByFolderIdWithProgress(
                                        id,
                                        (deleted, ttl) ->
                                                notificationService.broadcast(
                                                        "folder-delete:progress",
                                                        Map.of(
                                                                "folder_id", id,
                                                                "deleted", deleted,
                                                                "total", ttl)));
                                db.delete(id);

                                notificationService.broadcast(
                                        "folder-delete:completed",
                                        Map.of(
                                                "message", "Location removed: " + folderLabel,
                                                "folder_id", id,
                                                "folder_path", folderPath,
                                                "total", total));
                            } catch (Exception e) {
                                LOG.errorf("Failed to delete folder %s: %s", id, e.getMessage());
                                notificationService.broadcast(
                                        "folder-delete:error",
                                        Map.of(
                                                "message",
                                                "Failed to remove: " + folderLabel,
                                                "detail",
                                                e.getMessage() != null
                                                        ? e.getMessage()
                                                        : "unknown error",
                                                "folder_id",
                                                id));
                            }
                        })
                .start();

        return Response.ok(Map.of("message", "Folder removal started")).build();
    }

    @GET
    @Path("/{id}/hierarchy")
    public Response getHierarchy(@PathParam("id") String id) {
        MonitoredFolder folder = db.get(id, MonitoredFolder.class);
        if (folder == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Folder not found"))
                    .build();
        }
        return Response.ok(buildHierarchy(new File(folder.path))).build();
    }

    @GET
    @Path("/list")
    public Response listDir(@QueryParam("path") String path) {
        File dir = path != null ? new File(path) : new File(System.getProperty("user.home"));
        if (!dir.exists() || !dir.isDirectory()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Not a valid directory"))
                    .build();
        }
        List<Map<String, Object>> entries = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files != null) {
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File f : files) {
                if (f.isDirectory() && !f.isHidden()) {
                    entries.add(
                            Map.of(
                                    "name",
                                    f.getName(),
                                    "path",
                                    f.getAbsolutePath(),
                                    "type",
                                    "directory"));
                }
            }
        }
        return Response.ok(Map.of("path", dir.getAbsolutePath(), "entries", entries)).build();
    }

    @POST
    @Path("/browse")
    public Response browse() {
        try {
            String os = System.getProperty("os.name", "").toLowerCase();
            final String[] result = {null};

            if (os.contains("mac")) {
                // macOS: use AWT FileDialog in directory-selection mode (native sheet)
                System.setProperty("apple.awt.fileDialogForDirectories", "true");
                try {
                    java.awt.EventQueue.invokeAndWait(
                            () -> {
                                FileDialog dialog =
                                        new FileDialog(
                                                (Frame) null, "Select Folder", FileDialog.LOAD);
                                dialog.setDirectory(System.getProperty("user.home"));
                                dialog.setVisible(true);
                                String dir = dialog.getDirectory();
                                String file = dialog.getFile();
                                if (dir != null && file != null) {
                                    result[0] = new File(dir, file).getAbsolutePath();
                                } else if (dir != null) {
                                    result[0] = dir;
                                }
                            });
                } finally {
                    System.clearProperty("apple.awt.fileDialogForDirectories");
                }
            } else {
                // Windows / Linux: use Swing JFileChooser
                SwingUtilities.invokeAndWait(
                        () -> {
                            JFileChooser chooser =
                                    new JFileChooser(System.getProperty("user.home"));
                            chooser.setDialogTitle("Select Folder");
                            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                            chooser.setAcceptAllFileFilterUsed(false);
                            int ret = chooser.showOpenDialog(null);
                            if (ret == JFileChooser.APPROVE_OPTION) {
                                result[0] = chooser.getSelectedFile().getAbsolutePath();
                            }
                        });
            }

            if (result[0] == null) {
                return Response.status(Response.Status.NO_CONTENT).build();
            }
            return Response.ok(Map.of("path", result[0])).build();
        } catch (Exception e) {
            LOG.warnf("Native folder picker failed: %s", e.getMessage());
            return Response.serverError().entity(Map.of("error", e.getMessage())).build();
        }
    }

    @GET
    @Path("/trash-path")
    public Response getTrashPath() {
        String dir = dbDirectory.replace("${user.home}", System.getProperty("user.home"));
        String trashPath = dir + File.separator + "trash";
        return Response.ok(Map.of("path", trashPath)).build();
    }

    @POST
    @Path("/trash-path")
    public Response updateTrashPath(Map<String, String> body) {
        // Trash path is fixed in this implementation
        return Response.ok(Map.of("message", "Trash path is managed automatically")).build();
    }

    private Map<String, Object> buildHierarchy(File dir) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("name", dir.getName());
        node.put("path", dir.getAbsolutePath());
        node.put("type", "directory");
        List<Map<String, Object>> children = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files != null) {
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File f : files) {
                if (f.isDirectory() && !f.isHidden()) {
                    children.add(
                            Map.of(
                                    "name",
                                    f.getName(),
                                    "path",
                                    f.getAbsolutePath(),
                                    "type",
                                    "directory"));
                }
            }
        }
        node.put("children", children);
        return node;
    }
}
