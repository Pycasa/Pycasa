package com.pycasa.resource;

import com.pycasa.entity.AppSettings;
import com.pycasa.entity.ImageRecord;
import com.pycasa.repository.DatabaseRepository;
import com.pycasa.service.AiService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.List;
import java.util.Map;

@Path("/api/ai")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AiResource {

    @Inject
    AiService aiService;

    @Inject
    DatabaseRepository db;

    @GET
    @Path("/analysis-status")
    public Response getAnalysisStatus() {
        AiService.AnalysisStatus status = aiService.getAnalysisStatus();
        return Response.ok(Map.of(
                "running", status.running(),
                "is_running", status.running(),
                "analysed", status.analysed(),
                "processed_files", status.analysed(),
                "total", status.total(),
                "total_files", status.total(),
                "status", status.status(),
                "current_file", status.currentFile() != null ? status.currentFile() : ""
        )).build();
    }

    @POST
    @Path("/batch-analyse")
    public Response batchAnalyse(Map<String, Object> body) {
        boolean rerun = body != null && Boolean.TRUE.equals(body.get("rerun"));
        aiService.triggerBatchAnalysis(rerun);
        return Response.ok(Map.of("message", "Batch analysis triggered")).build();
    }

    @POST
    @Path("/analyse")
    public Response analyseImage(Map<String, String> body) {
        String imagePath = body != null ? body.get("image_path") : null;
        if (imagePath == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "image_path is required")).build();
        }
        ImageRecord img = db.findImageByPath(imagePath);
        if (img == null) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Image not found")).build();
        }
        try {
            AppSettings settings = db.get("settings", AppSettings.class);
            if (settings == null) settings = new AppSettings();
            aiService.analyseImage(img, settings);
            return Response.ok(db.get(img.id, ImageRecord.class)).build();
        } catch (Exception e) {
            return Response.serverError()
                    .entity(Map.of("error", e.getMessage())).build();
        }
    }

    @GET
    @Path("/models")
    public Response listModels(@QueryParam("url") String url) {
        List<String> models = aiService.listOllamaModels(url);
        return Response.ok(models).build();
    }

    @POST
    @Path("/ping")
    public Response ping(Map<String, String> body) {
        String url = body != null ? body.get("url") : null;
        boolean reachable = aiService.pingOllama(url);
        return Response.ok(reachable).build();
    }

    @POST
    @Path("/ocr")
    public Response ocr(Map<String, String> body) {
        // OCR via Tesseract — placeholder; returns empty text if not configured
        return Response.ok(Map.of("text", "")).build();
    }
}
