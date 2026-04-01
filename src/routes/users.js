const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { BAN_CONFIG } = require('../middleware/banEngine');

// GET /users/:id — profil
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Bulunamadı' });

  const reviews = await pool.query('SELECT rating FROM reviews WHERE to_id=$1', [req.params.id]);
  const total   = reviews.rows.length;
  const neg     = reviews.rows.filter(r => r.rating <= BAN_CONFIG.NEG_STARS).length;

  const user = { ...rows[0], trust: {
    total, negCount: neg,
    negPct: total ? neg/total : 0,
    needsMore: Math.max(0, BAN_CONFIG.MIN_REVIEWS-total),
    status: rows[0].is_banned ? 'banned' : (total>=BAN_CONFIG.MIN_REVIEWS && neg/total>0.14) ? 'warning' : 'ok',
  }};

  res.json(user);
});

// PATCH /users/me — profil güncelle
router.patch('/me', auth, upload.single('avatar'), async (req, res) => {
  const { name, handle, region, district, bio, push_token } = req.body;
  const avatar_url = req.file?.path;

  const { rows } = await pool.query(`
    UPDATE users SET
      name       = COALESCE($1, name),
      handle     = COALESCE($2, handle),
      region     = COALESCE($3, region),
      district   = COALESCE($4, district),
      bio        = COALESCE($5, bio),
      push_token = COALESCE($6, push_token),
      avatar_url = COALESCE($7, avatar_url)
    WHERE id=$8 RETURNING *
  `, [name, handle, region, district, bio, push_token, avatar_url, req.user.id]);

  res.json(rows[0]);
});

// GET /users/me/notifications
router.get('/me/notifications', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
});

// PATCH /users/me/notifications/read
router.patch('/me/notifications/read', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ success: true });
});

module.exports = router;
