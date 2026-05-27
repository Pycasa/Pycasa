package com.pycasa.resource;

import com.pycasa.entity.NotificationRecord;
import com.pycasa.repository.DatabaseRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.Map;

@Path("/api/notifications")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class NotificationsResource {

    @Inject
    DatabaseRepository db;

    @GET
    public Response list(@QueryParam("search") String search,
                         @QueryParam("event_type") String eventType) {
        return Response.ok(db.listNotifications(search, eventType)).build();
    }

    @GET
    @Path("/unread-count")
    public Response unreadCount() {
        return Response.ok(Map.of("count", db.countUnreadNotifications())).build();
    }

    @PATCH
    @Path("/{id}/read")
    public Response markRead(@PathParam("id") String id) {
        NotificationRecord n = db.get(id, NotificationRecord.class);
        if (n == null) return Response.status(Response.Status.NOT_FOUND).build();
        n.read = true;
        db.saveNotification(n);
        return Response.ok(n).build();
    }

    @POST
    @Path("/mark-all-read")
    public Response markAllRead() {
        db.markAllNotificationsRead();
        return Response.ok(Map.of("message", "All notifications marked as read")).build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        db.delete(id);
        return Response.ok(Map.of("message", "Deleted")).build();
    }

    @DELETE
    public Response deleteAll() {
        db.deleteAllNotifications();
        return Response.ok(Map.of("message", "All notifications deleted")).build();
    }
}
