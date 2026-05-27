package com.pycasa.resource;

import com.pycasa.entity.MonitoredFolder;
import com.pycasa.repository.DatabaseRepository;
import com.pycasa.service.FolderScanService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.File;
import java.util.*;

@Path("/api/folders")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class FolderResource {

    @Inject
    DatabaseRepository db;

    @Inject
    FolderScanService scanService;

    @ConfigProperty(name = "couchbase.lite.database.directory")
    String dbDirectory;

    public record AddFolderRequest(String path, String label) {}

    @GET
    public Response listFolders() {
        return Response.ok(db.listFolders()).build();
    }

    @POST
    public Response addFolder(AddFolderRequest req) {
        if (req.path() == null || req.path().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "path is required")).build();
        }
        File dir = new File(req.path());
        if (!dir.exists() || !dir.isDirectory()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Path does not exist or is not a directory")).build();
        }
        MonitoredFolder folder = new MonitoredFolder(
                "folder_" + UUID.randomUUID().toString().replace("-", ""),
                req.path(),
                req.label() != null ? req.label() : dir.getName()
        );
        db.save(folder.id, folder);
        // Trigger a scan in the background
        scanService.triggerScan();
        return Response.ok(folder).build();
    }

    @DELETE
    @Path("/{id}")
    public Response removeFolder(@PathParam("id") String id) {
        // First delete all image records that belong to this folder
        db.deleteImagesByFolderId(id);
        // Then delete the folder document itself
        db.delete(id);
        return Response.ok(Map.of("message", "Folder removed")).build();
    }

    @GET
    @Path("/{id}/hierarchy")
    public Response getHierarchy(@PathParam("id") String id) {
        MonitoredFolder folder = db.get(id, MonitoredFolder.class);
        if (folder == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Folder not found")).build();
        }
        return Response.ok(buildHierarchy(new File(folder.path))).build();
    }

    @GET
    @Path("/list")
    public Response listDir(@QueryParam("path") String path) {
        File dir = path != null ? new File(path) : new File(System.getProperty("user.home"));
        if (!dir.exists() || !dir.isDirectory()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Not a valid directory")).build();
        }
        List<Map<String, Object>> entries = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files != null) {
            Arrays.sort(files, Comparator.comparing(File::getName));
            for (File f : files) {
                if (f.isDirectory() && !f.isHidden()) {
                    entries.add(Map.of("name", f.getName(), "path", f.getAbsolutePath(), "type", "directory"));
                }
            }
        }
        return Response.ok(Map.of("path", dir.getAbsolutePath(), "entries", entries)).build();
    }

    @POST
    @Path("/browse")
    public Response browse() {
        // Returns the home directory as the starting point for browsing
        String home = System.getProperty("user.home");
        return Response.ok(Map.of("path", home)).build();
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
                    children.add(Map.of("name", f.getName(), "path", f.getAbsolutePath(), "type", "directory"));
                }
            }
        }
        node.put("children", children);
        return node;
    }
}
