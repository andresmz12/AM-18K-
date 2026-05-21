# AM 18K — Inventario de Joyería

Aplicación web fullstack para gestionar el inventario de la joyería **AM 18K**.

## Stack

- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express
- **Base de datos:** SQLite con better-sqlite3
- **Deploy:** Railway (un solo servicio)

---

## Correr localmente

### 1. Instalar dependencias

```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Iniciar el backend (puerto 3000)

```bash
node backend/index.js
```

### 3. Iniciar el frontend en modo desarrollo (puerto 5173)

```bash
npm run dev --prefix frontend
```

Abre **http://localhost:5173** — el frontend hace proxy de `/api` al backend.

### 4. Build de producción local

```bash
npm run build --prefix frontend
node backend/index.js
# Abre http://localhost:3000
```

---

## Deploy en Railway

### Opción A — Railway CLI

```bash
npm i -g @railway/cli
railway login
railway new
railway up
```

### Opción B — GitHub

1. Ve a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Selecciona el repositorio `am-18k-`
3. Railway detecta `railway.json` automáticamente

### Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|----------|
| `PORT` | Puerto del servidor | `3000` |

---

## Funcionalidades

- Inventario con búsqueda y filtros por categoría
- Agregar / editar / eliminar productos
- Precio de venta calculado automáticamente
- Alertas visuales cuando stock ≤ stock mínimo
- Dashboard con resumen financiero
- Exportar inventario a CSV (compatible con Excel)
