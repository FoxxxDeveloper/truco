/**
 * AppHeader — barra global TrucoFX (marca | nav compacto | saldo + menú usuario).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Swords,
  BarChart2,
  BookOpen,
  ChevronDown,
  Coins,
  Wallet,
  ShieldCheck,
  LogOut,
  Users,
  User,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { walletApi, rankingApi, verificationApi } from '../../services/api';
import BrandNavLockup from '../brand/BrandNavLockup';
import NotificationBell from '../social/NotificationBell';
import FriendsList from '../social/FriendsList';
import WalletPanel from '../wallet/WalletPanel';
import TrucoAvatar from '../avatar/TrucoAvatar';

export default function AppHeader({
  privateChatUnread = 0,
  unreadCounts = {},
  onStartChat,
  onChallengeFriend,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [myElo, setMyElo] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [walletInitialTab, setWalletInitialTab] = useState('balance');
  const [identityStatus, setIdentityStatus] = useState(null);
  const balanceRef = useRef(null);
  const profileMenuRef = useRef(null);

  const loadWallet = useCallback(() => {
    walletApi.getBalance().then((r) => setWallet(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    rankingApi.getMe().then((r) => setMyElo(r.data?.elo ?? null)).catch(() => {});
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    verificationApi
      .getStatus()
      .then((r) => setIdentityStatus(r.data?.identity_status ?? null))
      .catch(() => setIdentityStatus(null));
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (balanceRef.current && !balanceRef.current.contains(e.target)) setBalanceOpen(false);
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openWalletTab = (tab) => {
    setWalletInitialTab(tab);
    setShowWallet(true);
    setBalanceOpen(false);
    setProfileMenuOpen(false);
    loadWallet();
  };

  const go = (path) => {
    navigate(path);
    setProfileMenuOpen(false);
    setBalanceOpen(false);
  };

  const available = Math.max(0, parseFloat(wallet?.balance || 0));
  const reserved = Math.max(0, parseFloat(wallet?.reserved || 0));
  const pendingW = Math.max(0, parseFloat(wallet?.pendingWithdrawal || 0));
  const inGame = Math.max(0, reserved - pendingW);

  const showVerificationLink =
    identityStatus === 'unverified' || identityStatus === 'pending' || identityStatus === 'rejected';

  const isAdmin = user?.role === 'admin';

  return (
    <>
      <nav className="app-header" aria-label="Navegación principal">
        <div className="app-header-inner">
          <div className="app-header-left">
            <button type="button" className="app-header-brand-btn" onClick={() => navigate('/lobby')} aria-label="Ir al lobby">
              <BrandNavLockup className="app-header-brand" size="sm" showSubtitle />
            </button>
          </div>

          <div className="app-header-nav-scroll" role="navigation">
            <button type="button" className="app-header-nav-btn app-header-nav-btn--icon" onClick={() => navigate('/torneos')} title="Torneos">
              <Trophy size={17} aria-hidden />
              <span className="app-header-nav-text">Torneos</span>
            </button>
            <button type="button" className="app-header-nav-btn app-header-nav-btn--icon" onClick={() => navigate('/batallas')} title="Batallas">
              <Swords size={17} aria-hidden />
              <span className="app-header-nav-text">Batallas</span>
            </button>
            <button type="button" className="app-header-nav-btn app-header-nav-btn--icon" onClick={() => navigate('/ranking')} title="Ranking">
              <BarChart2 size={17} aria-hidden />
              <span className="app-header-nav-text">Ranking</span>
            </button>
            <Link to="/reglas" className="app-header-nav-btn app-header-nav-btn--icon app-header-nav-btn--ghost" title="Reglas">
              <BookOpen size={17} aria-hidden />
              <span className="app-header-nav-text">Reglas</span>
            </Link>
          </div>

          <div className="app-header-actions app-header-right">
            <div className="app-header-balance-wrap" ref={balanceRef}>
              <button
                type="button"
                className="app-header-balance-chip"
                onClick={() => {
                  setBalanceOpen((o) => !o);
                  setProfileMenuOpen(false);
                  if (!wallet) loadWallet();
                }}
                aria-expanded={balanceOpen}
                title="Saldo"
              >
                <Coins size={16} aria-hidden className="app-header-coins-ic" />
                <span className="app-header-balance-num">{available.toLocaleString('es-AR')}</span>
                <ChevronDown size={13} className={balanceOpen ? 'app-header-chev--open' : ''} aria-hidden />
              </button>
              {balanceOpen && (
                <div className="app-header-balance-dropdown app-header-balance-menu fx-card">
                  <p className="app-header-bd-title">Saldo</p>
                  <div className="app-header-bd-row">
                    <span>Disponible</span>
                    <strong className="app-header-bd-strong">
                      <Coins size={14} aria-hidden /> {available.toLocaleString('es-AR')}
                    </strong>
                  </div>
                  <div className="app-header-bd-row">
                    <span>En juego / bloqueado</span>
                    <strong className="app-header-bd-strong">
                      <Coins size={14} aria-hidden /> {inGame.toLocaleString('es-AR')}
                    </strong>
                  </div>
                  <div className="app-header-bd-row">
                    <span>Pendiente retiro</span>
                    <strong className="app-header-bd-strong">
                      <Coins size={14} aria-hidden /> {pendingW.toLocaleString('es-AR')}
                    </strong>
                  </div>
                  <div className="app-header-bd-actions">
                    <button type="button" className="btn btn-primary btn-sm btn-block" onClick={() => openWalletTab('deposit')}>
                      Cargar saldo
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm btn-block" onClick={() => openWalletTab('withdraw')}>
                      Retirar saldo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <NotificationBell />

            <div className="app-header-profile-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className="app-header-profile-trigger"
                onClick={() => {
                  setProfileMenuOpen((o) => !o);
                  setBalanceOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                aria-haspopup="true"
              >
                <TrucoAvatar username={user?.username} avatar={user?.avatar} size={34} className="app-header-avatar" />
                <span className="app-header-profile-text">
                  <span className="app-header-profile-name">{user?.username}</span>
                  {myElo != null && <span className="app-header-profile-elo">ELO {myElo}</span>}
                </span>
                <ChevronDown size={14} className={profileMenuOpen ? 'app-header-chev--open' : ''} aria-hidden />
              </button>
              {profileMenuOpen && (
                <div className="app-header-profile-menu fx-card" role="menu">
                  <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => go('/profile')}>
                    <User size={16} aria-hidden /> Perfil
                  </button>
                  <button
                    type="button"
                    className="app-header-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShowFriends(true);
                      setProfileMenuOpen(false);
                    }}
                  >
                    <Users size={16} aria-hidden /> Amigos
                    {privateChatUnread > 0 && (
                      <span className="app-header-menu-badge">{privateChatUnread > 99 ? '99+' : privateChatUnread}</span>
                    )}
                  </button>
                  <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => openWalletTab('balance')}>
                    <Wallet size={16} aria-hidden /> Wallet / Saldo
                  </button>
                  <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => openWalletTab('deposit')}>
                    <Coins size={16} aria-hidden /> Cargar saldo
                  </button>
                  <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => openWalletTab('withdraw')}>
                    <Coins size={16} aria-hidden /> Retirar saldo
                  </button>
                  {showVerificationLink && (
                    <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => go('/verification')}>
                      <ShieldCheck size={16} aria-hidden /> Verificación de identidad
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="app-header-menu-item" role="menuitem" onClick={() => go('/admin')}>
                      <Settings size={16} aria-hidden /> Admin
                    </button>
                  )}
                  <div className="app-header-menu-sep" role="presentation" />
                  <button
                    type="button"
                    className="app-header-menu-item app-header-menu-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                  >
                    <LogOut size={16} aria-hidden /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {showFriends && (
          <FriendsList
            onClose={() => setShowFriends(false)}
            onStartChat={(f) => {
              setShowFriends(false);
              onStartChat?.(f);
            }}
            onChallengeFriend={
              onChallengeFriend
                ? (f) => {
                    setShowFriends(false);
                    onChallengeFriend(f);
                  }
                : undefined
            }
            unreadCounts={unreadCounts}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWallet && (
          <WalletPanel
            initialTab={walletInitialTab}
            onClose={() => {
              setShowWallet(false);
              loadWallet();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
