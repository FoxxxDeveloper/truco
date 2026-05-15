import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { socialApi } from '../services/api';
import { getSocket } from '../services/socket';
import ChatCenter from '../components/chat/ChatCenter';

const noop = () => {};

const defaultValue = {
  privateChatUnread: 0,
  unreadCounts:      {},
  clearFriendUnread: noop,
  refreshUnread:     noop,
  openPrivateChat:   noop,
  openChallengeChat: noop,
};

const ChatShellContext = createContext(defaultValue);

export function useChatShell() {
  return useContext(ChatShellContext);
}

export function ChatShellProvider({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCounts, setUnreadCounts] = useState({});
  const [pendingOpenFriend, setPendingOpenFriend] = useState(null);

  const refreshUnread = useCallback(() => {
    if (!user?.id) return;
    socialApi
      .getUnreadSummary()
      .then((res) => {
        if (res.data?.unreadByUser) setUnreadCounts(res.data.unreadByUser);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCounts({});
      setPendingOpenFriend(null);
      return;
    }
    refreshUnread();
  }, [user?.id, refreshUnread]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user?.id) return;
    const handleMsg = () => {
      refreshUnread();
    };
    socket.on('private:message:received', handleMsg);
    return () => socket.off('private:message:received', handleMsg);
  }, [user?.id, refreshUnread]);

  useEffect(() => {
    const st = location.state?.openPrivateFriend;
    if (!user?.id || !st?.id) return;
    setPendingOpenFriend(st);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, user?.id]);

  const clearFriendUnread = useCallback((friendId) => {
    setUnreadCounts((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  }, []);

  const privateChatUnread = useMemo(
    () => Object.values(unreadCounts).reduce((s, n) => s + (Number(n) || 0), 0),
    [unreadCounts]
  );

  const openPrivateChat = useCallback((friend) => {
    if (!friend?.id) return;
    setPendingOpenFriend(friend);
  }, []);

  const openChallengeChat = useCallback((friend) => {
    if (!friend?.id) return;
    setPendingOpenFriend({ ...friend, openChallengeModal: true });
  }, []);

  const value = useMemo(() => {
    if (!user?.id || loading) return defaultValue;
    return {
      privateChatUnread,
      unreadCounts,
      clearFriendUnread,
      refreshUnread,
      openPrivateChat,
      openChallengeChat,
    };
  }, [
    user?.id,
    loading,
    privateChatUnread,
    unreadCounts,
    clearFriendUnread,
    refreshUnread,
    openPrivateChat,
    openChallengeChat,
  ]);

  return (
    <ChatShellContext.Provider value={value}>
      {children}
      {user?.id && !loading && (
        <ChatCenter
          unreadCounts={unreadCounts}
          onClearUnread={clearFriendUnread}
          openPrivateFriend={pendingOpenFriend}
          onConsumedOpenPrivate={() => setPendingOpenFriend(null)}
          onStartPrivateChat={openPrivateChat}
          onChallengeFriend={openChallengeChat}
        />
      )}
    </ChatShellContext.Provider>
  );
}
