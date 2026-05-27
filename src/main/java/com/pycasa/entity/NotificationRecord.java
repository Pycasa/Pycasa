package com.pycasa.entity;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class NotificationRecord {
    public String id;
    public String type = "notification";
    public String event_type;   // e.g. "scan:completed", "ai:error"
    public String message;
    public String detail;       // optional extra detail
    public long ts;
    public boolean read = false;

    public NotificationRecord() {}

    public NotificationRecord(String id, String eventType, String message, String detail, long ts) {
        this.id = id;
        this.event_type = eventType;
        this.message = message;
        this.detail = detail;
        this.ts = ts;
    }
}
