package com.pycasa.service;

import com.pycasa.entity.AppSettings;
import com.pycasa.entity.ImageRecord;
import com.pycasa.repository.DatabaseRepository;
import io.github.ollama4j.Ollama;
import io.github.ollama4j.models.generate.OllamaGenerateRequest;
import io.github.ollama4j.models.response.OllamaResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.io.File;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@ApplicationScoped
public class AiService {

    private static final Logger LOG = Logger.getLogger(AiService.class);

    @Inject
    DatabaseRepository db;

    @Inject
    NotificationService notificationService;

    private final AtomicBoolean analysing = new AtomicBoolean(false);
    private final AtomicInteger analysed = new AtomicInteger(0);
    private final AtomicInteger total = new AtomicInteger(0);
    private volatile String currentStatus = "idle";

    public record AnalysisStatus(boolean running, int analysed, int total, String status) {}

    public AnalysisStatus getAnalysisStatus() {
        return new AnalysisStatus(analysing.get(), analysed.get(), total.get(), currentStatus);
    }

    public void triggerBatchAnalysis(boolean rerun) {
        if (analysing.compareAndSet(false, true)) {
new Thread(() -> doBatchAnalysis(rerun)).start();
        }
    }

    private void doBatchAnalysis(boolean rerun) {
        try {
            currentStatus = "running";
            List<ImageRecord> images = rerun ? db.listAllImages() : db.listUnanalysedImages();
            total.set(images.size());
            analysed.set(0);

            notificationService.broadcast("ai:started", Map.of(
                    "message", "AI analysis started",
                    "total", images.size(),
                    "rerun", rerun
            ));

            AppSettings settings = db.get("settings", AppSettings.class);
            if (settings == null) settings = new AppSettings();

            for (ImageRecord img : images) {
                try {
                    // Notify progress before analysing
                    String filename = new File(img.file_path).getName();
                    notificationService.broadcast("ai:progress", Map.of(
                            "analysed", analysed.get(),
                            "total", total.get(),
                            "current_file", filename
                    ));

                    analyseImage(img, settings);
                    int done = analysed.incrementAndGet();

                    // Notify after each image completes
                    notificationService.broadcast("ai:progress", Map.of(
                            "analysed", done,
                            "total", total.get(),
                            "current_file", filename
                    ));
                } catch (Exception e) {
                    LOG.warnf("Failed to analyse image %s: %s", img.file_path, e.getMessage());
                    notificationService.broadcast("ai:error", Map.of(
                            "message", "Failed: " + new File(img.file_path).getName(),
                            "detail", e.getMessage() != null ? e.getMessage() : "unknown error"
                    ));
                }
            }

            currentStatus = "completed";
            int done = analysed.get();
            LOG.infof("Batch analysis complete. Analysed %d images.", done);
            notificationService.broadcast("ai:completed", Map.of(
                    "message", "AI analysis complete",
                    "analysed", done,
                    "total", total.get()
            ));
        } catch (Exception e) {
            currentStatus = "error";
            LOG.error("Batch analysis failed", e);
            notificationService.broadcast("ai:error", Map.of(
                    "message", "Batch analysis failed",
                    "detail", e.getMessage() != null ? e.getMessage() : "unknown error"
            ));
        } finally {
            analysing.set(false);
        }
    }

    public void analyseImage(ImageRecord img, AppSettings settings) throws Exception {
        File file = new File(img.file_path);
        if (!file.exists()) return;

        String service = settings.active_ai_service != null ? settings.active_ai_service : "ollama";
        if ("ollama".equals(service)) {
            analyseWithOllama(img, settings);
        } else {
            LOG.infof("AI service '%s' not yet implemented, skipping %s", service, img.file_path);
        }
    }

    private void analyseWithOllama(ImageRecord img, AppSettings settings) throws Exception {
        String ollamaUrl = settings.ollama_url != null ? settings.ollama_url : "http://localhost:11434";
        String visionModel = settings.vision_model != null ? settings.vision_model : "llava";

        Ollama ollama = new Ollama(ollamaUrl);
        ollama.setRequestTimeoutSeconds(120);

        String prompt = (settings.image_analysis_prompt != null && !settings.image_analysis_prompt.isBlank())
                ? settings.image_analysis_prompt
                : "Describe this image in detail. Then on a new line starting with 'Tags:', list 5-10 relevant tags separated by commas.";

        OllamaGenerateRequest request = OllamaGenerateRequest.builder()
                .withModel(visionModel)
                .withPrompt(prompt)
                .withImages(List.of(new File(img.file_path)))
                .build();

        OllamaResult result = ollama.generate(request, null);
        parseAndSaveAnalysis(img, result.getResponse());
    }

    private void parseAndSaveAnalysis(ImageRecord img, String response) {
        String description = response;
        List<String> tags = new ArrayList<>();

        int tagsIdx = response.toLowerCase().indexOf("tags:");
        if (tagsIdx >= 0) {
            description = response.substring(0, tagsIdx).trim();
            String tagsPart = response.substring(tagsIdx + 5).trim();
            for (String t : tagsPart.split(",")) {
                String tag = t.trim().toLowerCase().replaceAll("[^a-z0-9\\s\\-]", "");
                if (!tag.isBlank()) tags.add(tag);
            }
        }
        if (description != null && !description.isBlank()) {
            img.description = description.trim();
        }
        if (!tags.isEmpty()) {
            img.tags = tags;
        }
        img.ai_analysed = true;
        db.save(img.id, img);
    }

    public boolean pingOllama(String url) {
        try {
            Ollama ollama = new Ollama(url != null ? url : "http://localhost:11434");
            ollama.setRequestTimeoutSeconds(5);
            return ollama.ping();
        } catch (Exception e) {
            return false;
        }
    }

    public List<String> listOllamaModels(String url) {
        try {
            Ollama ollama = new Ollama(url != null ? url : "http://localhost:11434");
            ollama.setRequestTimeoutSeconds(10);
            return ollama.listModels().stream()
                    .map(m -> m.getModel())
                    .toList();
        } catch (Exception e) {
            LOG.warnf("Could not list Ollama models: %s", e.getMessage());
            return Collections.emptyList();
        }
    }
}
