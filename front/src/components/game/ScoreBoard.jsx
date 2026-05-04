export default function ScoreBoard({ scores, players, myId, opponent }) {
  const myScore  = scores[myId]       || 0;
  const oppScore = scores[opponent?.id] || 0;

  return (
    <div className="scoreboard">
      <div className="score-item mine">
        <span className="score-name">Vos</span>
        <span className="score-pts">{myScore}</span>
        <div className="score-bar" style={{ width: `${(myScore / 30) * 100}%` }} />
      </div>
      <div className="score-separator">/ 30</div>
      <div className="score-item theirs">
        <span className="score-name">{opponent?.username || 'Oponente'}</span>
        <span className="score-pts">{oppScore}</span>
        <div className="score-bar" style={{ width: `${(oppScore / 30) * 100}%` }} />
      </div>
    </div>
  );
}
