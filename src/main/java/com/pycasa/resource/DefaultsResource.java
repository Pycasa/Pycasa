package com.pycasa.resource;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.jboss.logging.Logger;

@Path("/api/defaults")
@Produces(MediaType.APPLICATION_JSON)
public class DefaultsResource {

    private static final Logger LOG = Logger.getLogger(DefaultsResource.class);

    @GET
    @Path("/prompts")
    public Response getDefaultPrompts() {
        return Response.ok(
                        Map.of(
                                "image_analysis_prompt",
                                        readResource("default-image-analysis-prompt.txt"),
                                "tag_generation_prompt",
                                        readResource("default-tag-generation-prompt.txt")))
                .build();
    }

    private String readResource(String name) {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(name)) {
            if (is == null) {
                LOG.warnf("Resource not found: %s", name);
                return "";
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8).strip();
        } catch (Exception e) {
            LOG.warnf("Failed to read resource %s: %s", name, e.getMessage());
            return "";
        }
    }
}
