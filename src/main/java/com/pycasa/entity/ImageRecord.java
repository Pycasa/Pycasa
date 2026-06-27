package com.pycasa.entity;

import java.util.List;

public class ImageRecord {
    public String id;
    public String file_path;
    public String folder_id;
    public String description;
    public List<String> tags;
    public String ocr_text;
    public long file_size;
    public long modified_at;
    public long created_at;
    public long indexed_at;
    public boolean ai_analysed;
    public boolean favorite;
    public boolean trashed;
    public String thumbnail_path;
    public String type = "image";

    public ImageRecord() {}
}
