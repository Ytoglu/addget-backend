const jwt  = require('jsonwebtoken');
const pool = require('../config/db');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token gerekli' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [decoded.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });

    if (rows[0].is_banned && rows[0].ban_until > new Date()) {
      return res.status(403).json({
        error: 'Hesap askıya alındı',
        ban_until: rows[0].ban_until,
      });
    }

    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Geçersiz token' });
  }
};
