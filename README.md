# Rusted Ranking Web
Web site of the ranking of Rusted Warfare.

## Deploy en GitHub Pages

Este repositorio ya incluye el workflow `/.github/workflows/deploy-pages.yml` para publicar la carpeta `public/` en GitHub Pages.

### Pasos
1. En GitHub, abrir **Settings → Pages**.
2. En **Build and deployment**, seleccionar **GitHub Actions** como source.
3. Hacer push a `main` (o ejecutar manualmente el workflow **Deploy to GitHub Pages**).
4. Esperar que termine el workflow y abrir la URL de Pages.

## Endpoint de API en Pages

GitHub Pages solo sirve archivos estáticos y no ejecuta `/api/*`.  
Para que la web funcione en Pages, configurá un backend externo (por ejemplo, tu Worker de Cloudflare) y definí su base URL:

- Opción temporal (navegador):  
  `localStorage.setItem('RUSTED_API_BASE', 'https://tu-worker.tu-dominio.com')`
- Opción por script global antes del script principal:  
  `window.RUSTED_API_BASE = 'https://tu-worker.tu-dominio.com'`

La app usará:
- `${RUSTED_API_BASE}/api/ranking`
- `${RUSTED_API_BASE}/api/submit-result`

## Backend (Worker) y JSONBin

- El Worker usa un Bin ID fijo: `6a406783da38895dfe0960ee`.
- Ya no lee `JSONBIN_KEY` como variable de entorno.
