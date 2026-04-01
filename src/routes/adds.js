const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// GET /adds — feed
router.get('/', auth, async (req, res) => {
  const { region, district, category, mode, page=1, limit=20 } = req.query;
  const offset = (page-1)*limit;
  const params = [];
  const conds  = ['a.status != $1'];
  params.push('deleted');

  if (region && region !== 'Tümü')   { params.push(region);   conds.push(`a.region=$${params.length}`); }
  if (district && district !== 'Tümü') { params.push(district); conds.push(`a.district=$${params.length}`); }
  if (category && category !== 'Tümü') { params.push(category); conds.push(`a.category=$${params.length}`); }

  params.push(limit, offset);

  const { rows } = await pool.query(`
    SELECT a.*,
           u.name as owner_name, u.handle as owner_handle,
           u.avatar_url as owner_avatar, u.is_banned as owner_banned,
           COUNT(DISTINCT us.id) as use_count
    FROM adds a
    JOIN users u ON a.owner_id = u.id
    LEFT JOIN uses us ON us.add_id = a.id
    WHERE ${conds.join(' AND ')}
    GROUP BY a.id, u.id
    ORDER BY a.created_at DESC
    LIMIT $${params.length-1} OFFSET $${params.length}
  `, params);

  res.json(rows);
});

// GET /adds/:id — detail
router.get('/:id', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.*,
           u.name as owner_name, u.handle as owner_handle,
           u.avatar_url as owner_avatar, u.is_banned as owner_banned
    FROM adds a JOIN users u ON a.owner_id=u.id
    WHERE a.id=$1
  `, [req.params.id]);

  if (!rows[0]) return res.status(404).json({ error: 'Add bulunamadı' });

  const { rows: uses } = await pool.query(`
    SELECT us.*, u.name as owner_name, u.handle as owner_handle,
           u.avatar_url as owner_avatar, u.is_banned as owner_banned
    FROM uses us JOIN users u ON us.owner_id=u.id
    WHERE us.add_id=$1 ORDER BY us.created_at ASC
  `, [req.params.id]);

  // Add-ups
  for (const use of uses) {
    const { rows: addups } = await pool.query(
      'SELECT * FROM add_ups WHERE use_id=$1 ORDER BY created_at DESC', [use.id]
    );
    use.add_ups = addups;
  }

  const { rows: reviews } = await pool.query(
    'SELECT r.*, u.name as from_name, u.handle as from_handle FROM reviews r JOIN users u ON r.from_id=u.id WHERE r.add_id=$1',
    [req.params.id]
  );

  res.json({ ...rows[0], uses, reviews });
});

// POST /adds — create
router.post('/', auth, upload.array('media', 5), async (req, res) => {
  const { category, title, description, region, district, max_partners, media_requested, latitude, longitude } = req.body;
  const media_urls = req.files?.map(f => f.path) || [];

  const { rows } = await pool.query(`
    INSERT INTO adds (owner_id,category,title,description,region,district,media_urls,media_requested,max_partners,latitude,longitude)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
  `, [req.user.id, category, title, description, region, district,
      media_urls, media_requested==='true', parseInt(max_partners)||1,
      latitude||null, longitude||null]);

  res.status(201).json(rows[0]);
});

// PATCH /adds/:id — update
router.patch('/:id', auth, async (req, res) => {
  const add = (await pool.query('SELECT * FROM adds WHERE id=$1', [req.params.id])).rows[0];
  if (!add) return res.status(404).json({ error: 'Bulunamadı' });
  if (add.owner_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });

  const { title, description, status } = req.body;
  const { rows } = await pool.query(
    'UPDATE adds SET title=COALESCE($1,title), description=COALESCE($2,description), status=COALESCE($3,status) WHERE id=$4 RETURNING *',
    [title, description, status, req.params.id]
  );
  res.json(rows[0]);
});

// POST /adds/:id/select — Got seç
router.post('/:id/select', auth, async (req, res) => {
  const { use_ids } = req.body;
  const add = (await pool.query('SELECT * FROM adds WHERE id=$1', [req.params.id])).rows[0];
  if (!add) return res.status(404).json({ error: 'Bulunamadı' });
  if (add.owner_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
  if (add.status === 'closed') return res.status(400).json({ error: 'Add zaten kapalı' });

  // Use'ları güncelle
  await pool.query(
    `UPDATE uses SET status=CASE WHEN id=ANY($1::uuid[]) THEN 'got' ELSE 'rejected' END WHERE add_id=$2`,
    [use_ids, req.params.id]
  );
  await pool.query('UPDATE adds SET status=$1 WHERE id=$2', ['closed', req.params.id]);
  await pool.query(
    'INSERT INTO selections (add_id, use_ids) VALUES ($1,$2)',
    [req.params.id, use_ids]
  );

  // Bildirimleri gönder
  const { rows: selUses } = await pool.query('SELECT * FROM uses WHERE id=ANY($1::uuid[])', [use_ids]);
  for (const use of selUses) {
    await pool.query(
      `INSERT INTO notifications (user_id,type,title,body,payload)
       VALUES ($1,'got_selected','Teklifin Seçildi! 🎉',$2,$3)`,
      [use.owner_id,
       `${req.user.name} teklifini seçti — Got!`,
       JSON.stringify({ add_id: req.params.id, use_id: use.id })]
    );
  }

  res.json({ success: true });
});

module.exports = router;
