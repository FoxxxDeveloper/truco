# Apache — trucofx.com

## Archivos

| Archivo | Uso |
|---------|-----|
| `trucofx.com.conf` | HTTP → HTTPS + redirect www |
| `trucofx.com-le-ssl.conf` | HTTPS: estáticos + proxy `/api` y `/socket.io` → `127.0.0.1:5129` |

## Instalar en el servidor

```bash
sudo cp trucofx.com.conf /etc/httpd/conf.d/trucofx.com.conf
sudo cp trucofx.com-le-ssl.conf /etc/httpd/conf.d/trucofx.com-le-ssl.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

Si `configtest` falla por `RewriteRule [P]`, habilitar:

```bash
# En RHEL/CentOS suele venir con httpd:
sudo httpd -M | grep proxy_wstunnel
```

## Rutas

| URL | Destino |
|-----|---------|
| `/` | Landing Próximamente (DocumentRoot) |
| `/test/` | React + `deploy/test/.htaccess` |
| `/api/*` | `http://127.0.0.1:5129/api/*` |
| `/socket.io/*` | WebSocket `ws://127.0.0.1:5129` o polling `http://` (Rewrite) |
| `/uploads/*` | `http://127.0.0.1:5129/uploads/*` |

`PORT` en `back/.env` debe coincidir con el proxy (5129).

## Pruebas obligatorias

```bash
# 1) Node directo
curl -i "http://127.0.0.1:5129/socket.io/?EIO=4&transport=polling"

# 2) Por Apache HTTPS
curl -i "https://trucofx.com/socket.io/?EIO=4&transport=polling"

# 3) Health API (debe ser TrucoFX, no foxinmo)
curl -s https://trucofx.com/api/health

# 4) configtest
sudo apachectl configtest
```

Respuesta esperada polling: `0{"sid":"...","upgrades":["websocket"],...}`

## Socket.IO en el vhost

- **No** mezclar `ProxyPass /socket.io` con `RewriteRule [P]` para el mismo path.
- WebSocket: `Upgrade: websocket` → `ws://127.0.0.1:5129/socket.io/...`
- Polling: sin Upgrade → `http://127.0.0.1:5129/socket.io/...`

## Logs si falla

```bash
sudo tail -f /var/log/httpd/trucofx.com_error.log
sudo tail -f /var/log/httpd/error_log
pm2 logs truco-api
```
