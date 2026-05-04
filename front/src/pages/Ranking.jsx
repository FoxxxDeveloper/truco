import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rankingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Ranking() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    rankingApi.getGlobal(50)
      .then(r => setRanking(r.data.ranking))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ranking-page">
      <header className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate('/lobby')}>← Volver</button>
        <h1>🏆 Ranking Global</h1>
      </header>
      {loading ? (
        <div className="spinner-center"><div className="spinner" /></div>
      ) : (
        <div className="ranking-table-wrap">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jugador</th>
                <th>ELO</th>
                <th>V</th>
                <th>D</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.userId} className={r.userId === user?.id ? 'my-row' : ''}>
                  <td className={`rank-num rank-${i + 1}`}>{i + 1}</td>
                  <td>{r.username} {r.userId === user?.id && <span className="you-badge">vos</span>}</td>
                  <td className="elo">{r.elo}</td>
                  <td className="wins">{r.wins}</td>
                  <td className="losses">{r.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
