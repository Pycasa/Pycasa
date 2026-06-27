package com.pycasa.service;

import com.pycasa.entity.AppSettings;
import com.pycasa.entity.ImageRecord;
import com.pycasa.repository.DatabaseRepository;
import io.github.ollama4j.Ollama;
import io.github.ollama4j.models.generate.OllamaGenerateRequest;
import io.github.ollama4j.models.response.OllamaResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.File;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.jboss.logging.Logger;

@ApplicationScoped
public class AiService {

    private static final Logger LOG = Logger.getLogger(AiService.class);

    @Inject DatabaseRepository db;

    @Inject NotificationService notificationService;

    private final AtomicBoolean analysing = new AtomicBoolean(false);
    private final AtomicInteger analysed = new AtomicInteger(0);
    private final AtomicInteger total = new AtomicInteger(0);
    private volatile String currentStatus = "idle";
    private volatile String currentFile = "";

    public record AnalysisStatus(
            boolean running, int analysed, int total, String status, String currentFile) {}

    public AnalysisStatus getAnalysisStatus() {
        return new AnalysisStatus(
                analysing.get(), analysed.get(), total.get(), currentStatus, currentFile);
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

            notificationService.broadcast(
                    "ai:started",
                    Map.of(
                            "message",
                            "AI analysis started",
                            "total",
                            images.size(),
                            "rerun",
                            rerun));

            AppSettings settings = db.get("settings", AppSettings.class);
            if (settings == null) settings = new AppSettings();

            for (ImageRecord img : images) {
                try {
                    // Notify progress before analysing
                    String filename = new File(img.file_path).getName();
                    currentFile = filename;
                    notificationService.broadcast(
                            "ai:progress",
                            Map.of(
                                    "analysed", analysed.get(),
                                    "total", total.get(),
                                    "current_file", filename));

                    analyseImage(img, settings);
                    int done = analysed.incrementAndGet();

                    // Notify after each image completes
                    notificationService.broadcast(
                            "ai:progress",
                            Map.of(
                                    "analysed", done,
                                    "total", total.get(),
                                    "current_file", filename));
                } catch (Exception e) {
                    LOG.warnf("Failed to analyse image %s: %s", img.file_path, e.getMessage());
                    notificationService.broadcast(
                            "ai:error",
                            Map.of(
                                    "message",
                                    "Failed: " + new File(img.file_path).getName(),
                                    "detail",
                                    e.getMessage() != null ? e.getMessage() : "unknown error"));
                }
            }

            currentStatus = "completed";
            int done = analysed.get();
            LOG.infof("Batch analysis complete. Analysed %d images.", done);
            notificationService.broadcast(
                    "ai:completed",
                    Map.of(
                            "message",
                            "AI analysis complete",
                            "analysed",
                            done,
                            "total",
                            total.get()));
        } catch (Exception e) {
            currentStatus = "error";
            LOG.error("Batch analysis failed", e);
            notificationService.broadcast(
                    "ai:error",
                    Map.of(
                            "message",
                            "Batch analysis failed",
                            "detail",
                            e.getMessage() != null ? e.getMessage() : "unknown error"));
        } finally {
            analysing.set(false);
            currentFile = "";
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
        String ollamaUrl =
                settings.ollama_url != null ? settings.ollama_url : "http://localhost:11434";
        String visionModel = settings.vision_model != null ? settings.vision_model : "llava";
        String textModel = settings.text_model != null ? settings.text_model : "llama2";

        Ollama ollama = new Ollama(ollamaUrl);
        ollama.setRequestTimeoutSeconds(120);

        // --- Call 1: vision model generates a description from the image ---
        String descriptionPrompt =
                (settings.image_analysis_prompt != null
                                && !settings.image_analysis_prompt.isBlank())
                        ? settings.image_analysis_prompt
                        : "Describe this image in detail. Focus on the subjects, setting, colors, mood, and any notable elements.";

        OllamaGenerateRequest descRequest =
                OllamaGenerateRequest.builder()
                        .withModel(visionModel)
                        .withPrompt(descriptionPrompt)
                        .withImages(List.of(new File(img.file_path)))
                        .build();

        OllamaResult descResult = ollama.generate(descRequest, null);
        String description = descResult.getResponse().trim();

        LOG.debugf("Description for %s: %s", img.file_path, description);

        // --- Call 2: text model generates tags from the description ---
        String tagsPrompt =
                "Given the following image description, extract 5-10 relevant tags. "
                        + "Return only the tags as a comma-separated list with no additional text or explanation.\n\n"
                        + "Description: "
                        + description;

        OllamaGenerateRequest tagsRequest =
                OllamaGenerateRequest.builder().withModel(textModel).withPrompt(tagsPrompt).build();

        OllamaResult tagsResult = ollama.generate(tagsRequest, null);
        List<String> tags = parseTags(tagsResult.getResponse());

        LOG.debugf("Tags for %s: %s", img.file_path, tags);

        // --- Persist results ---
        img.description = description;
        img.tags = tags;
        img.ai_analysed = true;
        db.save(img.id, img);
    }

    private List<String> parseTags(String response) {
        List<String> tags = new ArrayList<>();
        // Strip any leading label like "Tags:" that the model may include despite instructions
        String raw = response.trim();
        int colonIdx = raw.toLowerCase().indexOf("tags:");
        if (colonIdx >= 0) {
            raw = raw.substring(colonIdx + 5).trim();
        }
        for (String t : raw.split(",")) {
            String tag = t.trim().toLowerCase().replaceAll("[^a-z0-9\\s\\-]", "").trim();
            if (!tag.isBlank()) tags.add(tag);
        }
        return tags;
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
            return ollama.listModels().stream().map(m -> m.getModel()).toList();
        } catch (Exception e) {
            LOG.warnf("Could not list Ollama models: %s", e.getMessage());
            return Collections.emptyList();
        }
    }
}
