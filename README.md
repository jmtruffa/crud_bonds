# Outlier Terminal

Sistema para gestión de bonos financieros argentinos, LECAPS y TAMAR, con calculadoras de rendimiento y cronogramas de cashflows.
Stack: React 19 + Vite | Node.js + Express | PostgreSQL | Google Cloud Storage | OpenAI (RAG + GPT-4o-mini) | API BCRA.

---

## Estructura del Proyecto

```
├── index.html                  # SPA entry point
├── package.json                # Frontend deps (React, Vite)
├── vite.config.js              # Dev server (port 3000, proxy → 4000)
├── arranca_crud.sh             # Script de inicio producción
├── claude.md                   # Contexto del proyecto para IA
│
├── src/                        # Frontend (React)
│   ├── index.jsx               # React root + BrowserRouter
│   ├── App.jsx                 # Rutas (login, PrivateRoute → BondsPage)
│   ├── style.css               # Estilos
│   ├── api/                    # Capa HTTP (split por dominio)
│   │   ├── client.js           # request(), token, isAuthenticated
│   │   ├── auth.js             # login()
│   │   ├── bonds.js            # getBonds, createBond, updateBond
│   │   ├── cashflows.js        # CRUD cashflows + bulk upload
│   │   ├── pdfs.js             # uploadBondPdfs, listBondPdfs
│   │   ├── extract.js          # extractCashflowsAI
│   │   ├── references.js       # getIndexes, getDayCountConventions
│   │   ├── calculator.js       # calcYield, calcPrice (servicio externo :8080)
│   │   ├── bcra.js             # getTamarRates (proxy a API BCRA, variable 136)
│   │   └── index.js            # Re-exports todas las funciones API
│   ├── utils/
│   │   ├── stringDistance.js    # Levenshtein y Damerau-Levenshtein para búsqueda fuzzy
│   │   └── dateHelpers.js      # addMonths, toDateStr, generateCashflowDates
│   ├── pages/
│   │   └── BondsPage.jsx       # Página principal: carga bonos, logout, save
│   └── components/
│       ├── PrivateRoute.jsx    # Auth guard (redirect si no autenticado)
│       ├── LoginPage.jsx       # Formulario de login
│       ├── BondList.jsx        # Tabla de bonos (search, sort, pagination, edit)
│       ├── BondReadOnlyRow.jsx # Fila de solo lectura de un bono
│       ├── BondEditableRow.jsx # Fila de edición inline de un bono
│       ├── CashflowUploader.jsx # Tabla cashflows, preload fechas, upload PDF, AI extract
│       ├── BondCalculatorModal.jsx # Calculadora yield/price (servicio externo :8080)
│       ├── LecapCalcModal.jsx  # Calculadora LECAP (TEM ↔ Precio, cálculo local)
│       └── TamarCalcModal.jsx  # Calculadora TAMAR (TEM ↔ Precio, tasas BCRA)
│
├── server/                     # Backend (Node.js + Express)
│   ├── index.js                # Entry point: monta middleware y rutas
│   ├── package.json            # Backend deps
│   ├── .env                    # Variables de entorno (NO commitear)
│   ├── system_prompt_cashflows.txt  # Prompt para extracción AI de cashflows
│   ├── config/
│   │   ├── db.js               # Pool PostgreSQL + SSL
│   │   ├── gcs.js              # Google Cloud Storage bucket
│   │   └── openai.js           # Cliente OpenAI
│   ├── middleware/
│   │   └── auth.js             # JWT auth middleware + sendError helper
│   ├── routes/
│   │   ├── auth.js             # POST /auth/login
│   │   ├── bonds.js            # CRUD /bonds
│   │   ├── cashflows.js        # CRUD /bonds/:id/cashflows + bulk
│   │   ├── pdfs.js             # Upload/list/serve PDFs (GCS)
│   │   ├── extract.js          # POST /bonds/:id/extract-cashflows (AI)
│   │   ├── references.js       # GET /indexes, /day-count-conventions
│   │   ├── calculator.js       # Proxy a servicio de cálculo (:8080)
│   │   ├── bcra.js             # Proxy a API BCRA (tasa TAMAR, cache diario)
│   │   └── admin.js            # DELETE /admin/cleanup-null-cashflows
│   ├── services/
│   │   └── rag.js              # chunkText, cosineSimilarity, batchEmbed, getRelevantChunks
│   └── tests/
│       └── rag.test.js         # Tests unitarios de RAG y validaciones
```

