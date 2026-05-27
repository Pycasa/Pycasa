package com.pycasa.resource;

import com.pycasa.entity.User;
import com.pycasa.service.AuthService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.jboss.logging.Logger;

import java.util.Map;

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    private static final Logger LOG = Logger.getLogger(AuthResource.class);

    @Inject
    AuthService authService;

    public record LoginRequest(String username, String password) {}

    @POST
    @Path("/login")
    public Response login(LoginRequest req) {
        try {
            AuthService.LoginResult result = authService.login(req.username(), req.password());
            Map<String, Object> session = Map.of(
                    "access_token", result.token(),
                    "user", Map.of(
                            "id", result.user().id,
                            "name", result.user().name != null ? result.user().name : result.user().username,
                            "email", result.user().email != null ? result.user().email : ""
                    )
            );
            return Response.ok(Map.of("session", session, "user", session.get("user"))).build();
        } catch (SecurityException e) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", e.getMessage())).build();
        }
    }

    @POST
    @Path("/logout")
    public Response logout(@HeaderParam("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        authService.logout(token);
        return Response.ok(Map.of("message", "Logged out")).build();
    }

    @GET
    @Path("/session")
    public Response getSession(@HeaderParam("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        User user = authService.validateToken(token);
        if (user == null) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(Map.of("error", "Invalid or expired session")).build();
        }
        Map<String, Object> session = Map.of(
                "access_token", token,
                "user", Map.of(
                        "id", user.id,
                        "name", user.name != null ? user.name : user.username,
                        "email", user.email != null ? user.email : ""
                )
        );
        return Response.ok(Map.of("session", session)).build();
    }

    private String extractToken(String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }
}
