package com.pycasa.service;

import com.pycasa.entity.User;
import com.pycasa.repository.DatabaseRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.jboss.logging.Logger;

@ApplicationScoped
public class AuthService {

    private static final Logger LOG = Logger.getLogger(AuthService.class);

    @Inject DatabaseRepository db;

    // In-memory session store: token -> User
    private final Map<String, User> sessions = new ConcurrentHashMap<>();

    public record LoginResult(String token, User user) {}

    public LoginResult login(String username, String password) {
        User user = db.findUserByUsername(username);
        LOG.debugf("Login attempt for '%s': user found = %s", username, user != null);
        if (user == null) throw new SecurityException("Invalid credentials");

        String hash = DatabaseRepository.hashPassword(password);
        LOG.debugf(
                "Stored hash: %s, computed hash: %s, match: %s",
                user.passwordHash, hash, hash.equals(user.passwordHash));
        if (!hash.equals(user.passwordHash)) throw new SecurityException("Invalid credentials");

        String token = UUID.randomUUID().toString();
        sessions.put(token, user);
        return new LoginResult(token, user);
    }

    public void logout(String token) {
        if (token != null) sessions.remove(token);
    }

    public User validateToken(String token) {
        if (token == null) return null;
        return sessions.get(token);
    }
}
