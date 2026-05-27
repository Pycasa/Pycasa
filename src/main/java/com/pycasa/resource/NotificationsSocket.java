package com.pycasa.resource;

import com.pycasa.service.NotificationService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;

@ServerEndpoint("/ws/notifications")
@ApplicationScoped
public class NotificationsSocket {

    @Inject
    NotificationService notificationService;

    @OnOpen
    public void onOpen(Session session) {
        notificationService.register(session);
    }

    @OnClose
    public void onClose(Session session) {
        notificationService.unregister(session);
    }

    @OnError
    public void onError(Session session, Throwable throwable) {
        notificationService.unregister(session);
    }

    @OnMessage
    public void onMessage(String message, Session session) {
        // Client-to-server messages not needed yet — ignore
    }
}
