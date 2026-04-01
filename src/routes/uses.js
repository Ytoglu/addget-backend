const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// POST /uses — use ekle
router.post('/', auth, upload.array('media', 5), async (req, res) => {
  const { add_id, relation_group, use_label, title, description, external_link } = req.body;
  const media_urls = req.files?.map(f => f.path) || [];

  // Add var mı ve açık mı?
  const add = (await pool.query('SELECT * FROM adds WHERE id=$1', [add_id])).rows[0];
  if (!add) return res.status(404).json({ error: 'Add bulunamadı' });
  if (add.status === 'closed') return res.status(400).json({ error: 'Add kapalı' });

  const { rows } = await pool.query(`
    INSERT INTO uses (add_id,owner_id,relation_group,use_label,title,description,media_urls,external_link)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [add_id, req.user.id, relation_group||'direct', use_label, title, description, media_urls, external_link||null]);

  // Add sahibine bildirim
  if (add.owner_id !== req.user.id) {
    await pool.query(
      `INSERT INTO notifications (user_id,type,title,body,payload)
       VALUES ($1,'use_received','Yeni Teklif!',$2,$3)`,
      [add.owner_id,
       `${req.user.name} add'ine teklif verdi`,
       JSON.stringify({ add_id, use_id: rows[0].id, relation_group: relation_group||'direct' })]
    );
  }

  res.status(201).json(rows[0]);
});

// POST /uses/:id/addups — add-up ekle (not, link, fotoğraf, güncelleme)
router.post('/:id/addups', auth, upload.single('media'), async (req, res) => {
  const { type, content } = req.body;
  const use = (await pool.query('SELECT * FROM uses WHERE id=$1', [req.params.id])).rows[0];
  if (!use) return res.status(404).json({ error: 'Use bulunamadı' });
  if (use.owner_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });

  const media_url = req.file?.path || null;
  const { rows } = await pool.query(
    'INSERT INTO add_ups (use_id,type,content,media_url) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, type, content, media_url]
  );

  // Add sahibine bildirim
  const add = (await pool.query('SELECT * FROM adds WHERE id=$1', [use.add_id])).rows[0];
  if (add && add.owner_id !== req.user.id) {
    const typeLabels = { note:'not','link':'link', photo:'fotoğraf', update:'güncelleme' };
    await pool.query(
      `INSERT INTO notifications (user_id,type,title,body,payload)
       VALUES ($1,'addup_received','Use Güncellendi',$2,$3)`,
      [add.owner_id,
       `${req.user.name} teklifine ${typeLabels[type]||type} ekledi`,
       JSON.stringify({ add_id: use.add_id, use_id: use.id })]
    );
  }

  res.status(201).json(rows[0]);
});

// GET /uses/add/:addId — add'e ait tüm use'lar gruplu
router.get('/add/:addId', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT us.*, u.name as owner_name, u.handle as owner_handle, u.avatar_url as owner_avatar
    FROM uses us JOIN users u ON us.owner_id=u.id
    WHERE us.add_id=$1 ORDER BY us.created_at ASC
  `, [req.params.addId]);

  const grouped = {
    got_it:      rows.filter(u => u.relation_group==='direct'  && u.status!=='rejected'),
    matches:     rows.filter(u => u.relation_group==='match'),
    suggestions: rows.filter(u => u.relation_group==='suggest'),
    rejected:    rows.filter(u => u.status==='rejected'),
  };

  res.json(grouped);
});

module.exports = router;
