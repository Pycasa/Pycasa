package com.pycasa.entity;

public class MonitoredFolder {
    public String id;
    public String path;
    public String label;
    public String type = "folder";
    public long createdAt;
    public long imageCount;

    public MonitoredFolder() {}

    public MonitoredFolder(String id, String path, String label) {
        this.id = id;
        this.path = path;
        this.label = label;
        this.createdAt = System.currentTimeMillis();
    }
}
