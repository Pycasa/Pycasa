package com.pycasa.resource;

import com.pycasa.entity.ImageRecord;
import com.pycasa.repository.DatabaseRepository;
import com.pycasa.service.FolderScanService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.File;
import java.nio.file.Files;
import java.util.*;

@Path("/api/images")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ImageResource {

    private static final Logger LOG = Logger.getLogger(ImageResource.class);

    @Inject
    DatabaseRepository db;

    @Inject
    FolderScanService scanService;

    @ConfigProperty(name = "couchbase.lite.database.directory")
    String dbDirectory;

    @GET
    public Response listImages(
            @QueryParam("folder_id") String folderId,
            @QueryParam("search") String search,
            @QueryParam("tags") String tags,
            @QueryParam("sort_by") @DefaultValue("modified_at") String sortBy,
            @QueryParam("sort_order") @DefaultValue("DESC") String sortOrder,
            @QueryParam("page") @DefaultValue("1") int page,
            @QueryParam("limit") @DefaultValue("30") int limit) {

        List<String> tagList = (tags != null && !tags.isBlank())
                ? Arrays.asList(tags.split(","))
                : null;

        List<ImageRecord> images = db.listImages(folderId, search, tagList, sortBy, sortOrder, page, limit);
        return Response.ok(images).build();
    }

    @GET
    @Path("/tags")
    public Response getTags() {
        return Response.ok(db.listAllTags()).build();
    }

    @GET
    @Path("/metadata")
    public Response getMetadata(@QueryParam("path") String path, @QueryParam("id") String id) {
        if (path == null && id == null) {
            return Response.ok(db.getImageDateCounts()).build();
        }
        ImageRecord img = null;
        if (id != null) img = db.get(id, ImageRecord.class);
        if (img == null && path != null) img = db.findImageByPath(path);
        if (img == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Image not found")).build();
        }
        return Response.ok(img).build();
    }

    @GET
    @Path("/details")
    public Response getDetails(@QueryParam("path") String path) {
        if (path == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "path is required")).build();
        }
        ImageRecord img = db.findImageByPath(path);
        if (img == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Image not found")).build();
        }

        // Read actual pixel dimensions from the file
        int width = 0, height = 0;
        try {
            java.io.File file = new java.io.File(path);
            if (file.exists()) {
                try (javax.imageio.stream.ImageInputStream iis =
                             javax.imageio.ImageIO.createImageInputStream(file)) {
                    if (iis != null) {
                        java.util.Iterator<javax.imageio.ImageReader> readers =
                                javax.imageio.ImageIO.getImageReaders(iis);
                        if (readers.hasNext()) {
                            javax.imageio.ImageReader reader = readers.next();
                            try {
                                reader.setInput(iis);
                                width = reader.getWidth(0);
                                height = reader.getHeight(0);
                            } finally {
                                reader.dispose();
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            LOG.debugf("Could not read dimensions for %s: %s", path, e.getMessage());
        }

        // Build response map merging ImageRecord fields with dimensions
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("id", img.id);
        result.put("file_path", img.file_path);
        result.put("folder_id", img.folder_id);
        result.put("description", img.description);
        result.put("tags", img.tags);
        result.put("file_size", img.file_size);
        result.put("modified_at", img.modified_at);
        result.put("created_at", img.created_at);
        result.put("ai_analysed", img.ai_analysed);
        result.put("width", width);
        result.put("height", height);
        return Response.ok(result).build();
    }

    @PATCH
    @Path("/metadata")
    public Response updateMetadata(Map<String, Object> data) {
        String id = (String) data.get("id");
        String path = (String) data.get("file_path");
        ImageRecord img = null;
        if (id != null) img = db.get(id, ImageRecord.class);
        if (img == null && path != null) img = db.findImageByPath(path);
        if (img == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Image not found")).build();
        }
        if (data.containsKey("description")) img.description = (String) data.get("description");
        if (data.containsKey("tags")) {
            Object t = data.get("tags");
            if (t instanceof List) {
                @SuppressWarnings("unchecked")
                List<String> tagList = (List<String>) t;
                img.tags = tagList;
            }
        }
        db.save(img.id, img);
        return Response.ok(img).build();
    }

    @DELETE
    public Response deleteImage(@QueryParam("folder_id") String folderId,
                                @QueryParam("path") String path) {
        if (path == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "path is required")).build();
        }
        ImageRecord img = db.findImageByPath(path);
        if (img == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Image not found")).build();
        }

        // Move to trash instead of deleting
        try {
            String dir = dbDirectory.replace("${user.home}", System.getProperty("user.home"));
            File trashDir = new File(dir + File.separator + "trash");
            trashDir.mkdirs();
            File src = new File(path);
            File dest = new File(trashDir, src.getName());
            // Avoid overwriting existing trash files
            if (dest.exists()) {
                dest = new File(trashDir, System.currentTimeMillis() + "_" + src.getName());
            }
            Files.move(src.toPath(), dest.toPath());
        } catch (Exception e) {
            LOG.warnf("Could not move image to trash: %s", e.getMessage());
        }

        db.delete(img.id);
        return Response.ok(Map.of("message", "Image deleted")).build();
    }

    @GET
    @Path("/scan-status")
    public Response getScanStatus() {
        FolderScanService.ScanStatus status = scanService.getScanStatus();
        return Response.ok(Map.of(
                "running", status.running(),
                "scanned", status.scanned(),
                "total", status.total()
        )).build();
    }

    @POST
    @Path("/scan")
    public Response triggerScan() {
        scanService.triggerScan();
        return Response.ok(Map.of("message", "Scan triggered")).build();
    }

    @GET
    @Path("/raw")
    @Produces("*/*")
    public Response getRawImage(@QueryParam("path") String path) {
        if (path == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        File file = new File(path);
        if (!file.exists() || !file.isFile()) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        try {
            String mimeType = Files.probeContentType(file.toPath());
            if (mimeType == null) mimeType = "application/octet-stream";
            return Response.ok(file, mimeType)
                    .header("Cache-Control", "max-age=86400")
                    .build();
        } catch (Exception e) {
            return Response.serverError().build();
        }
    }
    @GET
    @Path("/thumbnail")
    @Produces("image/jpeg")
    public Response getThumbnail(@QueryParam("path") String path) {
        if (path == null) {
            return Response.status(Response.Status.BAD_REQUEST).build();
        }
        File src = new File(path);
        if (!src.exists()) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        try {
            // Determine thumbnail cache directory inside the DB directory
            String dir = dbDirectory.replace("${user.home}", System.getProperty("user.home"));
            File thumbDir = new File(dir, "thumbs");
            thumbDir.mkdirs();
            String thumbName = src.getName() + "_thumb.jpg";
            File thumbFile = new File(thumbDir, thumbName);
            if (!thumbFile.exists()) {
                // Generate thumbnail (max width 200px) using ImageIO
                java.awt.image.BufferedImage img = javax.imageio.ImageIO.read(src);
                if (img == null) {
                    return Response.status(Response.Status.INTERNAL_SERVER_ERROR).entity("Unable to read image").build();
                }
                int w = img.getWidth();
                int h = img.getHeight();
                int newW = Math.min(200, w);
                int newH = (newW * h) / w;
                java.awt.image.BufferedImage thumb = new java.awt.image.BufferedImage(newW, newH, java.awt.image.BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D g = thumb.createGraphics();
                g.drawImage(img, 0, 0, newW, newH, null);
                g.dispose();
                javax.imageio.ImageIO.write(thumb, "jpg", thumbFile);
            }
            return Response.ok(thumbFile, "image/jpeg").build();
        } catch (Exception e) {
            LOG.warnf("Failed to generate thumbnail for %s: %s", path, e.getMessage());
            return Response.serverError().build();
        }
    }
    }
