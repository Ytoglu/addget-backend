require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');
const pool       = require('./config/db');
const fs         = require('fs');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.set('io', io);

// Routes
app.use('/auth',     require('./routes/auth'));
app.use('/adds',     require('./routes/adds'));
app.use('/uses',     require('./routes/uses'));
app.use('/reviews',  require('./routes/reviews'));
app.use('/messages', require('./routes/messages'));
app.use('/users',    require('./routes/users'));

// Socket
require('./socket')(io);

// Health check
app.get('/', (req, res) => res.json({ status: 'Addget API v2 🚀', time: new Date() }));

// DB init
async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'models/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✅ Veritabanı şeması hazır');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🚀 Addget API v2 → http://localhost:${PORT}`);
  await initDB();
});
