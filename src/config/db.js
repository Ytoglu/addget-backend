const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => console.log('✅ PostgreSQL bağlantısı kuruldu'));
pool.on('error', (err) => console.error('❌ PostgreSQL hatası:', err));

module.exports = pool;
