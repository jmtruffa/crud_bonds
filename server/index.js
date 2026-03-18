require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { printDbConfig } = require('./config/db');
const { printGcsConfig } = require('./config/gcs');
const { printOpenaiConfig } = require('./config/openai');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');

// Routes
const authRoutes = require('./routes/auth');
const bondsRoutes = require('./routes/bonds');
const cashflowsRoutes = require('./routes/cashflows');
const pdfsRoutes = require('./routes/pdfs');
const referencesRoutes = require('./routes/references');
const adminRoutes = require('./routes/admin');
const publicPdfsRoutes = require('./routes/public-pdfs');
const extractFromPdfsRoutes = require('./routes/extractFromPdfs');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Print config on startup
printDbConfig();
console.log(`   PORT: ${process.env.PORT || 4000}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   JWT_SECRET: ${JWT_SECRET === 'dev-secret-change-in-production' ? 'WARNING: using default (set JWT_SECRET env var!)' : 'configured'}`);
printGcsConfig();
printOpenaiConfig();

// SPA static files (must be before protected routes to avoid auth blocking index.html)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Public routes
app.use('/auth', authRoutes);
app.use('/pdfs', publicPdfsRoutes);

// Protected routes
app.use('/bonds', authMiddleware, bondsRoutes);
app.use('/bonds', authMiddleware, cashflowsRoutes);
app.use('/bonds', authMiddleware, pdfsRoutes);
app.use('/', authMiddleware, referencesRoutes);
app.use('/admin', authMiddleware, adminRoutes);
app.use('/extract-from-pdfs', authMiddleware, extractFromPdfsRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
