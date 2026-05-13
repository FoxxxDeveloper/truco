import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { GameProvider } from './context/GameContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Ranking from './pages/Ranking';
import Admin from './pages/Admin';
import ProfilePage from './pages/ProfilePage';
import RulesPage from './pages/RulesPage';
import Battles from './pages/Battles';
import VerificationPage from './pages/VerificationPage';
import TournamentsPage from './pages/TournamentsPage';
import TournamentDetail from './pages/TournamentDetail';
import TournamentBracket from './pages/TournamentBracket';
import NotFound from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <BrowserRouter>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'linear-gradient(165deg, rgba(43,27,18,0.98) 0%, rgba(26,26,26,0.98) 100%)',
                color: '#FFF6DD',
                border: '1px solid rgba(212, 175, 55, 0.42)',
                borderRadius: '16px',
                boxShadow: '0 24px 70px rgba(0,0,0,0.5), 0 12px 36px rgba(212, 175, 55, 0.12)',
                fontFamily: '"Montserrat", "Segoe UI", system-ui, sans-serif',
              },
            }}
          />

          <Routes>
            <Route path="/" element={<Navigate to="/lobby" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/lobby"
              element={
                <ProtectedRoute>
                  <Lobby />
                </ProtectedRoute>
              }
            />

            <Route
              path="/game"
              element={
                <ProtectedRoute>
                  <Game />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ranking"
              element={
                <ProtectedRoute>
                  <Ranking />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            <Route path="/reglas" element={<RulesPage />} />

            <Route
              path="/verification"
              element={
                <ProtectedRoute>
                  <VerificationPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/batallas"
              element={
                <ProtectedRoute>
                  <Battles />
                </ProtectedRoute>
              }
            />

            <Route
              path="/torneos"
              element={
                <ProtectedRoute>
                  <TournamentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/torneos/:id"
              element={
                <ProtectedRoute>
                  <TournamentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/torneos/:id/bracket"
              element={
                <ProtectedRoute>
                  <TournamentBracket />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;