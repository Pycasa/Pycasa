package com.pycasa.entity;

public class AppSettings {
    public String id = "settings";
    public String type = "settings";
    public String ollama_url = "http://localhost:11434";
    public String vision_model = "llava";
    public String text_model = "llama2";
    public String embedding_model = "nomic-embed-text";
    public String active_ai_service = "ollama";
    public String gemini_api_key;
    public String openai_api_key;
    public String openai_model = "gpt-4-vision-preview";
    public String image_analysis_prompt;
    public String tag_generation_prompt;
    public String ocr_tesseract_datapath;
    public String ocr_jna_library_path;

    public AppSettings() {}
}
