# AuraSistems — Inventario de Joyería

Aplicación web fullstack para gestionar el inventario de la joyería **AuraSistems**.

## Stack

- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL (driver `pg`)
- **Deploy:** Railway (un solo servicio)

---

## Correr localmente

### 1. Instalar dependencias

```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configurar la base de datos

Necesitas una instancia de PostgreSQL accesible (local o remota) y exportar su
cadena de conexión antes de iniciar el backend:

```bash
export DATABASE_URL="postgres://usuario:password@localhost:5432/aurasistems"
```

Sin `DATABASE_URL`, el backend intenta conectarse sin SSL a esa misma URL; la
primera vez que arranca crea automáticamente las tablas necesarias.

### 3. Iniciar el backend (puerto 3000)

```bash
node backend/index.js
```

### 4. Iniciar el frontend en modo desarrollo (puerto 5173)

```bash
npm run dev --prefix frontend
```

Abre **http://localhost:5173** — el frontend hace proxy de `/api` al backend.

### 5. Build de producción local

```bash
npm run build --prefix frontend
node backend/index.js
# Abre http://localhost:3000
```

### 6. Crear el primer usuario superadmin (opcional)

Para acceder al panel de plataforma (gestión de joyerías clientes) se necesita
una cuenta `superadmin`, que solo se crea desde este script:

```bash
node backend/scripts/create-superadmin.js "Nombre" correo@ejemplo.com contraseña
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
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | — (requerida) |

Railway provisiona `DATABASE_URL` automáticamente al agregar un servicio de
PostgreSQL al proyecto. El secreto usado para firmar JWT se genera y persiste
solo en la base de datos, así que no hace falta configurarlo aparte.

---

## Funcionalidades

- Multi-empresa: cada joyería cliente tiene su propio inventario, usuarios y datos
- Roles: superadmin (plataforma), gerente y empleado, cada uno con permisos distintos
- Inventario con fotos, búsqueda y filtros por categoría
- Precio de venta y ganancia calculados automáticamente
- Alertas visuales cuando stock ≤ stock mínimo
- Registro de ventas individuales y kits armados
- Cotizador con guardado e impresión de cotizaciones
- Cuentas por cobrar con abonos
- Cierre de caja diario
- Gastos del negocio
- Dashboard con gráficos (ventas por día, por categoría, top productos)
- Reportes exportables en Excel y PDF
- Exportar inventario a CSV (compatible con Excel)
- Landing page pública de marketing
