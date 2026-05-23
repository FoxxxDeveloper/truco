import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = env.VITE_APP_BASE || '/'
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
  const isTestDeploy = base.replace(/\/$/, '') === '/test'
  const buildVersion =
    env.VITE_BUILD_VERSION ||
    `${mode}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`

  return {
    base,
    define: {
      'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      ...(isTestDeploy
        ? [{
            name: 'html-noindex-test',
            transformIndexHtml(html) {
              if (html.includes('noindex')) return html
              return html.replace(
                '</head>',
                '    <meta name="robots" content="noindex,nofollow" />\n  </head>',
              )
            },
          }]
        : []),
    ],
    optimizeDeps: {
      include: ['@dicebear/core', '@dicebear/avataaars'],
    },
  }
})
