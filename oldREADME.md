# Instrucciones para la interfaz CRUD (React + PostgreSQL)

Este proyecto se desarrollará en **React** (Vite) y consumirá un servicio/API que opera sobre PostgreSQL. Las tablas ya estarán provistas como réplicas de las originales y llevarán el prefijo `mock_`, por lo que **no es necesario crearlas** (ej.: `mock_bonds`, `mock_cashflows`, etc.).

## Alcance
- Frontend en React para altas, bajas, modificaciones y consultas.
- Conexión a Postgres a través de la API/servicio existente.
- Las tablas vienen prefijadas con `mock_` y se usan tal cual.

## Configuración rápida
1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear un archivo `.env` en la raíz con las variables de entorno para Postgres (user + pass + server) y la base/puerto que corresponda. Ejemplo:
   ```
   VITE_API_BASE_URL=http://localhost:4000
   POSTGRES_HOST=tu_servidor
   POSTGRES_USER=tu_usuario
   POSTGRES_PASSWORD=tu_password
   POSTGRES_DB=tu_base
   POSTGRES_PORT=5432
   ```
   Las variables `POSTGRES_*` las usará el servicio que conecta a Postgres; la app React utilizará `VITE_API_BASE_URL` para llamar a la API.
3. Levantar la app en modo desarrollo:
   ```bash
   npm run dev
   ```

## CRUD esperado
- **Listar** registros desde las tablas `mock_`.
- **Crear** registros nuevos.
- **Actualizar** registros existentes.
- **Eliminar** registros (definir si borrado lógico o físico según la API).

## Notas de base de datos
- No generar migraciones para estas tablas: ya están creadas con el prefijo `mock_`.
- Asegurar que las consultas y escrituras apunten siempre a las tablas `mock_`.

### Tablas disponibles (prefijo `mock_`)
- `mock_bonds`: catálogo de bonos.
  - `ticker` (PK), `name` (opcional), `issue_date`, `maturity`, `coupon`, `index` (identificador del índice), `offset`, `day_count_conv`, timestamps/flags según el esquema provisto.
  - Úsalo para listar, crear y actualizar la metadata del bono.
- `mock_cashflows`: flujos por bono.
  - `ticker` (FK a `mock_bonds`), `seq` (orden), `date`, `rate`, `amort`, `residual`, `amount`.
  - Úsalo para cargar/leer la serie de cupones/amortizaciones de cada bono.
- `mock_indexes`: valores de índices de referencia.
  - Ejemplo de campos habituales: `index` (PK del índice), `date`, `value` (o `rate`), más cualquier metadato que venga en la réplica.
  - Úsalo para obtener el valor del índice referenciado por los bonos (campo `index` en `mock_bonds`).

### Índices de base de datos
- `index_types`:
  - `index_types_pkey` (PK, `id`).
  - `index_types_code_key` (único, `code`).
- `bonds`:
  - `bonds_pkey` (PK, `id`).
  - `bonds_ticker_key` (único, `ticker`).
- `bond_cashflows`:
  - `bond_cashflows_pkey` (PK, `id`).
  - `bond_cashflows_bond_id_seq_` (`bond_id, seq`).

## Buenas prácticas recomendadas
- Validar datos tanto en cliente (React) como en el servicio/API.
- Centralizar la URL base de la API en `VITE_API_BASE_URL`.
- Manejar errores y estados de carga en la UI (spinners, toasts, mensajes claros).

## Warnings
- tasa entre [0,1]
- amort de toda seq tendria que sumar 100
- residual tiene q llegar a 0
- maturity auqn sea 1 dia posterior a issue date
- indextype valide contra indice y null
- offset <=0  y no puede ser punto flotante
- day count valide contra day_count_convention

- ver de que las variables de entorno esten bien seteadas en formato una por una 
- chequear fechas entre cashflows que en cada secuencia la fecha sea mayor a la anterior por al menos un dia
- que insertar un cashflow tenga el mismo formato de tabla que como se muestra en la vista de cashflows asi es mas comodo para el usuario
- fijarse que al editar un bono el name y la fecha no se toman y deberian (es decir se resetean a vacio cuando no deberian)
- que los cashflows se muestren ordenadas por fecha en vez de por secuencia (deberia dar el mismo resultado pero ayuda a spotear errores)
- agregar buscador por ticker en la vista de bonos
- agregar paginacion en la vista de bonos si hay mas de X bonos (ej20)
- que los cashflows que ya esten tmb se puedan editar y que al guardar se manden todos a la base de datos (actualmente solo se pueden agregar nuevos)