# Bond Management CRUD System

Sistema CRUD para gestion de bonos financieros y cashflows con React + Node.js + PostgreSQL.

## Quick Start

### Requisitos

- Node.js 16+
- PostgreSQL 12+
- Base de datos configurada con las tablas `bonds`, `bond_cashflows`, `index_types`, `day_count_convention`, `users`

### Instalacion

```bash
git clone <repository-url>
cd crud_bonds

# Instalar dependencias
npm install
cd server
npm install
cd ..
```

### Configuracion

1. Archivo `.env` en raiz (opcional, solo si no usas el proxy de Vite):
```env
VITE_API_BASE_URL=http://localhost:4000
```

2. Archivo `server/.env`:
```env
POSTGRES_HOST=tu_servidor
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password
POSTGRES_DB=nombre_db
POSTGRES_PORT=5432
POSTGRES_SSL=true

PORT=4000
NODE_ENV=development
JWT_SECRET=tu_secreto_jwt
```

### Ejecutar

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend (en raiz)
npm run dev
```

App disponible en: `http://localhost:3000`

---

## Estructura de Base de Datos

### `bonds`
```
id                  | integer (PK)
ticker              | varchar (UNIQUE)
issue_date          | date
maturity            | date
coupon              | numeric (0-1)
index_type_id       | integer (FK)
offset              | integer (<=0)
day_count_conv      | integer (FK)
active              | boolean
created_at/updated_at
```

### `bond_cashflows`
```
id          | integer (PK)
bond_id     | integer (FK)
seq         | integer
date        | date
rate        | numeric (0-1)
amort       | numeric
residual    | numeric (auto-calculado)
amount      | numeric
created_at
```

### `index_types`
```
id      | integer (PK)
code    | varchar (UNIQUE)
name    | varchar
```

### `day_count_convention`
```
id          | integer (PK)
convention  | varchar
```

### `users`
```
id              | serial (PK)
email           | varchar(255) (UNIQUE)
password_hash   | varchar(255)
created_at      | timestamp
```

---

## API Endpoints

### Auth
```
POST   /auth/login             Login (devuelve JWT)
```

### Bonds
```
GET    /bonds              Listar bonos
GET    /bonds/:id          Obtener bono
POST   /bonds              Crear bono
PUT    /bonds/:id          Actualizar bono
DELETE /bonds/:id          Deshabilitado (403)
```

### Cashflows
```
GET    /bonds/:id/cashflows                  Listar cashflows
POST   /bonds/:id/cashflows                  Crear cashflow
PUT    /bonds/:bondId/cashflows/:cfId        Actualizar cashflow
DELETE /bonds/:bondId/cashflows/:cfId        Eliminar cashflow
POST   /bonds/:id/cashflows/bulk-json        Carga masiva
```

### Catalogos
```
GET    /indexes                      Codigos de indices
GET    /day-count-conventions        Convenciones
```

---

## Tecnologias

- **Frontend:** React 19 + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + pg
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Features:** Busqueda fuzzy (Damerau-Levenshtein), edicion inline, validaciones financieras
