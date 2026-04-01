const router    = require('express').Router();
const pool      = require('../config/db');
const auth      = require('../middleware/auth');
const { checkAndApplyBan } = require('../middleware/banEngine');

// POST /reviews
router.post('/', auth, async (req, res) => {
  const { add_id, use_id, to_id, role, rating, comment } = req.body;

  const exists = await pool.query(
    'SELECT id FROM reviews WHERE add_id=$1 AND use_id=$2 AND from_id=$3',
    [add_id, use_id, req.user.id]
  );
  if (exists.rows[0]) return res.status(400).json({ error: 'Zaten değerlendirdin' });

  const { rows } = await pool.query(`
    INSERT INTO reviews (add_id,use_id,from_id,to_id,role,rating,comment)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [add_id, use_id, req.user.id, to_id, role, rating, comment]);

  // Ban kontrolü
  const banResult = await checkAndApplyBan(to_id);

  // Değerlendirilen kişiye bildirim
  await pool.query(
    `INSERT INTO notifications (user_id,type,title,body,payload)
     VALUES ($1,'review_received','Yeni Değerlendirme',$2,$3)`,
    [to_id,
     `${req.user.name} seni ${rating} yıldızla değerlendirdi`,
     JSON.stringify({ add_id, use_id, rating })]
  );

  res.status(201).json({ review: rows[0], banResult });
});

// GET /reviews/user/:userId
router.get('/user/:userId', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.*, u.name as from_name, u.handle as from_handle,
           a.title as add_title, a.category as add_category
    FROM reviews r
    JOIN users u ON r.from_id=u.id
    JOIN adds a ON r.add_id=a.id
    WHERE r.to_id=$1
    ORDER BY r.created_at DESC
  `, [req.params.userId]);

  const asWorker    = rows.filter(r => r.role==='add_owner');
  const asRequester = rows.filter(r => r.role==='use_owner');
  const workerAvg   = asWorker.length    ? (asWorker.reduce((s,r)=>s+r.rating,0)/asWorker.length).toFixed(1)    : null;
  const reqAvg      = asRequester.length ? (asRequester.reduce((s,r)=>s+r.rating,0)/asRequester.length).toFixed(1) : null;

  res.json({ asWorker, asRequester, workerAvg, reqAvg, total: rows.length });
});

module.exports = router;
