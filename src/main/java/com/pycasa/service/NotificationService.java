package com.pycasa.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pycasa.entity.NotificationRecord;
import com.pycasa.repository.DatabaseRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.jboss.logging.Logger;

@ApplicationScoped
public class NotificationService {

    private static final Logger LOG = Logger.getLogger(NotificationService.class);

    @Inject DatabaseRepository db;

    private final Set<Session> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper mapper = new ObjectMapper();

    public void register(Session session) {
        sessions.add(session);
        LOG.debugf("WebSocket client connected: %s (total: %d)", session.getId(), sessions.size());
    }

    public void unregister(Session session) {
        sessions.remove(session);
        LOG.debugf(
                "WebSocket client disconnected: %s (total: %d)", session.getId(), sessions.size());
    }

    /**
     * Broadcast a typed event to all connected WebSocket clients AND persist it to the DB. Progress
     * events (scan:progress, ai:progress) are broadcast but NOT persisted.
     */
    public void broadcast(String type, Map<String, Object> payload) {
        long ts = System.currentTimeMillis();

        // Persist non-progress events to DB
        boolean isProgress = type.endsWith(":progress") || type.equals("scan:cancelling");
        if (!isProgress) {
            try {
                String message = buildMessage(type, payload);
                String detail = buildDetail(payload);
                String id = "notif_" + UUID.randomUUID().toString().replace("-", "");
                NotificationRecord record = new NotificationRecord(id, type, message, detail, ts);
                db.saveNotification(record);
            } catch (Exception e) {
                LOG.warnf("Failed to persist notification '%s': %s", type, e.getMessage());
            }
        }

        // Broadcast to all live WebSocket clients
        if (sessions.isEmpty()) return;
        try {
            Map<String, Object> message = new java.util.LinkedHashMap<>();
            message.put("type", type);
            message.put("payload", payload);
            message.put("ts", ts);
            String json = mapper.writeValueAsString(message);

            for (Session s : sessions) {
                if (!s.isOpen()) continue;
                try {
                    // Use synchronous send — works reliably from any thread including virtual
                    // threads
                    s.getBasicRemote().sendText(json);
                } catch (Exception e) {
                    LOG.debugf("Failed to send to session %s: %s", s.getId(), e.getMessage());
                    sessions.remove(s);
                }
            }
        } catch (Exception e) {
            LOG.warnf("Failed to broadcast event '%s': %s", type, e.getMessage());
        }
    }

    private String buildMessage(String type, Map<String, Object> payload) {
        return switch (type) {
            case "scan:started" -> "Folder scan started";
            case "scan:completed" ->
                    "Scan complete — " + payload.getOrDefault("total", 0) + " images indexed";
            case "scan:error" -> "Scan error: " + payload.getOrDefault("message", "unknown");
            case "scan:folder:started" ->
                    String.valueOf(payload.getOrDefault("message", "Scan started"));
            case "scan:folder:completed" ->
                    String.valueOf(payload.getOrDefault("message", "Scan complete"));
            case "scan:folder:cancelled" ->
                    String.valueOf(payload.getOrDefault("message", "Scan cancelled"));
            case "scan:folder:error" ->
                    String.valueOf(payload.getOrDefault("message", "Scan error"));
            case "ai:started" ->
                    "AI analysis started — " + payload.getOrDefault("total", 0) + " images";
            case "ai:completed" ->
                    "AI analysis complete — "
                            + payload.getOrDefault("analysed", 0)
                            + " images analysed";
            case "ai:error" -> "AI error: " + payload.getOrDefault("message", "unknown");
            case "folder-delete:started" ->
                    String.valueOf(payload.getOrDefault("message", "Removing location…"));
            case "folder-delete:completed" ->
                    String.valueOf(payload.getOrDefault("message", "Location removed"));
            case "folder-delete:error" ->
                    "Remove failed: " + payload.getOrDefault("message", "unknown");
            default -> String.valueOf(payload.getOrDefault("message", type));
        };
    }

    private String buildDetail(Map<String, Object> payload) {
        Object detail = payload.get("detail");
        if (detail != null) return String.valueOf(detail);
        Object current = payload.get("current_file");
        if (current != null) return String.valueOf(current);
        return null;
    }

    // -------------------------------------------------------------------------
    // Convenience helpers
    // -------------------------------------------------------------------------

    public void scanStarted() {
        broadcast("scan:started", Map.of("message", "Folder scan started"));
    }

    public void scanProgress(int scanned, int total, String currentFile) {
        broadcast(
                "scan:progress",
                Map.of(
                        "scanned", scanned,
                        "total", total,
                        "current_file", currentFile != null ? currentFile : ""));
    }

    public void scanCompleted(int total) {
        broadcast("scan:completed", Map.of("message", "Scan complete", "total", total));
    }

    public void scanError(String error) {
        broadcast("scan:error", Map.of("message", error));
    }
}