---

## Flujo de la Aplicación

### 1. Autenticación
```
Usuario → LoginPage → POST /auth/login (email + password)
                      → bcrypt.compare → JWT (8h) → localStorage
```

### 2. Gestión de Bonos
```
BondList carga GET /bonds → tabla con búsqueda fuzzy (Damerau-Levenshtein)
  → Sort por ticker/fecha/creación
  → Paginación (20/página)
  → Edición inline → PUT /bonds/:id
  → Crear nuevo / Clonar → POST /bonds
```

### 3. Gestión de Cashflows
```
Click en bono → CashflowUploader → GET /bonds/:id/cashflows
  → Edición inline (rate 0-1, amort, amount)
  → Preload plantilla de fechas (mensual/trimestral/semestral/anual)
  → Residual auto-calculado (empieza en 100, resta amort)
  → Save All → POST /bonds/:id/cashflows/bulk-json
```

### 4. Calculadora de Bonos
```
Click "Calc" en cualquier bono → BondCalculatorModal
  → Modo YIELD: ingresa precio → GET localhost:8080/yield
     → Devuelve: YTM, Modified Duration, Accrual Days, Parity, Residual,
        Accrued Interest, Technical Value, CER usado, etc.
  → Modo PRICE: ingresa tasa → GET localhost:8080/price
     → Devuelve: Price, Modified Duration, métricas extendidas
  → Settlement date: auto T+1 hábil (salta fines de semana)
  → Fees: precargados en 0
  → extendIndex: opcional (tasa anual para extrapolar CER)
```

### 5. Calculadora LECAP
```
Click "Calc" en cualquier LECAP → LecapCalcModal
  → Modo PRECIO → TEM: ingresa precio, calcula TEM, TEA, tasa directa, mod duration
  → Modo TEM → PRECIO: ingresa TEM (%), calcula precio y métricas
  → Cálculo local (no requiere servicio externo)
  → Settlement date: auto T+1 hábil
  → Fórmulas: tasa_directa = vf/precio - 1
              tea = (1 + directa)^(365/diasSettle) - 1
              tem = (1 + directa)^(30/diasSettle) - 1
              modified_duration = diasSettle / (1 + tea)
```

### 6. Calculadora TAMAR
```
Click "Calc" en cualquier TAMAR → TamarCalcModal
  → Descarga tasas TAMAR del BCRA (variable 136, cache 24hs)
  → Calcula TAMAR prom TNA (ventana: date_liq-10biz → hoy-9biz)
  → tamar_tem = ((1 + (prom + spread) * 32/365)^(365/32))^(1/12) - 1
  → vpv = 100 * (1 + tamar_tem)^((days360(liq,vto)/360) * 12)
  → Desde settlement: directa, TNA, TEA, TEM (act y 360), mod duration
  → Modo TEM → PRECIO: ingresa TEM (%), calcula precio
```

### 7. Extracción AI de Cashflows desde PDFs
```
Upload PDFs → POST /bonds/:ticker/pdfs → GCS bucket

Extraer → POST /bonds/:id/extract-cashflows:
  1. Descarga PDFs de GCS
  2. pdf-parse → texto crudo
  3. RAG: chunk adaptivo → embed (text-embedding-3-small) → cosine similarity
     → selecciona chunks más relevantes (max 15K chars/PDF)
  4. GPT-4o-mini: system prompt + texto relevante + metadata bono
     → genera JSON de cashflows
  5. Sanitización: valida fechas, rates, amorts
  6. Devuelve cashflows para revisión del usuario antes de guardar
```

---

## Cómo Correr

### Requisitos
- Node.js 18+
- PostgreSQL 12+ con tablas: `bonds`, `bond_cashflows`, `index_types`, `day_count_convention`, `users`
- (Opcional) Cuenta GCS con bucket configurado
- (Opcional) API key de OpenAI

### Instalación

```bash
git clone <repository-url>
cd crud_bonds_jmt

# Instalar dependencias del frontend
npm install

# Instalar dependencias del backend
cd server
npm install
cd ..
```

