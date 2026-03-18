require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const dbConfig = {
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : undefined
};

const missing = [];
['host', 'user', 'password', 'database', 'port'].forEach(k => {
  if (!dbConfig[k]) missing.push(k);
});
if (missing.length > 0) {
  console.error('Faltan variables de configuración de la DB:', missing.join(', '));
  console.error('Define POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT.');
  process.exit(1);
}

let ssl = false;
if (process.env.POSTGRES_SSL && process.env.POSTGRES_SSL.toLowerCase() === 'true') {
  ssl = { rejectUnauthorized: false };
} else {
  const hostLower = (dbConfig.host || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(hostLower)) {
    ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool({ ...dbConfig, ssl });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

function printDbConfig() {
  console.log('Environment (DB):');
  console.log(`   POSTGRES_HOST: ${dbConfig.host}`);
  console.log(`   POSTGRES_USER: ${dbConfig.user}`);
  console.log(`   POSTGRES_DB: ${dbConfig.database}`);
  console.log(`   POSTGRES_PORT: ${dbConfig.port}`);
  console.log(`   POSTGRES_SSL: ${ssl ? 'enabled' : 'disabled'}`);
}

module.exports = { pool, printDbConfig };
