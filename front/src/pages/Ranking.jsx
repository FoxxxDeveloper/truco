import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { rankingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { TrophyIcon } from '../components/Icons';
import PublicProfileModal from '../components/profile/PublicProfileModal';

const MEDAL_COLORS = ['#f6c453', '#b0b8c4', '#c47a3a'];
const MEDAL_LABELS = ['1°', '2°', '3°'];

function Avatar({ username, avatar, size = 36 }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-gold)' }}
      />
    );
  }
  const initials = (username || '?').slice(0, 2).toUpperCase();
  const hue = [...username].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800, fontSize: size * 0.38,
      background: `hsl(${hue},50%,35%)`, color: '#fff', border: '2px solid var(--border-gold)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function Ranking() {
  const [ranking, setRanking] = useState([]);
  const [myRank, setMyRank]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [viewUserId, setViewUserId] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      rankingApi.getGlobal(50),
      rankingApi.getMe().catch(() => null),
    ])
      .then(([globalRes, meRes]) => {
        setRanking(globalRes.data.ranking || []);
        if (meRes) setMyRank(meRes.data);
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || 'Error al cargar el ranking';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ranking-page">
      <header className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate('/lobby')}>← Volver</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrophyIcon size={24} style={{ color: 'var(--gold)' }} />
          Ranking Global
        </h1>
        {myRank && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
            Tu posición: <strong style={{ color: 'var(--gold)' }}>#{myRank.rank}</strong>
            {' · '}ELO <strong style={{ color: 'var(--gold)' }}>{myRank.elo}</strong>
          </span>
        )}
      </header>

      {loading && <div className="spinner-center"><div className="spinner" /></div>}

      {error && !loading && (
        <p style={{ textAlign: 'center', color: 'var(--red)', padding: 32 }}>{error}</p>
      )}

      {!loading && !error && ranking.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
          Aún no hay jugadores en el ranking. ¡Jugá la primera partida!
        </p>
      )}

      {!loading && !error && ranking.length > 0 && (
        <div className="ranking-table-wrap">
          <table className="ranking-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Jugador</th>
                <th>ELO</th>
                <th>Victorias</th>
                <th>Derrotas</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => {
                const isMe = Number(r.userId) === Number(user?.id);
                const total = (r.wins || 0) + (r.losses || 0);
                const pct = total > 0 ? Math.round((r.wins / total) * 100) : 0;
                return (
                  <motion.tr
                    key={r.userId}
                    className={isMe ? 'my-row' : ''}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <td className={`rank-num rank-${i + 1}`}>
                      {i < 3 ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: '50%',
                          background: MEDAL_COLORS[i],
                          color: i === 0 ? '#3a2000' : i === 1 ? '#2a3040' : '#3a1800',
                          fontWeight: 900, fontSize: 11,
                        }}>{MEDAL_LABELS[i]}</span>
                      ) : i + 1}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar username={r.username} avatar={r.avatar} size={34} />
                        <span style={{ fontWeight: isMe ? 800 : 500 }}>
                          {r.username}
                          {isMe && <span className="you-badge" style={{ marginLeft: 6 }}>vos</span>}
                        </span>
                      </div>
                    </td>
                    <td className="elo" style={{ fontWeight: 700, color: 'var(--gold)' }}>{r.elo}</td>
                    <td className="wins" style={{ color: 'var(--green)' }}>{r.wins}</td>
                    <td className="losses" style={{ color: 'var(--red)' }}>{r.losses}</td>
                    <td style={{ color: pct >= 50 ? 'var(--green)' : 'var(--text-muted)' }}>{pct}%</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
