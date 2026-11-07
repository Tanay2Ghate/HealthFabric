import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Request interceptor — attach JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('healthchain_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('healthchain_token')
      localStorage.removeItem('healthchain_user')
      window.location.href = '/login'
    }
    return Promise.reject(formatError(error))
  },
)

function formatError(error) {
  const message =
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    'An unexpected error occurred'
  return { ...error, userMessage: message }
}

// ─── Auth Service ─────────────────────────────────────────────────────────────
export const authService = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
}

// ─── Document Service ─────────────────────────────────────────────────────────
export const documentService = {
  upload: (formData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  list: (params) => api.get('/documents', { params }),
  get: (id) => api.get(`/documents/${id}`),
  download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
  verify: (id) => api.post(`/documents/${id}/verify`),
  history: (id) => api.get(`/documents/${id}/history`),
  delete: (id) => api.delete(`/documents/${id}`),
}

// ─── Access Service ───────────────────────────────────────────────────────────
export const accessService = {
  grant: (payload) => api.post('/access/grant', payload),
  revoke: (payload) => api.post('/access/revoke', payload),
  listMyPermissions: (params) => api.get('/access/my-permissions', { params }),
  getDocumentPermissions: (documentId) => api.get(`/access/document/${documentId}`),
  listAccessible: () => api.get('/access/accessible-documents'),
}

// ─── Review Service ───────────────────────────────────────────────────────────
export const reviewService = {
  add: (payload) => api.post('/reviews', payload),
  getByDocument: (documentId) => api.get(`/reviews/document/${documentId}`),
  get: (id) => api.get(`/reviews/${id}`),
  listMine: () => api.get('/reviews/mine'),
}

// ─── Blockchain Explorer Service ──────────────────────────────────────────────
export const explorerService = {
  getTransactions: (params) => api.get('/explorer/transactions', { params }),
  getDocumentHistory: (documentId) => api.get(`/explorer/document/${documentId}/history`),
  getAccessHistory: (params) => api.get('/explorer/access-history', { params }),
  getNetworkStatus: () => api.get('/explorer/status'),
}

export default api
