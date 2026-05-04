import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { GameProvider } from './context/GameContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login    from './pages/Login';
import Register from './pages/Register';
import Lobby    from './pages/Lobby';
import Game     from './pages/Game';
import Ranking  from './pages/Ranking';
import Admin    from './pages/Admin';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <BrowserRouter>
          <Toaster
            position="top-center"
            toastOptions={{ duration: 3000, style: { background: '#1e2a3a', color: '#fff' } }}
          />
          <Routes>
            <Route path="/"         element={<Navigate to="/lobby" replace />} />
            <Route path="/login"    element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/lobby"    element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
            <Route path="/game"     element={<ProtectedRoute><Game /></ProtectedRoute>} />
            <Route path="/ranking"  element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
            <Route path="/admin"    element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
