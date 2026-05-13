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

// ── Profile ───────────────────────────────────────────────────────
export const profileApi = {
  getMe:        ()          => api.get('/profile/me'),
  getUser:      (username)  => api.get(`/profile/${encodeURIComponent(username)}`),
  update:       (body)      => api.put('/profile', body),
  uploadAvatar: (file)      => {
    const fd = new FormData();
    fd.append('avatar', file);
    return api.post('/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ── Users (public profiles by ID) ────────────────────────────────
export const usersApi = {
  getPublic: (id) => api.get(`/users/${id}/public`),
};

// ── Wallet ────────────────────────────────────────────────────────
export const walletApi = {
  getBalance:       ()           => api.get('/wallet'),
  getHistory:       (p = {})     => api.get('/wallet/transactions', { params: p }),
  depositRequest:   (body)       => api.post('/wallet/deposit/request', body),
  withdrawRequest:  (body)       => api.post('/wallet/withdraw/request', body),
  cancelWithdrawal: (id)         => api.post(`/wallet/withdraw/${id}/cancel`),
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
  getFriends: () =>
    api.get('/social/friends'),

  getFriendRequests: () =>
    api.get('/social/friends/requests'),

  sendFriendRequest: (userId) =>
    api.post(`/social/friends/${userId}/request`),

  acceptFriend: (userId) =>
    api.put(`/social/friends/${userId}/accept`),

  removeFriend: (userId) =>
    api.delete(`/social/friends/${userId}`),

  getMessages: (userId) =>
    api.get(`/social/messages/${userId}`),

  markMessagesRead: (userId) =>
    api.post(`/social/messages/${userId}/read`),

  getUnreadSummary: () =>
    api.get('/social/messages/unread-summary'),

  getUnreadMessagesCount: () =>
    api.get('/social/messages/unread-count'),

  getGeneralMessages: (limit = 50) =>
    api.get(`/social/general-messages?limit=${limit}`),

  getNotifications: () =>
    api.get('/social/notifications'),

  markRead: (id) =>
    api.put(`/social/notifications/${id}/read`),

  markAllRead: () =>
    api.put('/social/notifications/read-all'),
};

// ── Battles ───────────────────────────────────────────────────────
export const battleApi = {
  list:        ()           => api.get('/battles'),
  create:      (body)       => api.post('/battles', body),
  listMine:    ()           => api.get('/battles/my'),
  getActive:   ()           => api.get('/battles/active'),
  getHistory:  (p = {})     => api.get('/battles/history', { params: p }),
  getById:     (id)         => api.get(`/battles/${id}`),
  accept:      (id)         => api.post(`/battles/${id}/accept`),
  cancel:      (id)         => api.delete(`/battles/${id}`),
  joinPrivate: (code)       => api.post(`/battles/join/${encodeURIComponent(code)}`),
};

// ── Tournaments ───────────────────────────────────────────────────
export const tournamentApi = {
  getAll:     ()                      => api.get('/tournaments'),
  getById:    (id)                    => api.get(`/tournaments/${id}`),
  getBracket: (id)                    => api.get(`/tournaments/${id}/bracket`),
  register:   (id)                    => api.post(`/tournaments/${id}/register`),
  unregister: (id)                    => api.delete(`/tournaments/${id}/register`),
  checkin:    (id)                    => api.post(`/tournaments/${id}/checkin`),
  ready:      (tournamentId, matchId) => api.post(`/tournaments/${tournamentId}/matches/${matchId}/ready`),
};

// ── Admin tournaments (JWT admin) ─────────────────────────────────
export const adminTournamentApi = {
  create:         (body)       => api.post('/admin/tournaments', body),
  update:         (id, body)   => api.patch(`/admin/tournaments/${id}`, body),
  open:           (id)         => api.post(`/admin/tournaments/${id}/open`),
  startCheckin:   (id)         => api.post(`/admin/tournaments/${id}/start-checkin`),
  generateBracket:(id)         => api.post(`/admin/tournaments/${id}/generate-bracket`),
  start:          (id)         => api.post(`/admin/tournaments/${id}/start`),
  cancel:         (id, body)   => api.post(`/admin/tournaments/${id}/cancel`, body || {}),
  forceResult:    (id, matchId, body) =>
    api.post(`/admin/tournaments/${id}/matches/${matchId}/force-result`, body),
  resolveAbsence: (id, matchId) =>
    api.post(`/admin/tournaments/${id}/matches/${matchId}/resolve-absence`),
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
  listLogs:         (p = {})   => api.get('/admin/logs', { params: p }),
  listVerifications: (p = {})  => api.get('/admin/verifications', { params: p }),
  approveVerification: (userId) => api.post(`/admin/verifications/${userId}/approve`),
  rejectVerification:  (userId, body) => api.post(`/admin/verifications/${userId}/reject`, body),
};

// ── Verification ──────────────────────────────────────────────────
export const verificationApi = {
  getStatus: ()     => api.get('/verification/status'),
  submit:    (body) => api.post('/verification', body),
};

export default api;
