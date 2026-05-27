package com.pycasa.resource;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.Map;

@Path("/api/health")
@Produces(MediaType.APPLICATION_JSON)
public class HealthResource {

    @GET
    public Response health() {
        return Response.ok(Map.of("status", "ok", "service", "pycasa")).build();
    }
}
