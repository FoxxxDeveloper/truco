import logoUrl from '../../assets/logo.png';

/**
 * Marca compacta: logo transparente + TrucoFX (Cinzel) + subtítulo opcional.
 * No usar en topbar con panoramicooscuro — solo logo + texto.
 */
export default function BrandNavLockup({
  className = '',
  showSubtitle = true,
  size = 'nav',
}) {
  const sizeClass =
    size === 'auth' ? 'brand-lockup--auth' : size === 'sm' ? 'brand-lockup--sm' : 'brand-lockup--nav';
  return (
    <div className={`brand-lockup ${sizeClass} ${className}`.trim()} role="banner">
      <div className="brand-logo-clean">
        <img src={logoUrl} alt="" className="brand-logo-clean-img" width={48} height={48} decoding="async" />
      </div>
      <div className="brand-text">
        <span className="brand-title">TrucoFX</span>
        {showSubtitle ? <span className="brand-subtitle">Truco Argentino</span> : null}
      </div>
    </div>
  );
}
