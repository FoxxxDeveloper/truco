import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// Attach JWT token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('truco_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('truco_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login',    data),
  me:       ()     => api.get('/auth/me'),
};

// ── Ranking ───────────────────────────────────────────────────────
export const rankingApi = {
  getGlobal: (limit = 50) => api.get(`/ranking?limit=${limit}`),
  getMe:     ()            => api.get('/ranking/me'),
};

// ── Wallet ────────────────────────────────────────────────────────
export const walletApi = {
  getBalance:     ()           => api.get('/wallet'),
  getHistory:     (p = {})     => api.get('/wallet/transactions', { params: p }),
  depositRequest: (body)       => api.post('/wallet/deposit/request', body),
  withdrawRequest:(body)       => api.post('/wallet/withdraw/request', body),
};

// ── Challenges ────────────────────────────────────────────────────
export const challengeApi = {
  list:   ()        => api.get('/challenges'),
  create: (body)    => api.post('/challenges', body),
  accept: (id)      => api.post(`/challenges/${id}/accept`),
  cancel: (id)      => api.delete(`/challenges/${id}`),
};

// ── Social ────────────────────────────────────────────────────────
export const socialApi = {
  getFriends:     ()        => api.get('/social/friends'),
  addFriend:      (username)=> api.post('/social/friends', { username }),
  acceptFriend:   (id)      => api.post(`/social/friends/${id}/accept`),
  removeFriend:   (id)      => api.delete(`/social/friends/${id}`),
  getMessages:    (userId)  => api.get(`/social/messages/${userId}`),
  getNotifications: ()      => api.get('/social/notifications'),
  markRead:       (id)      => api.patch(`/social/notifications/${id}/read`),
  markAllRead:    ()        => api.post('/social/notifications/read-all'),
};

// ── Admin ─────────────────────────────────────────────────────────
export const adminApi = {
  dashboard:        ()         => api.get('/admin/dashboard'),
  listUsers:        (p = {})   => api.get('/admin/users', { params: p }),
  updateUser:       (id, body) => api.patch(`/admin/users/${id}`, body),
  listTransactions: (p = {})   => api.get('/admin/transactions', { params: p }),
  approveDeposit:   (id)       => api.post(`/admin/transactions/${id}/approve`),
  rejectDeposit:    (id, body) => api.post(`/admin/transactions/${id}/reject`, body),
  listGames:        (p = {})   => api.get('/admin/games', { params: p }),
  adjustBalance:    (userId, body) => api.post(`/admin/users/${userId}/adjust`, body),
};

export default api;
