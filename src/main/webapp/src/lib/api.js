/**
 * API client for making requests to the REST API server
 *
 * Usage:
 * import { api } from '@/lib/api';
 *
 * const session = await api.auth.getSession();
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const key = localStorage.getItem('auth_token');

        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        if (key) {
            config.headers['Authorization'] = `Bearer ${key}`;
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            // AbortError is intentional (e.g. component unmount cleanup) — don't log it
            if (error.name !== 'AbortError') {
                console.error('API request failed:', error);
            }
            throw error;
        }
    }

    async requestStream(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const key = localStorage.getItem('auth_token');

        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        if (key) {
            config.headers['Authorization'] = `Bearer ${key}`;
        }

        const response = await fetch(url, config);

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP error! status: ${response.status}`);
        }

        return response;
    }

    async getSession() {
        const token = localStorage.getItem('auth_token');
        if (!token) return null;

        try {
            const data = await this.request('/auth/session');
            return data.session;
        } catch (error) {
            localStorage.removeItem('auth_token');
            return null;
        }
    }

    // Auth API
    auth = {
        login: async (username, password) => {
            const data = await this.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            if (data.session?.access_token) {
                localStorage.setItem('auth_token', data.session.access_token);
            }
            return data;
        },
        logout: async () => {
            try {
                await this.request('/auth/logout', { method: 'POST' });
            } finally {
                localStorage.removeItem('auth_token');
            }
        },
        getSession: () => this.getSession(),
    };

    // Health check
    health = () => this.request('/health');

    // Folders API
    folders = {
        listMonitored: () => this.request('/folders'),
        addMonitored: (path, label) =>
            this.request('/folders', {
                method: 'POST',
                body: JSON.stringify({ path, label }),
            }),
        removeMonitored: (folderId) =>
            this.request(`/folders/${folderId}`, {
                method: 'DELETE',
            }),
        rescanFolder: (folderId) =>
            this.request(`/folders/${folderId}/rescan`, {
                method: 'POST',
            }),
        getScanningFolders: () => this.request('/folders/scanning'),
        getHierarchy: (folderId) => this.request(`/folders/${folderId}/hierarchy`),
        listDir: (path = null) => {
            const params = new URLSearchParams();
            if (path) params.append('path', path);
            return this.request(`/folders/list?${params.toString()}`);
        },
        browse: async () => {
            const url = `${this.baseURL}/folders/browse`;
            const key = localStorage.getItem('auth_token');
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(key ? { Authorization: `Bearer ${key}` } : {}),
                },
            });
            if (response.status === 204) return null; // user cancelled
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            return response.json();
        },
        getTrashPath: () => this.request('/folders/trash-path'),
        updateTrashPath: (path) =>
            this.request('/folders/trash-path', {
                method: 'POST',
                body: JSON.stringify({ path }),
            }),
    };

    // Images API
    images = {
        list: (
            folderId = null,
            search = null,
            tags = null,
            sortBy = 'modified_at',
            sortOrder = 'DESC',
            page = 1,
            limit = 30,
            dateFrom = null,
            dateTo = null,
            extensions = null,
            sizeMin = null,
            sizeMax = null,
            favorite = null,
            trashed = false
        ) => {
            const params = new URLSearchParams({
                page,
                limit,
                sort_by: sortBy,
                sort_order: sortOrder,
            });
            if (folderId) params.append('folder_id', folderId);
            if (search) params.append('search', search);
            if (tags && tags.length > 0) params.append('tags', tags.join(','));
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);
            if (extensions && extensions.length > 0)
                params.append('extensions', extensions.join(','));
            if (sizeMin != null) params.append('size_min', sizeMin);
            if (sizeMax != null) params.append('size_max', sizeMax);
            if (favorite != null) params.append('favorite', favorite);
            if (trashed != null) params.append('trashed', trashed);
            return this.request(`/images?${params.toString()}`);
        },
        getMetadata: (path = null, id = null) => {
            const params = new URLSearchParams();
            if (path) params.append('path', path);
            if (id) params.append('id', id);
            return this.request(`/images/metadata?${params.toString()}`);
        },
        getTags: () => this.request('/images/tags'),
        getDetails: (path) => this.request(`/images/details?path=${encodeURIComponent(path)}`),
        getRawUrl: (path) => `${this.baseURL}/images/raw?path=${encodeURIComponent(path)}`,
        getThumbnail: (path) => `${this.baseURL}/images/thumbnail?path=${encodeURIComponent(path)}`,
        updateMetadata: (data) =>
            this.request('/images/metadata', {
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        delete: (folderId, path) =>
            this.request(`/images?folder_id=${folderId}&path=${encodeURIComponent(path)}`, {
                method: 'DELETE',
            }),
        getScanStatus: () => this.request('/images/scan-status'),
        triggerScan: () => this.request('/images/scan', { method: 'POST' }),
        toggleFavorite: (id) => this.request(`/images/${id}/favorite`, { method: 'POST' }),
        listFavorites: (page = 1, limit = 50) =>
            this.request(`/images/favorites?page=${page}&limit=${limit}`),
        restore: (id) => this.request(`/images/${id}/restore`, { method: 'POST' }),
        listTrashed: (page = 1, limit = 50) =>
            this.request(`/images?trashed=true&page=${page}&limit=${limit}`),
    };

    // Settings API
    settings = {
        get: () => this.request('/settings'),
        update: (data) =>
            this.request('/settings', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
    };

    // Notifications API
    notifications = {
        list: (search = null, eventType = null) => {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (eventType) params.append('event_type', eventType);
            const qs = params.toString();
            return this.request(`/notifications${qs ? '?' + qs : ''}`);
        },
        unreadCount: () => this.request('/notifications/unread-count'),
        markRead: (id) => this.request(`/notifications/${id}/read`, { method: 'PATCH' }),
        markAllRead: () => this.request('/notifications/mark-all-read', { method: 'POST' }),
        delete: (id) => this.request(`/notifications/${id}`, { method: 'DELETE' }),
        deleteAll: () => this.request('/notifications', { method: 'DELETE' }),
    };

    // Defaults API
    defaults = {
        prompts: () => this.request('/defaults/prompts'),
    };

    // AI API
    ai = {
        analyse: (imagePath) =>
            this.request('/ai/analyse', {
                method: 'POST',
                body: JSON.stringify({ image_path: imagePath }),
            }),
        listModels: (url = null) => {
            const params = new URLSearchParams();
            if (url) params.append('url', url);
            return this.request(`/ai/models?${params.toString()}`);
        },
        ping: (url, signal = null) =>
            this.request('/ai/ping', {
                method: 'POST',
                body: JSON.stringify({ url }),
                signal,
            }),
        ocr: (imagePath) =>
            this.request('/ai/ocr', {
                method: 'POST',
                body: JSON.stringify({ image_path: imagePath }),
            }),
        batchAnalyse: (rerun = false) =>
            this.request('/ai/batch-analyse', {
                method: 'POST',
                body: JSON.stringify({ rerun }),
            }),
        getAnalysisStatus: () => this.request('/ai/analysis-status'),
    };
}

export const api = new ApiClient(API_BASE_URL);
export default api;
