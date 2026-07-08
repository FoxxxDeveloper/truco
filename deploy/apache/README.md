# Apache — trucofx.com (producción raíz)

## Archivos

| Archivo | Uso |
|---------|-----|
| `trucofx.com.conf` | HTTP → HTTPS + redirect www |
| `trucofx.com-le-ssl.conf` | HTTPS: React en `/` + proxy `/api`, `/socket.io`, `/uploads` |

## Instalar

```bash
sudo cp trucofx.com.conf /etc/httpd/conf.d/trucofx.com.conf
sudo cp trucofx.com-le-ssl.conf /etc/httpd/conf.d/trucofx.com-le-ssl.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

Módulos necesarios: `proxy`, `proxy_http`, `proxy_wstunnel`, `rewrite`, `ssl`

```bash
sudo httpd -M | grep -E 'proxy|rewrite|ssl'
```

## Rutas

| URL | Destino |
|-----|---------|
| `/` | React SPA (`front/dist` + `deploy/root/.htaccess`) |
| `/test/*` | 301 → `https://trucofx.com/*` |
| `/api/*` | `http://127.0.0.1:5129/api/*` |
| `/socket.io/*` | WebSocket / polling → Node 5129 |
| `/uploads/*` | `http://127.0.0.1:5129/uploads/*` |
| `/sounds/*`, `/cartas-webp/*` | Archivos estáticos en DocumentRoot |

`PORT` en `back/.env` debe coincidir con el proxy (ej. `5129`).

## Pruebas

```bash
curl -s https://trucofx.com/api/health
curl -s "https://trucofx.com/socket.io/?EIO=4&transport=polling" | head -c 100
curl -sI https://trucofx.com/lobby
curl -sI https://trucofx.com/test
```

## Logs

```bash
sudo tail -f /var/log/httpd/trucofx.com_error.log
pm2 logs truco-api
```

Ver guía completa: [`../DEPLOY.md`](../DEPLOY.md)
