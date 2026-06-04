package com.pycasa.repository;

import com.couchbase.lite.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pycasa.entity.*;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@ApplicationScoped
public class DatabaseRepository {

    private static final Logger LOG = Logger.getLogger(DatabaseRepository.class);

    @ConfigProperty(name = "couchbase.lite.database.name", defaultValue = "pycasa")
    String dbName;

    @ConfigProperty(name = "couchbase.lite.database.directory")
    String dbDirectory;

    private Database database;
    private com.couchbase.lite.Collection defaultCollection;
    private final ObjectMapper mapper = new ObjectMapper();

    // All image/folder/settings fields we select explicitly
    private static final SelectResult[] IMAGE_FIELDS = {
            SelectResult.expression(Meta.id),
            SelectResult.property("id"),
            SelectResult.property("file_path"),
            SelectResult.property("folder_id"),
            SelectResult.property("description"),
            SelectResult.property("tags"),
            SelectResult.property("ocr_text"),
            SelectResult.property("file_size"),
            SelectResult.property("modified_at"),
            SelectResult.property("created_at"),
            SelectResult.property("indexed_at"),
            SelectResult.property("ai_analysed"),
            SelectResult.property("thumbnail_path"),
            SelectResult.property("type"),
    };

    private static final SelectResult[] FOLDER_FIELDS = {
            SelectResult.expression(Meta.id),
            SelectResult.property("id"),
            SelectResult.property("path"),
            SelectResult.property("label"),
            SelectResult.property("type"),
            SelectResult.property("createdAt"),
    };

    @PostConstruct
    void init() {
        try {
            String dir = dbDirectory.replace("${user.home}", System.getProperty("user.home"));
            File dbDir = new File(dir);
            dbDir.mkdirs();
            
            // Create a dedicated scratch/temp directory for Couchbase Lite inside .pycasa
            File scratchDir = new File(dbDir.getParentFile(), "temp");
            scratchDir.mkdirs();
            
            // Initialize Couchbase Lite with explicit root and scratch paths (resolves UnsatisfiedLinkError and permissions issues)
            CouchbaseLite.init(false, dbDir, scratchDir);
            
            DatabaseConfiguration config = new DatabaseConfiguration();
            config.setDirectory(dir);
            database = new Database(dbName, config);
            defaultCollection = database.getDefaultCollection();
            LOG.infof("Couchbase Lite database opened at %s/%s", dir, dbName);
            ensureIndexes();
            ensureDefaultUser();
            ensureDefaultSettings();
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialise Couchbase Lite database", e);
        }
    }

    private void ensureIndexes() {
        try {
            // Index 1: type + modified_at (DESC) — used by timeline date-count query and main listImages sort
            ValueIndexConfiguration idxTypeModified = new ValueIndexConfiguration(new String[]{"type", "modified_at"});
            defaultCollection.createIndex("idx_type_modified_at", idxTypeModified);

            // Index 2: type + folder_id + modified_at — used by folder-filtered listImages
            ValueIndexConfiguration idxTypeFolderModified = new ValueIndexConfiguration(new String[]{"type", "folder_id", "modified_at"});
            defaultCollection.createIndex("idx_type_folder_modified_at", idxTypeFolderModified);

            // Index 3: type + file_path — used by findImageByPath
            ValueIndexConfiguration idxTypeFilePath = new ValueIndexConfiguration(new String[]{"type", "file_path"});
            defaultCollection.createIndex("idx_type_file_path", idxTypeFilePath);

            // Index 4: type + created_at — used when listImages sorts by created_at
            ValueIndexConfiguration idxTypeCreated = new ValueIndexConfiguration(new String[]{"type", "created_at"});
            defaultCollection.createIndex("idx_type_created_at", idxTypeCreated);

            LOG.info("Couchbase Lite indexes ensured (type+modified_at, type+folder_id+modified_at, type+file_path, type+created_at)");
        } catch (Exception e) {
            LOG.warnf("Could not create indexes: %s", e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Low-level helpers
    // -------------------------------------------------------------------------

    private MutableDocument toDoc(String id, Object entity) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> map = mapper.convertValue(entity, Map.class);
        MutableDocument doc = new MutableDocument(id);
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (e.getValue() == null) continue;
            if (e.getValue() instanceof String s)        doc.setString(e.getKey(), s);
            else if (e.getValue() instanceof Integer i)  doc.setInt(e.getKey(), i);
            else if (e.getValue() instanceof Long l)     doc.setLong(e.getKey(), l);
            else if (e.getValue() instanceof Boolean b)  doc.setBoolean(e.getKey(), b);
            else if (e.getValue() instanceof Double d)   doc.setDouble(e.getKey(), d);
            else                                         doc.setValue(e.getKey(), e.getValue());
        }
        return doc;
    }

    private <T> T fromDoc(Document doc, Class<T> clazz) throws Exception {
        if (doc == null) return null;
        return mapper.convertValue(doc.toMap(), clazz);
    }

    public void save(String id, Object entity) {
        try {
            defaultCollection.save(toDoc(id, entity));
        } catch (Exception e) {
            throw new RuntimeException("Failed to save document " + id, e);
        }
    }

    public <T> T get(String id, Class<T> clazz) {
        try {
            Document doc = defaultCollection.getDocument(id);
            return fromDoc(doc, clazz);
        } catch (Exception e) {
            throw new RuntimeException("Failed to get document " + id, e);
        }
    }

    public void delete(String id) {
        try {
            Document doc = defaultCollection.getDocument(id);
            if (doc != null) defaultCollection.delete(doc);
        } catch (Exception e) {
            throw new RuntimeException("Failed to delete document " + id, e);
        }
    }

    // -------------------------------------------------------------------------
    // Password hashing
    // -------------------------------------------------------------------------

    public static String hashPassword(String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // -------------------------------------------------------------------------
    // Bootstrap
    // -------------------------------------------------------------------------

    private void ensureDefaultUser() {
        try {
            Query q = QueryBuilder.select(SelectResult.expression(Meta.id))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("user")));
            ResultSet rs = q.execute();
            if (!rs.allResults().isEmpty()) return;

            User admin = new User("user_admin", "admin", hashPassword("admin"), "Administrator");
            admin.email = "admin@pycasa.local";
            save(admin.id, admin);
            LOG.info("Created default admin user (username: admin, password: admin)");
        } catch (Exception e) {
            LOG.warn("Could not ensure default user: " + e.getMessage());
        }
    }

