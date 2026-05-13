export default function ScoreBoard({ scores, players, myId, opponent, targetPoints = 30 }) {
  const myScore  = scores[myId]       || 0;
  const oppScore = scores[opponent?.id] || 0;
  const cap = Math.max(1, Number(targetPoints) || 30);
  const myPct = Math.min(100, (myScore / cap) * 100);
  const oppPct = Math.min(100, (oppScore / cap) * 100);

  return (
    <div className="scoreboard game-scoreboard">
      <div className="score-item mine" style={{ '--score-pct': `${myPct}%` }}>
        <span className="score-name">Vos</span>
        <span className="score-pts">{myScore}</span>
        <div className="score-bar" />
      </div>
      <div className="score-separator">/ {cap}</div>
      <div className="score-item theirs" style={{ '--score-pct': `${oppPct}%` }}>
        <span className="score-name">{opponent?.username || 'Oponente'}</span>
        <span className="score-pts">{oppScore}</span>
        <div className="score-bar" />
      </div>
    </div>
  );
}
