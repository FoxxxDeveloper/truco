# Auditoría pre-producción TrucoFX — `/test` + SEO

**Fecha:** 2026-05-20  
**Dominio:** https://trucofx.com  
**App de prueba:** https://trucofx.com/test  
**Landing raíz:** https://trucofx.com/ (Próximamente — no reemplazar)

---

## 1. ¿Listo para test cerrado con amigos?

**Parcial → Sí, con checklist de servidor**

El código soporta build en `/test/`, rutas SPA, assets con base, CORS por `CLIENT_ORIGIN`, seguridad base (helmet, rate limits, JWT, `getPlayerView`, errores sin stack en prod). Falta **configurar en el servidor** (no está en este repo): `.env` real, PM2, proxy Apache `/api` + `/socket.io`, copiar `dist` a `/var/www/html/trucofx.com/test`, `robots.txt` en raíz, backup DB.

---

## 2. ¿Listo para lanzamiento público masivo?

**No / Parcial**

Razones: partidas en **memoria + Redis opcional** (un proceso PM2), sin CDN, sin sticky/cluster documentado, wallet/telegram en prod, índices DB recién reforzados en `partidas`, sin monitoreo/alertas/backups automatizados documentados en repo.

---

## 3. Riesgos críticos antes de público

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| PM2 cluster con estado en memoria | Crítico | **1 instancia fork** (aplicado en `ecosystem.config.js`) |
| `JWT_SECRET` por defecto en ecosystem | Crítico | Variables en servidor / `pm2 set`, nunca commitear |
| `/test` indexable por Google | Medio | `robots.txt` Disallow `/test` + `noindex` en build `/test` |
| Sin proxy `/api` → front llama mal | Crítico | Apache `deploy/apache/api-and-socket.conf.example` |
| Partidas colgadas | Alto | `STALE_ACTIVE_PARTIDA_MINUTES`, cron/admin `cleanup-stale` |
| CORS abierto en dev only | OK en prod si `NODE_ENV=production` | `CLIENT_ORIGIN` apex + www |
| Escalado horizontal | Alto | Requiere Redis obligatorio + sticky sessions o refactor estado |

---

## 4. Seguridad

### OK (revisado en código)

- Contraseñas: `bcryptjs` (12 rounds en admin, modelo User con salt)
- JWT en socket y REST; errores operacionales sin stack al cliente en prod
- `helmet`, rate limit global + auth (login/register) + battles/tournaments
- Body limit 10kb JSON
- Queries parametrizadas (`query()` con placeholders)
- `getPlayerView`: mano propia + `opponentCardCount`, no mano rival
- `socketWrap`, validación `isValidRoomId`, `isValidCardId`
- Admin routes con middleware de rol

### Faltantes (configuración servidor, no código)

- Rotar `JWT_SECRET` / DB password en producción
- `CLIENT_ORIGIN=https://trucofx.com,https://www.trucofx.com`
- SSL + HSTS en Apache
- Backups DB programados
- Revisar logs PM2 no incluyan tokens (morgan no debería loguear Authorization si no se configura)

### Cambios aplicados en repo

- PM2: `instances: 1`, `exec_mode: 'fork'`
- Frontend: base `/test/`, `publicPath` para sonidos/cartas
- Índices `partidas` en migración
- Plantillas `deploy/`, `.env.example`

---

## 5. Escalabilidad

| Aspecto | Estimación |
|---------|------------|
| Usuarios concurrentes cómodos (1 proceso, 2GB VPS) | ~30–80 conectados, ~15–30 partidas activas |
| Cuello de botella #1 | Map `games` en RAM por proceso |
| Cuello #2 | Socket.IO + MySQL en mismo host |
| Cuello #3 | Sin Redis → reconexión tras restart pierde estado en RAM |
| PM2 cluster | **No usar** sin sticky + estado centralizado |

**Recomendación lanzamiento chico:** 1 instancia PM2, `REDIS_URL` activo, monitorear `pm2 monit` y RAM.

---

## 6. SEO

