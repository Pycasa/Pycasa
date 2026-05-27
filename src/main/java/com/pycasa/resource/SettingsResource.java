package com.pycasa.resource;

import com.pycasa.entity.AppSettings;
import com.pycasa.repository.DatabaseRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.Map;

@Path("/api/settings")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class SettingsResource {

    @Inject
    DatabaseRepository db;

    @GET
    public Response getSettings() {
        AppSettings settings = db.get("settings", AppSettings.class);
        if (settings == null) settings = new AppSettings();
        return Response.ok(settings).build();
    }

    @POST
    public Response updateSettings(Map<String, Object> body) {
        AppSettings settings = db.get("settings", AppSettings.class);
        if (settings == null) settings = new AppSettings();

        if (body.containsKey("ollama_url"))            settings.ollama_url = (String) body.get("ollama_url");
        if (body.containsKey("vision_model"))          settings.vision_model = (String) body.get("vision_model");
        if (body.containsKey("text_model"))            settings.text_model = (String) body.get("text_model");
        if (body.containsKey("embedding_model"))       settings.embedding_model = (String) body.get("embedding_model");
        if (body.containsKey("active_ai_service"))     settings.active_ai_service = (String) body.get("active_ai_service");
        if (body.containsKey("gemini_api_key"))        settings.gemini_api_key = (String) body.get("gemini_api_key");
        if (body.containsKey("openai_api_key"))        settings.openai_api_key = (String) body.get("openai_api_key");
        if (body.containsKey("openai_model"))          settings.openai_model = (String) body.get("openai_model");
        if (body.containsKey("image_analysis_prompt")) settings.image_analysis_prompt = (String) body.get("image_analysis_prompt");
        if (body.containsKey("ocr_tesseract_datapath")) settings.ocr_tesseract_datapath = (String) body.get("ocr_tesseract_datapath");
        if (body.containsKey("ocr_jna_library_path"))  settings.ocr_jna_library_path = (String) body.get("ocr_jna_library_path");

        db.save("settings", settings);
        return Response.ok(settings).build();
    }
}
