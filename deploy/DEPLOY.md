# Deploy TrucoFX — producción (trucofx.com)

App en **raíz** del dominio (`https://trucofx.com/`), no en `/test`.

## 1. Variables de entorno

### Backend (`back/.env` en servidor)

```env
NODE_ENV=production
PORT=5129
RANKED_ENABLED=false
CLIENT_ORIGIN=https://trucofx.com,https://www.trucofx.com
FRONTEND_URL=https://trucofx.com
# … DB, JWT, Redis, etc.
```

### Frontend (local, antes del build)

`front/.env.production` (ver `front/.env.production.example`):

```env
VITE_APP_BASE=/
VITE_API_URL=https://trucofx.com/api
VITE_SOCKET_URL=https://trucofx.com
VITE_RANKED_ENABLED=false
```

## 2. Build frontend

```bash
cd front
npm ci
npm run build
```

Salida: `front/dist/`

Opcional OG social: copiar una imagen `og-image.jpg` (1200×630) a `front/public/` y rebuild.

## 3. Subir al servidor

DocumentRoot: `/var/www/html/trucofx.com/`

```bash
# Ejemplo (ajustar usuario/host)
rsync -av --delete front/dist/ user@servidor:/var/www/html/trucofx.com/
rsync -av front/public/sounds/ user@servidor:/var/www/html/trucofx.com/sounds/
rsync -av front/public/cartas-webp/ user@servidor:/var/www/html/trucofx.com/cartas-webp/
scp deploy/root/.htaccess user@servidor:/var/www/html/trucofx.com/.htaccess
```

Incluidos en `dist` vía build: `robots.txt`, `sitemap.xml`, `site.webmanifest`, `favicon.svg`.

## 4. Apache

```bash
sudo cp deploy/apache/trucofx.com.conf /etc/httpd/conf.d/trucofx.com.conf
sudo cp deploy/apache/trucofx.com-le-ssl.conf /etc/httpd/conf.d/trucofx.com-le-ssl.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

## 5. API (PM2)

```bash
cd /ruta/al/back
npm ci --omit=dev
pm2 restart truco-api --update-env
pm2 logs truco-api --lines 50
```

## 6. Smoke tests

```bash
curl -s https://trucofx.com/api/health
curl -sI https://trucofx.com/ | head -5
curl -s "https://trucofx.com/socket.io/?EIO=4&transport=polling" | head -c 80
curl -s https://trucofx.com/robots.txt
curl -sI https://trucofx.com/reglas | head -3
```

En navegador:

1. `https://trucofx.com/` → login/lobby  
2. Buscar partida casual  
3. Refresh en `/game` (no 404)  
4. `https://trucofx.com/test` → redirige a `/`  

## 7. SEO

- `robots.txt` y `sitemap.xml` en la raíz del sitio  
- Registrar sitemap en Google Search Console  
- `/test` redirige 301 a raíz (Apache + `.htaccess`)

## 8. Reactivar Ranking (futuro)

```env
RANKED_ENABLED=true
VITE_RANKED_ENABLED=true
```

Rebuild front + restart API.
