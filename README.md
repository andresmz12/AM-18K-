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
# Desde la raíz del proyecto
npm install --prefix backend
npm install --prefix frontend
```

### 2. Iniciar el backend (puerto 3000)

```bash
cd backend
npm run dev
# o: node index.js
```

### 3. Iniciar el frontend en modo desarrollo (puerto 5173)

```bash
cd frontend
npm run dev
```

Abre **http://localhost:5173** — el frontend hace proxy de `/api` al backend.

### 4. Build de producción local (opcional)

```bash
npm run build --prefix frontend
node backend/index.js
# Abre http://localhost:3000
```

---

## Deploy en Railway

### Opción A — Railway CLI (recomendado)

```bash
# 1. Instalar Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Crear proyecto nuevo
railway new

# 4. Deploy
railway up
```

### Opción B — GitHub

1. Sube el repo a GitHub
2. En [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Selecciona el repositorio
4. Railway detecta `railway.json` automáticamente y construye todo

### Variables de entorno (Railway)

No se requieren variables de entorno mínimas. Opcionalmente:

| Variable | Descripción         | Default |
|----------|---------------------|---------|
| `PORT`   | Puerto del servidor | `3000`  |

---

## Funcionalidades

- Inventario con búsqueda y filtros por categoría
- Agregar / editar / eliminar productos
- Precio de venta calculado automáticamente (costo × (1 + %ganancia))
- Alertas visuales cuando el stock ≤ stock mínimo
- Dashboard con resumen financiero:
  - Total productos
  - Total invertido (costo × stock)
  - Valor del inventario (precio_venta × stock)
  - Ganancia potencial
  - Productos con stock bajo
- Exportar inventario a CSV (compatible con Excel)

## Categorías

- Oro 18k
- Bisutería
- Accesorios
- Otro
