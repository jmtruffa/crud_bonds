Bond Management CRUD System
Sistema CRUD para gestión de bonos financieros y cashflows con React + Node.js + PostgreSQL.

🚀 Quick Start
Requisitos

Node.js 16+
PostgreSQL 12+
Base de datos configurada con tablas mock_*

Instalación
```bash
git clone <repository-url>
cd crud_bonds

# Instalar dependencias
npm install
cd server
npm install
cd ..

Configuración
1. Archivo .env en raíz:
envVITE_API_BASE_URL=http://localhost:4000
2. Archivo server/.env:
envPOSTGRES_HOST=tu_servidor
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password
POSTGRES_DB=nombre_db
POSTGRES_PORT=5432
POSTGRES_SSL=true

PORT=4000
NODE_ENV=development
Ejecutar
bash# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend (en raíz)
cd crud_bonds
npm run start
```

App disponible en: `http://localhost:5173`

---

## 📊 Estructura de Base de Datos

### `mock_bonds`
```
id                  | integer (PK)
ticker              | varchar (UNIQUE)
issue_date          | date
maturity            | date
coupon              | numeric (0-1)
index_type_id       | integer (FK)
offset              | integer (≤0)
day_count_conv      | integer (FK)
active              | boolean
created_at/updated_at
```

### `mock_bond_cashflows`
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

### `mock_index_types`
```
id      | integer (PK)
code    | varchar (UNIQUE)
name    | varchar
```

### `mock_day_count_convention`
```
id          | integer (PK)
convention  | varchar
```

---

## 🔌 API Endpoints

### Bonds
```
GET    /bonds              Listar bonos
GET    /bonds/:id          Obtener bono
POST   /bonds              Crear bono
PUT    /bonds/:id          Actualizar bono
DELETE /bonds/:id          Eliminar bono
```

### Cashflows
```
GET    /bonds/:id/cashflows                  Listar cashflows
POST   /bonds/:id/cashflows                  Crear cashflow
PUT    /bonds/:bondId/cashflows/:cfId        Actualizar cashflow
DELETE /bonds/:bondId/cashflows/:cfId        Eliminar cashflow
POST   /bonds/:id/cashflows/bulk-json        Carga masiva
```

### Catálogos
```
GET    /indexes                      Códigos de índices
GET    /day-count-conventions        Convenciones

✨ Funcionalidades
Bonos

✅ Crear/editar/clonar/eliminar bonos
✅ Búsqueda fuzzy por ticker (tolerante a errores)
✅ Ordenamiento por ticker/fecha/creación
✅ Paginación automática (20 bonos/página)

Cashflows

✅ Agregar/editar/eliminar cashflows inline
✅ Cálculo automático de residuales
✅ Validación de fechas secuenciales
✅ Control de amortizaciones (suma = 100)


⚠️ Validaciones
Bonos

Maturity > Issue Date (≥1 día)
Coupon: 0-1
Offset: ≤0 (entero)
Ticker: único

Cashflows

Date: ≥ cashflow anterior + 1 día
Rate: 0-1
Amort: Σ total = 100
Residual: nunca negativo, final = 0
Solo agregar al final (no insertar entre existentes)


🛠️ Tecnologías
Frontend: React 18 + Vite
Backend: Node.js + Express
Database: PostgreSQL + pg
Features: Búsqueda fuzzy (Damerau-Levenshtein), edición inline, validaciones financieras

📝 Notas Técnicas

IDs: Generados con LOCK TABLE + MAX(id)+1 (sin secuencias PG)
Transacciones: Operaciones atómicas con BEGIN/COMMIT/ROLLBACK
SSL: Auto-detectado para hosts remotos
Residuales: Recalculados automáticamente en cada operación