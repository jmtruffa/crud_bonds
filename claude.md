# CRUD Bonds JMT - Project Context

## Overview
CRUD application for managing Argentine financial bonds and their cashflow schedules. Built with React 19 + Vite (frontend) and Node.js + Express (backend), backed by PostgreSQL and Google Cloud Storage.

## Architecture

### Backend (`server/`)
- **Entry point**: `server/index.js` - Express app setup, mounts all routes
- **Config**: `server/config/` - Database (db.js), GCS (gcs.js), OpenAI (openai.js)
- **Middleware**: `server/middleware/auth.js` - JWT authentication + `sendError` helper
- **Routes**: `server/routes/` - auth, bonds, cashflows, pdfs, extract, references, admin
- **Services**: `server/services/rag.js` - Embedding-based RAG for PDF text retrieval
- **System prompt**: `server/system_prompt_cashflows.txt` - GPT-4o-mini prompt for cashflow extraction

### Frontend (`src/`)
- **Entry**: `src/index.jsx` → `src/App.jsx` (routes only)
- **Pages**: `src/pages/BondsPage.jsx` - Main bond management view
- **API layer**: `src/api/` - Split by domain:
  - `client.js` - Base HTTP client, token management, auth check
  - `auth.js` - Login
  - `bonds.js` - Bond CRUD
  - `cashflows.js` - Cashflow CRUD + bulk upload
  - `pdfs.js` - PDF upload/list (GCS)
  - `extract.js` - AI cashflow extraction
  - `references.js` - Index types, day count conventions
  - `index.js` - Re-exports all API functions
- **Components**: `src/components/`
  - `PrivateRoute.jsx` - Auth guard
  - `LoginPage.jsx` - Login form
  - `BondList.jsx` - Bond table with search, sort, pagination
  - `BondReadOnlyRow.jsx` - Display row for a bond
  - `BondEditableRow.jsx` - Inline editing row for a bond
  - `CashflowUploader.jsx` - Cashflow table, preload, PDF upload, AI extract
- **Utilities**: `src/utils/`
  - `stringDistance.js` - Levenshtein and Damerau-Levenshtein distance functions
  - `dateHelpers.js` - Date arithmetic for cashflow date generation

## Tech Stack
- **Frontend**: React 19, Vite 6, react-router-dom v7
- **Backend**: Node.js, Express, CommonJS modules
- **Database**: PostgreSQL (remote via ngrok)
- **Storage**: Google Cloud Storage (bucket: `prospectos-outlier`)
- **AI**: OpenAI API (gpt-4o-mini for extraction, text-embedding-3-small for RAG)
- **Auth**: JWT + bcryptjs

## Key Flows

### Bond CRUD
1. User logs in → JWT stored in localStorage
2. BondList loads bonds from GET `/bonds`
3. Inline editing with fuzzy search (Damerau-Levenshtein), sort, pagination

### Cashflow Management
1. CashflowUploader shows cashflow table for selected bond
2. Can preload date templates (monthly, quarterly, semiannual, annual)
3. Validates: rate 0-1, dates ordered, residual never negative, amort sums to 100

### AI Cashflow Extraction
1. Upload bond prospectus PDFs → stored in GCS under `TICKER/` prefix
2. POST `/bonds/:id/extract-cashflows`:
   - Downloads PDFs from GCS
   - Parses text with pdf-parse
   - RAG: chunks text adaptively (max 200 chunks), embeds via text-embedding-3-small, selects top chunks by cosine similarity
   - Sends relevant text + bond metadata + system prompt to GPT-4o-mini
   - Sanitizes & validates AI response (dates, rates, amort)
   - Returns cashflows for user review before saving

## Database Tables
- `bonds` - Bond metadata (ticker, dates, coupon, index, day count conv)
- `bond_cashflows` - Payment schedule (seq, date, rate, amort, residual, amount)
- `index_types` - Reference: index codes (CER, BADLAR, etc.)
- `day_count_convention` - Reference: day count methods
- `users` - Auth: email + password_hash

## Environment Variables (`server/.env`)
- `POSTGRES_HOST/USER/PASSWORD/DB/PORT/SSL` - Database connection
- `JWT_SECRET` - Token signing key
- `OPENAI_API_KEY` - OpenAI API access
- `GCS_BUCKET` - GCS bucket name for PDFs
- `PORT` - Server port (default 4000)
- `NODE_ENV` - Environment mode

## Conventions
- Backend uses CommonJS (`require`/`module.exports`)
- Frontend uses ES modules (`import`/`export`)
- All API routes except `/auth/login` require JWT Bearer token
- Tickers are always uppercased and sanitized
- Cashflow residuals are auto-recalculated after any mutation
- Bond deletion is disabled (use direct DB access)
