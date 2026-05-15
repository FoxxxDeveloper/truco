import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { rankingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Trophy } from 'lucide-react';
import PublicProfileModal from '../components/profile/PublicProfileModal';
import AppHeader from '../components/layout/AppHeader';
import TrucoAvatar from '../components/avatar/TrucoAvatar';

const MEDAL_LABELS = ['1°', '2°', '3°'];

export default function Ranking() {
  const [ranking, setRanking] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewUserId, setViewUserId] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([rankingApi.getGlobal(50), rankingApi.getMe().catch(() => null)])
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

  const rowMeta = (r, index) => {
    const isMe = Number(r.userId) === Number(user?.id);
    const total = (r.wins || 0) + (r.losses || 0);
    const pct = total > 0 ? Math.round((r.wins / total) * 100) : 0;
    const pos = index + 1;
    const tiers = [];
    if (pos === 1) tiers.push('ranking-tier--champion');
    else if (pos === 2) tiers.push('ranking-tier--silver');
    else if (pos === 3) tiers.push('ranking-tier--bronze');
    if (isMe) tiers.push('ranking-tier--me');
    const tier = tiers.join(' ');
    return { isMe, pct, pos, tier };
  };

  return (
    <div className="ranking-page ranking-page--et4 page-container app-page">
      <AppHeader />

      <div className="page-shell">
      <div className="ranking-hero fx-card">
        <div className="ranking-hero-title-row">
          <Trophy className="ranking-hero-icon" size={28} aria-hidden />
          <div>
            <h1 className="ranking-page-title">Ranking global</h1>
            <p className="ranking-page-sub">Los mejores jugadores de TrucoFX</p>
          </div>
        </div>
        {myRank && (
          <div className="ranking-my-banner fx-badge fx-badge--gold">
            Tu posición: #{myRank.rank} · ELO {myRank.elo}
          </div>
        )}
      </div>

      {loading && (
        <div className="ranking-loading">
          <div className="spinner" />
        </div>
      )}

      {error && !loading && <p className="ranking-error">{error}</p>}

      {!loading && !error && ranking.length === 0 && (
        <p className="ranking-empty">Aún no hay jugadores en el ranking. ¡Jugá la primera partida!</p>
      )}

      {!loading && !error && ranking.length > 0 && (
        <>
          <div className="ranking-table-wrap ranking-table-desktop">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th className="ranking-th-pos">#</th>
                  <th>Jugador</th>
                  <th>ELO</th>
                  <th>Victorias</th>
                  <th>Derrotas</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const { isMe, pct, pos, tier } = rowMeta(r, i);
                  return (
                    <motion.tr
                      key={r.userId}
                      className={`ranking-table-row ${tier}`.trim()}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.015 }}
                    >
                      <td className={`ranking-td-pos rank-pos-${pos <= 3 ? pos : 'rest'}`}>
                        {pos <= 3 ? (
                          <span className={`ranking-medal ranking-medal--${pos}`}>{MEDAL_LABELS[pos - 1]}</span>
                        ) : (
                          pos
                        )}
                      </td>
                      <td>
                        <div className="ranking-player-cell">
                          <TrucoAvatar username={r.username} avatar={r.avatar} size={36} className="ranking-avatar" />
                          <button
                            type="button"
                            className={`ranking-name-btn${isMe ? ' ranking-name-btn--me' : ''}`.trim()}
                            onClick={() => !isMe && setViewUserId(r.userId)}
                            disabled={isMe}
                          >
                            {r.username}
                            {isMe && <span className="fx-badge fx-badge--muted ranking-you-badge">Vos</span>}
                          </button>
                        </div>
                      </td>
                      <td className="ranking-td-elo">{r.elo}</td>
                      <td className="ranking-td-wins">{r.wins}</td>
                      <td className="ranking-td-losses">{r.losses}</td>
                      <td className={pct >= 50 ? 'ranking-td-wr-good' : 'ranking-td-wr'}>{pct}%</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ranking-cards-mobile">
            {ranking.map((r, i) => {
              const { isMe, pct, pos, tier } = rowMeta(r, i);
              return (
                <motion.div
                  key={r.userId}
                  className={`fx-card ranking-card-mobile ranking-card-mobile--et4 ${tier}`.trim()}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <div className="ranking-card-mobile-top">
                    <span className={`ranking-card-pos rank-pos-${pos <= 3 ? pos : 'rest'}`}>
                      {pos <= 3 ? (
                        <span className={`ranking-medal ranking-medal--${pos}`}>{MEDAL_LABELS[pos - 1]}</span>
                      ) : (
                        `#${pos}`
                      )}
                    </span>
                    <span className="ranking-card-elo">{r.elo} ELO</span>
                  </div>
                  <div className="ranking-card-mobile-player">
                    <TrucoAvatar username={r.username} avatar={r.avatar} size={36} className="ranking-avatar" />
                    <button
                      type="button"
                      className={`ranking-name-btn${isMe ? ' ranking-name-btn--me' : ''}`.trim()}
                      onClick={() => !isMe && setViewUserId(r.userId)}
                      disabled={isMe}
                    >
                      {r.username}
                      {isMe && <span className="fx-badge fx-badge--muted ranking-you-badge">Vos</span>}
                    </button>
                  </div>
                  <div className="ranking-card-mobile-stats">
                    <span>V {r.wins}</span>
                    <span>D {r.losses}</span>
                    <span className={pct >= 50 ? 'ranking-td-wr-good' : ''}>{pct}% WR</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      <AnimatePresence>
        {viewUserId && <PublicProfileModal userId={viewUserId} onClose={() => setViewUserId(null)} />}
      </AnimatePresence>
      </div>
    </div>
  );
}
