import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: check existing token
  useEffect(() => {
    const token = localStorage.getItem('truco_token');
    if (!token) { setLoading(false); return; }

    authApi.me()
      .then(res => {
        setUser(res.data.user);
        connectSocket(token);
      })
      .catch(() => {
        localStorage.removeItem('truco_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const { token, user: u } = res.data;
    localStorage.setItem('truco_token', token);
    setUser(u);
    connectSocket(token);
    return u;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const res = await authApi.register({ username, email, password });
    const { token, user: u } = res.data;
    localStorage.setItem('truco_token', token);
    setUser(u);
    connectSocket(token);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('truco_token');
    setUser(null);
    disconnectSocket();
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
