import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FriendChallengeListener from './social/FriendChallengeListener';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <FriendChallengeListener />
      {children}
    </>
  );
}
