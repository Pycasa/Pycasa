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
import java.io.ByteArrayOutputStream;
import java.awt.image.BufferedImage;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import javax.imageio.ImageIO;
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
            @QueryParam("limit") @DefaultValue("30") int limit,
            @QueryParam("before") String before,
            @QueryParam("date_from") Long dateFrom,
            @QueryParam("date_to") Long dateTo,
            @QueryParam("extensions") String extensions,
            @QueryParam("size_min") Long sizeMin,
            @QueryParam("size_max") Long sizeMax) {

        List<String> tagList = (tags != null && !tags.isBlank())
                ? Arrays.asList(tags.split(","))
                : null;

        List<String> extList = (extensions != null && !extensions.isBlank())
                ? Arrays.asList(extensions.split(","))
                : null;

        List<ImageRecord> images = db.listImages(folderId, search, tagList, sortBy, sortOrder, page, limit,
                dateFrom, dateTo, extList, sizeMin, sizeMax);
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
                "is_scanning", status.running(),
                "scanned", status.scanned(),
                "total", status.total(),
                "files_found", status.scanned()
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
            // Check database for cached thumbnail path
            ImageRecord imgRecord = db.findImageByPath(path);
            File thumbFile = null;
            if (imgRecord != null && imgRecord.thumbnail_path != null) {
                thumbFile = new File(imgRecord.thumbnail_path);
            }

            if (thumbFile == null || !thumbFile.exists()) {
                // Determine thumbnail cache directory inside the DB directory
                String dir = dbDirectory.replace("${user.home}", System.getProperty("user.home"));
                File thumbDir = new File(dir, "thumbs");
                thumbDir.mkdirs();
                String thumbName = (imgRecord != null ? imgRecord.id : src.getName()) + "_thumb.jpg";
                thumbFile = new File(thumbDir, thumbName);

                if (!thumbFile.exists()) {
                    try {
                        // Generate a 300px thumbnail using Thumbnailator
                        net.coobird.thumbnailator.Thumbnails.of(src)
                                .size(300, 300)
                                .keepAspectRatio(true)
                                .outputFormat("jpg")
                                .toFile(thumbFile);
                    } catch (Exception decodeEx) {
                        // Format not supported by ImageIO (e.g. HEIC) — generate a placeholder
                        LOG.debugf("Cannot decode %s for thumbnail (%s), generating placeholder", path, decodeEx.getMessage());
                        String ext = src.getName().contains(".")
                                ? src.getName().substring(src.getName().lastIndexOf('.') + 1).toUpperCase()
                                : "IMG";
                        generatePlaceholderThumbnail(thumbFile, ext);
                    }
                }

                // Save path to Couchbase Lite document
                if (imgRecord != null && thumbFile.exists()) {
                    imgRecord.thumbnail_path = thumbFile.getAbsolutePath();
                    db.save(imgRecord.id, imgRecord);
                }
            }

            if (!thumbFile.exists()) {
                return Response.serverError().build();
            }
            return Response.ok(thumbFile, "image/jpeg").build();
        } catch (Exception e) {
            LOG.warnf("Failed to generate thumbnail for %s: %s", path, e.getMessage());
            return Response.serverError().build();
        }
    }

    /**
     * Generates a 300x300 grey placeholder JPEG with the file extension label centred on it.
     * Used for formats that Java ImageIO cannot decode (e.g. HEIC, AVIF).
     */
    private void generatePlaceholderThumbnail(File dest, String label) throws Exception {
        int size = 300;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        // Background
        g.setColor(new Color(30, 35, 46));
        g.fillRect(0, 0, size, size);

        // Subtle grid pattern
        g.setColor(new Color(255, 255, 255, 12));
        for (int x = 0; x < size; x += 20) g.drawLine(x, 0, x, size);
        for (int y = 0; y < size; y += 20) g.drawLine(0, y, size, y);

        // File-type badge background
        int badgeW = 120, badgeH = 44;
        int bx = (size - badgeW) / 2, by = (size - badgeH) / 2;
        g.setColor(new Color(60, 65, 80));
        g.fillRoundRect(bx, by, badgeW, badgeH, 12, 12);
        g.setColor(new Color(100, 110, 130));
        g.drawRoundRect(bx, by, badgeW, badgeH, 12, 12);

        // Extension text
        g.setColor(new Color(180, 190, 210));
        g.setFont(new Font("SansSerif", Font.BOLD, 18));
        java.awt.FontMetrics fm = g.getFontMetrics();
        int tx = (size - fm.stringWidth(label)) / 2;
        int ty = by + (badgeH + fm.getAscent() - fm.getDescent()) / 2;
        g.drawString(label, tx, ty);

        g.dispose();
        ImageIO.write(img, "jpg", dest);
    }
    }