| Archivo | Ubicación | Acción |
|---------|-----------|--------|
| `robots.txt` | `deploy/seo/robots.txt` | Copiar a `/var/www/html/trucofx.com/robots.txt` |
| `sitemap.xml` | `deploy/seo/sitemap.xml` | Solo `https://trucofx.com/` |
| `site.webmanifest` | `deploy/seo/site.webmanifest` | Raíz landing |
| Meta OG/Twitter | `deploy/seo/landing-index-head-snippet.html` | Pegar en `<head>` landing Próximamente |
| `/test` noindex | Build con `VITE_APP_BASE=/test/` | Meta `noindex,nofollow` inyectada en `vite.config.js` |

**og-image.jpg:** debe existir en raíz del servidor (no generado en repo).

---

## 7. Deploy `/test`

| Cambio | Archivo |
|--------|---------|
| `base: '/test/'` vía `VITE_APP_BASE` | `front/vite.config.js` |
| `BrowserRouter basename` | `front/src/App.jsx` |
| Assets `/sounds`, `/cartas` | `publicPath.js`, `soundManager.js`, `Card.jsx`, `Lobby.jsx` |
| 401 redirect | `front/src/services/api.js` |
| Apache SPA | `deploy/test/.htaccess` → copiar junto al build |
| API ejemplo | `deploy/apache/api-and-socket.conf.example` |

### Estructura servidor

```
/var/www/html/trucofx.com/
  index.html          ← landing Próximamente (intacta)
  robots.txt          ← desde deploy/seo
  sitemap.xml
  site.webmanifest
  test/
    index.html        ← npm run build (front/dist/*)
    assets/
    sounds/
    cartas/
    .htaccess         ← deploy/test/.htaccess
```

### Build local

```bash
cd front
cp .env.production.example .env.production   # editar si hace falta
npm run build
# Subir contenido de front/dist/ a .../trucofx.com/test/
# Copiar deploy/test/.htaccess al mismo directorio
```

---

## 8. Estabilidad de partidas (revisión código)

| Comportamiento | Estado |
|----------------|--------|
| `staleGameCleanup` + deadlines DB | Implementado |
| AFK 3 acciones | Revisar en `gameHandler` (regla existente) |
| Desconexión / doble desconexión | `staleGameCleanup` + hooks lifecycle |
| `getPlayerView` oculta cartas rival | OK |
| Idempotencia settle/finish | Patrones en servicios (verificar en smoke test) |

**Smoke test obligatorio en servidor:** partida completa, refresh `/test/game`, torneo check-in, admin resolve.

---

## 9. Archivos tocados (esta auditoría)

- `front/vite.config.js`, `App.jsx`, `api.js`, `publicPath.js`, `soundManager.js`, `Card.jsx`, `Lobby.jsx`
- `front/.env.example`, `front/.env.production.example`
- `back/ecosystem.config.js`, `back/.env.example`, `back/src/config/migrate.js`
- `deploy/test/.htaccess`, `deploy/seo/*`, `deploy/apache/api-and-socket.conf.example`
- `docs/PRE-PRODUCTION-AUDIT.md`

---

## 10. Checklist manual final (servidor)

- [ ] Backup DB antes de migrar
- [ ] `npm run db:migrate` en back
- [ ] `.env` back con secretos fuertes y `CLIENT_ORIGIN`
- [ ] PM2 (desde `back/`, usa `.env` — no secretos en ecosystem):
  ```bash
  cd /var/www/html/trucofx.com/back   # ruta real en servidor
  mkdir -p logs
  pm2 start ecosystem.config.js --env production
  pm2 save
  # Tras editar .env:
  pm2 restart truco-api --update-env
  pm2 logs truco-api
  ```
- [ ] Apache proxy al `PORT` de `.env` (ej. **5129**, no 3001)
- [ ] Apache: `apachectl configtest` + reload
- [ ] Proxy `/api` y `/socket.io` al puerto Node
- [ ] Build front con `VITE_APP_BASE=/test/` → subir a `/test/`
- [ ] `.htaccess` en `/test/`, `AllowOverride All`
- [ ] `robots.txt` + sitemap en raíz; landing meta OG
- [ ] `/` sigue Próximamente
- [ ] `/test` carga, login, socket, sala, partida, torneo
- [ ] Refresh `/test/game` → 200 (no 404)
- [ ] Google: `/test` noindex + Disallow
