import { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical, Volume2, VolumeX, LogOut, Wifi, WifiOff } from 'lucide-react';

export default function GameOptionsMenu({
  soundOn,
  onToggleSound,
  socketLive,
  onAbandon,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) close();
    };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  }, [open, close]);

  return (
    <div className="game-options-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm game-options-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        title="Opciones de partida"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <MoreVertical size={20} strokeWidth={2.25} aria-hidden />
        <span className="sr-only">Opciones</span>
      </button>

      {open && (
        <div className="game-options-dropdown" role="menu">
          <button type="button" className="game-options-item" role="menuitem" onClick={() => onToggleSound()}>
            {soundOn ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
            <span>{soundOn ? 'Desactivar sonido' : 'Activar sonido'}</span>
          </button>

          <div className="game-options-item game-options-item--static" role="presentation">
            {socketLive ? <Wifi size={18} aria-hidden /> : <WifiOff size={18} aria-hidden />}
            <span>{socketLive ? 'Conexión en vivo' : 'Sin conexión'}</span>
          </div>

          <button
            type="button"
            className="game-options-item game-options-item--danger"
            role="menuitem"
            onClick={() => {
              close();
              onAbandon();
            }}
          >
            <LogOut size={18} aria-hidden />
            <span>Abandonar partida</span>
          </button>
        </div>
      )}
    </div>
  );
}
