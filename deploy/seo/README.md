# SEO — TrucoFX producción

## Archivos en el sitio (vía build `front/public/`)

| Archivo | Propósito |
|---------|-----------|
| `robots.txt` | Indexación; bloquea `/api`, `/game`, `/lobby` privados |
| `sitemap.xml` | URLs públicas para Search Console |
| `site.webmanifest` | PWA / móvil |
| `index.html` meta | OG, Twitter, JSON-LD (en `front/index.html`) |

Copias de referencia en `deploy/seo/` (sincronizar si se editan solo ahí).

## Open Graph

Meta apunta a `https://trucofx.com/og-image.jpg`.

Antes del build, opcional:

```bash
# Imagen 1200×630 (logo o captura de mesa)
cp tu-og-image.jpg front/public/og-image.jpg
```

Sin `og-image.jpg`, redes usan fallback; el resto del SEO funciona igual.

## Google Search Console

1. Verificar dominio `trucofx.com`
2. Enviar sitemap: `https://trucofx.com/sitemap.xml`
3. Comprobar que `/test` redirige 301 a `/`

## No indexar (automático)

- Build con `VITE_APP_BASE=/test/` → plugin Vite inyecta `noindex` (solo staging)
- Producción con `VITE_APP_BASE=/` → **index,follow** en `index.html`