    private void ensureDefaultSettings() {
        if (get("settings", AppSettings.class) == null) {
            save("settings", new AppSettings());
        }
    }

    // -------------------------------------------------------------------------
    // User queries — use explicit property selects to avoid collection-key issues
    // -------------------------------------------------------------------------

    public User findUserByUsername(String username) {
        try {
            // First find the doc ID by username
            Query q = QueryBuilder.select(SelectResult.expression(Meta.id))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("user"))
                            .and(Expression.property("username").equalTo(Expression.string(username))));
            ResultSet rs = q.execute();
            List<Result> results = rs.allResults();
            if (results.isEmpty()) return null;

            // Then load the full document directly — avoids any SelectResult key issues
            String docId = results.get(0).getString(0); // Meta.id is index 0
            Document doc = defaultCollection.getDocument(docId);
            if (doc == null) return null;

            Map<String, Object> map = doc.toMap();
            LOG.debugf("User doc keys: %s", map.keySet());
            User user = new User();
            user.id = (String) map.get("id");
            user.username = (String) map.get("username");
            user.passwordHash = (String) map.get("password_hash");
            user.name = (String) map.get("name");
            user.email = (String) map.get("email");
            return user;
        } catch (Exception e) {
            LOG.warn("findUserByUsername failed: " + e.getMessage());
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Folder queries
    // -------------------------------------------------------------------------

    public List<MonitoredFolder> listFolders() {
        try {
            Query q = QueryBuilder.select(FOLDER_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("folder")));
            ResultSet rs = q.execute();
            List<MonitoredFolder> folders = new ArrayList<>();
            for (Result r : rs.allResults()) {
                MonitoredFolder f = new MonitoredFolder();
                f.id = r.getString("id");
                f.path = r.getString("path");
                f.label = r.getString("label");
                f.createdAt = r.getLong("createdAt");
                folders.add(f);
            }
            return folders;
        } catch (Exception e) {
            LOG.warn("listFolders failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    // -------------------------------------------------------------------------
    // Image queries
    // -------------------------------------------------------------------------

    public List<ImageRecord> listImages(String folderId, String search, List<String> tags,
                                        String sortBy, String sortOrder, int page, int limit) {
        try {
            Expression where = Expression.property("type").equalTo(Expression.string("image"));
            if (folderId != null && !folderId.isBlank()) {
                where = where.and(Expression.property("folder_id").equalTo(Expression.string(folderId)));
            }
            if (search != null && !search.isBlank()) {
                String lc = "%" + search.toLowerCase() + "%";
                where = where.and(
                        Expression.property("file_path").like(Expression.string(lc))
                                .or(Expression.property("description").like(Expression.string(lc)))
                );
            }

            String col = switch (sortBy != null ? sortBy : "modified_at") {
                case "created_at" -> "created_at";
                case "size"       -> "file_size";
                case "file_path"  -> "file_path";
                default           -> "modified_at";
            };
            Ordering ordering = "ASC".equalsIgnoreCase(sortOrder)
                    ? Ordering.property(col).ascending()
                    : Ordering.property(col).descending();

            Query q = QueryBuilder.select(IMAGE_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(where)
                    .orderBy(ordering)
                    .limit(Expression.intValue(limit), Expression.intValue((page - 1) * limit));

            ResultSet rs = q.execute();
            List<ImageRecord> images = new ArrayList<>();
            for (Result r : rs.allResults()) {
                ImageRecord img = resultToImageRecord(r);
                if (tags != null && !tags.isEmpty()) {
                    if (img.tags == null || !img.tags.containsAll(tags)) continue;
                }
                images.add(img);
            }
            return images;
        } catch (Exception e) {
            LOG.warn("listImages failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<String> listAllTags() {
        try {
            Query q = QueryBuilder.select(SelectResult.property("tags"))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image")));
            ResultSet rs = q.execute();
            Set<String> tagSet = new LinkedHashSet<>();
            for (Result r : rs.allResults()) {
                Array arr = r.getArray("tags");
                if (arr != null) {
                    for (int i = 0; i < arr.count(); i++) {
                        String t = arr.getString(i);
                        if (t != null) tagSet.add(t);
                    }
                }
            }
            List<String> sorted = new ArrayList<>(tagSet);
            Collections.sort(sorted);
            return sorted;
        } catch (Exception e) {
            LOG.warn("listAllTags failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    public ImageRecord findImageByPath(String path) {
        try {
            Query q = QueryBuilder.select(IMAGE_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image"))
                            .and(Expression.property("file_path").equalTo(Expression.string(path))));
            ResultSet rs = q.execute();
            List<Result> results = rs.allResults();
            if (results.isEmpty()) return null;
            return resultToImageRecord(results.get(0));
        } catch (Exception e) {
            LOG.warn("findImageByPath failed: " + e.getMessage());
            return null;
        }
    }

    public List<ImageRecord> listUnanalysedImages() {
        try {
            Query q = QueryBuilder.select(IMAGE_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image"))
                            .and(Expression.property("ai_analysed").equalTo(Expression.booleanValue(false))
                                    .or(Expression.property("ai_analysed").isNotValued())));
            ResultSet rs = q.execute();
            List<ImageRecord> images = new ArrayList<>();
            for (Result r : rs.allResults()) images.add(resultToImageRecord(r));
            return images;
        } catch (Exception e) {
            LOG.warn("listUnanalysedImages failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<ImageRecord> listAllImages() {
        try {
            Query q = QueryBuilder.select(IMAGE_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image")));
            ResultSet rs = q.execute();
            List<ImageRecord> images = new ArrayList<>();
            for (Result r : rs.allResults()) images.add(resultToImageRecord(r));
            return images;
        } catch (Exception e) {
            LOG.warn("listAllImages failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    public Map<String, Long> getImageDateCounts() {
        Map<String, Long> counts = new TreeMap<>(Collections.reverseOrder());
        try {
            Query q = QueryBuilder.select(SelectResult.property("modified_at"))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image")));
            ResultSet rs = q.execute();
            for (Result r : rs.allResults()) {
                long modifiedAt = r.getLong("modified_at");
                if (modifiedAt > 0) {
                    java.time.LocalDate date = java.time.Instant.ofEpochMilli(modifiedAt)
                            .atZone(java.time.ZoneId.systemDefault())
                            .toLocalDate();
                    String dateStr = date.toString();
                    counts.put(dateStr, counts.getOrDefault(dateStr, 0L) + 1);
                }
            }
        } catch (Exception e) {
            LOG.warn("getImageDateCounts failed: " + e.getMessage());
        }
        return counts;
    }

    public void deleteImagesByFolderId(String folderId) {
        try {
            Query q = QueryBuilder.select(SelectResult.expression(Meta.id))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("image"))
                            .and(Expression.property("folder_id").equalTo(Expression.string(folderId))));
            ResultSet rs = q.execute();
            List<Result> results = rs.allResults();
            LOG.infof("Deleting %d image records for folder %s", results.size(), folderId);
            for (Result r : results) {
                String docId = r.getString(0); // Meta.id
                if (docId != null) {
                    Document doc = defaultCollection.getDocument(docId);
                    if (doc != null) defaultCollection.delete(doc);
                }
            }
        } catch (Exception e) {
            LOG.warnf("deleteImagesByFolderId failed for folder %s: %s", folderId, e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Notification queries
    // -------------------------------------------------------------------------

    private static final SelectResult[] NOTIFICATION_FIELDS = {
            SelectResult.expression(Meta.id),
            SelectResult.property("id"),
            SelectResult.property("event_type"),
            SelectResult.property("message"),
            SelectResult.property("detail"),
            SelectResult.property("ts"),
            SelectResult.property("read"),
            SelectResult.property("type"),
    };

    public void saveNotification(NotificationRecord n) {
        save(n.id, n);
    }

    public List<NotificationRecord> listNotifications(String search, String eventType) {
        try {
            Expression where = Expression.property("type").equalTo(Expression.string("notification"));
            if (eventType != null && !eventType.isBlank()) {
                where = where.and(Expression.property("event_type").equalTo(Expression.string(eventType)));
            }
            if (search != null && !search.isBlank()) {
                String lc = "%" + search.toLowerCase() + "%";
                where = where.and(
                        Expression.property("message").like(Expression.string(lc))
                                .or(Expression.property("detail").like(Expression.string(lc)))
                                .or(Expression.property("event_type").like(Expression.string(lc)))
                );
            }
            Query q = QueryBuilder.select(NOTIFICATION_FIELDS)
                    .from(DataSource.collection(defaultCollection))
                    .where(where)
                    .orderBy(Ordering.property("ts").descending());
            ResultSet rs = q.execute();
            List<NotificationRecord> list = new ArrayList<>();
            for (Result r : rs.allResults()) {
                NotificationRecord n = new NotificationRecord();
                n.id = r.getString("id");
                n.event_type = r.getString("event_type");
                n.message = r.getString("message");
                n.detail = r.getString("detail");
                n.ts = r.getLong("ts");
                n.read = r.getBoolean("read");
                list.add(n);
            }
            return list;
        } catch (Exception e) {
            LOG.warn("listNotifications failed: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    public long countUnreadNotifications() {
        try {
            Query q = QueryBuilder.select(SelectResult.expression(Function.count(Expression.string("*"))))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("notification"))
                            .and(Expression.property("read").equalTo(Expression.booleanValue(false))
                                    .or(Expression.property("read").isNotValued())));
            ResultSet rs = q.execute();
            List<Result> results = rs.allResults();
            return results.isEmpty() ? 0 : results.get(0).getLong(0);
        } catch (Exception e) {
            return 0;
        }
    }

    public void markAllNotificationsRead() {
        try {
            Query q = QueryBuilder.select(SelectResult.expression(Meta.id))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("notification"))
                            .and(Expression.property("read").equalTo(Expression.booleanValue(false))
                                    .or(Expression.property("read").isNotValued())));
            ResultSet rs = q.execute();
            for (Result r : rs.allResults()) {
                String docId = r.getString(0);
                if (docId == null) continue;
                Document doc = defaultCollection.getDocument(docId);
                if (doc == null) continue;
                MutableDocument mutable = doc.toMutable();
                mutable.setBoolean("read", true);
                defaultCollection.save(mutable);
            }
        } catch (Exception e) {
            LOG.warn("markAllNotificationsRead failed: " + e.getMessage());
        }
    }

    public void deleteAllNotifications() {
        try {
            Query q = QueryBuilder.select(SelectResult.expression(Meta.id))
                    .from(DataSource.collection(defaultCollection))
                    .where(Expression.property("type").equalTo(Expression.string("notification")));
            ResultSet rs = q.execute();
            for (Result r : rs.allResults()) {
                String docId = r.getString(0);
                if (docId == null) continue;
                Document doc = defaultCollection.getDocument(docId);
                if (doc != null) defaultCollection.delete(doc);
            }
        } catch (Exception e) {
            LOG.warn("deleteAllNotifications failed: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private ImageRecord resultToImageRecord(Result r) {
        ImageRecord img = new ImageRecord();
        img.id = r.getString("id");
        img.file_path = r.getString("file_path");
        img.folder_id = r.getString("folder_id");
        img.description = r.getString("description");
        img.ocr_text = r.getString("ocr_text");
        img.file_size = r.getLong("file_size");
        img.modified_at = r.getLong("modified_at");
        img.created_at = r.getLong("created_at");
        img.indexed_at = r.getLong("indexed_at");
        img.ai_analysed = r.getBoolean("ai_analysed");
        img.thumbnail_path = r.getString("thumbnail_path");
        Array arr = r.getArray("tags");
        if (arr != null) {
            List<String> tagList = new ArrayList<>();
            for (int i = 0; i < arr.count(); i++) {
                String t = arr.getString(i);
                if (t != null) tagList.add(t);
            }
            img.tags = tagList;
        }
        return img;
    }
}