### Configuración

Crear `server/.env`:
```env
# Base de datos
POSTGRES_HOST=tu_servidor
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password
POSTGRES_DB=nombre_db
POSTGRES_PORT=5432
POSTGRES_SSL=true

# Servidor
PORT=4000
NODE_ENV=development
JWT_SECRET=un_secreto_largo_y_seguro

# OpenAI (para extracción AI de cashflows)
OPENAI_API_KEY=sk-...

# Google Cloud Storage (para PDFs)
GCS_BUCKET=nombre-del-bucket
```

### Desarrollo

```bash
# Terminal 1 - Backend (con hot reload)
cd server
npm run dev

# Terminal 2 - Frontend (Vite dev server)
npm run dev
```

Frontend: `http://localhost:3000` (proxies API calls al backend en port 4000)

### Producción

```bash
# Build frontend
npm run build

# Iniciar servidor (sirve el build estático + API)
cd server
node index.js
```

O usar el script: `bash arranca_crud.sh`

### Tests

```bash
cd server
node tests/rag.test.js
```

---

## Base de Datos

### `bonds`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | integer (PK) | Manual, MAX(id)+1 |
| ticker | varchar (UNIQUE) | Siempre uppercase |
| issue_date | date | |
| maturity | date | |
| coupon | numeric | 0 a 1 |
| index_type_id | integer (FK) | |
| offset | integer | ≤0 |
| day_count_conv | integer (FK) | |
| active | boolean | |

### `bond_cashflows`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | integer (PK) | Manual, MAX(id)+1 |
| bond_id | integer (FK) | |
| seq | integer | Orden secuencial |
| date | date | Ordenadas cronológicamente |
| rate | numeric | 0 a 1 |
| amort | numeric | Suma total = 100 |
| residual | numeric | Auto-calculado |
| amount | numeric | |

### `users`, `index_types`, `day_count_convention`
Tablas de referencia y autenticación.

---

## API Endpoints

Todos los endpoints (excepto `/auth/login`) requieren header `Authorization: Bearer <JWT>`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Login → JWT |
| GET | `/bonds` | Listar bonos |
| GET | `/bonds/:id` | Obtener bono |
| POST | `/bonds` | Crear bono |
| PUT | `/bonds/:id` | Actualizar bono |
| DELETE | `/bonds/:id` | Deshabilitado (403) |
| GET | `/bonds/:id/cashflows` | Listar cashflows |
| POST | `/bonds/:id/cashflows` | Crear cashflow |
| PUT | `/bonds/:bondId/cashflows/:cfId` | Actualizar cashflow |
| DELETE | `/bonds/:bondId/cashflows/:cfId` | Eliminar cashflow |
| POST | `/bonds/:id/cashflows/bulk-json` | Carga masiva |
| POST | `/bonds/:ticker/pdfs` | Subir PDFs a GCS |
| GET | `/bonds/:ticker/pdfs` | Listar PDFs |
| GET | `/bonds/:ticker/pdfs/:filename` | Descargar PDF |
| POST | `/bonds/:id/extract-cashflows` | Extraer cashflows con AI |
| GET | `/indexes` | Códigos de índices |
| GET | `/day-count-conventions` | Convenciones |
| GET | `/calc/yield` | Proxy → :8080/yield (calc YTM) |
| GET | `/calc/price` | Proxy → :8080/price (calc precio) |
| GET | `/bcra/tamar` | Tasa TAMAR (BCRA var 136, cache 24h) |
| DELETE | `/admin/cleanup-null-cashflows` | Limpiar cashflows nulos |

---

## Tecnologías

- **Frontend:** React 19, Vite 6, react-router-dom v7
- **Backend:** Node.js, Express, CommonJS
- **Database:** PostgreSQL (pg)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Storage:** Google Cloud Storage (@google-cloud/storage)
- **AI:** OpenAI API (gpt-4o-mini + text-embedding-3-small)
- **PDF:** pdf-parse + multer (memory storage)
- **APIs externas:** API BCRA (tasa TAMAR), servicio de cálculo en :8080 (yield/price bonos)
- **Features:** Búsqueda fuzzy Damerau-Levenshtein, edición inline, RAG para PDFs, calculadoras de rendimiento, validaciones financieras
