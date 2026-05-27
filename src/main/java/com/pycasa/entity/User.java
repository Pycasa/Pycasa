package com.pycasa.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

public class User {
    public String id;
    public String username;

    // Stored in DB as "password_hash"; excluded from REST responses
    @JsonProperty("password_hash")
    public String passwordHash;

    public String name;
    public String email;
    public String type = "user";

    public User() {}

    public User(String id, String username, String passwordHash, String name) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
        this.name = name;
    }
}
