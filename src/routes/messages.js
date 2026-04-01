const router = require('express').Router();
const pool   = require('../config/db');
const auth   = require('../middleware/auth');

// GET /messages/conversations — tüm konuşmalar
router.get('/conversations', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (LEAST(m.from_id,m.to_id), GREATEST(m.from_id,m.to_id))
      m.*,
      CASE WHEN m.from_id=$1 THEN u2.name ELSE u1.name END as other_name,
      CASE WHEN m.from_id=$1 THEN u2.handle ELSE u1.handle END as other_handle,
      CASE WHEN m.from_id=$1 THEN u2.avatar_url ELSE u1.avatar_url END as other_avatar,
      CASE WHEN m.from_id=$1 THEN m.to_id ELSE m.from_id END as other_id,
      a.title as add_title,
      (SELECT COUNT(*) FROM messages m2
       WHERE m2.to_id=$1 AND m2.from_id=CASE WHEN m.from_id=$1 THEN m.to_id ELSE m.from_id END
       AND m2.read_at IS NULL) as unread_count
    FROM messages m
    JOIN users u1 ON m.from_id=u1.id
    JOIN users u2 ON m.to_id=u2.id
    JOIN adds a ON m.add_id=a.id
    WHERE m.from_id=$1 OR m.to_id=$1
    ORDER BY LEAST(m.from_id,m.to_id), GREATEST(m.from_id,m.to_id), m.created_at DESC
  `, [req.user.id]);

  res.json(rows);
});

// GET /messages/:otherUserId?add_id= — bir konuşma
router.get('/:otherUserId', auth, async (req, res) => {
  const { add_id } = req.query;
  const params = [req.user.id, req.params.otherUserId];
  let addCond = '';
  if (add_id) { params.push(add_id); addCond = `AND m.add_id=$${params.length}`; }

  const { rows } = await pool.query(`
    SELECT m.*, u.name as from_name, u.handle as from_handle
    FROM messages m JOIN users u ON m.from_id=u.id
    WHERE ((m.from_id=$1 AND m.to_id=$2) OR (m.from_id=$2 AND m.to_id=$1))
    ${addCond}
    ORDER BY m.created_at ASC
  `, params);

  // Okundu işaretle
  await pool.query(
    'UPDATE messages SET read_at=NOW() WHERE to_id=$1 AND from_id=$2 AND read_at IS NULL',
    [req.user.id, req.params.otherUserId]
  );

  res.json(rows);
});

// POST /messages — mesaj gönder
router.post('/', auth, async (req, res) => {
  const { to_id, add_id, use_id, content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'İçerik boş olamaz' });

  const { rows } = await pool.query(`
    INSERT INTO messages (from_id,to_id,add_id,use_id,content)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [req.user.id, to_id, add_id, use_id||null, content]);

  // Socket ile realtime
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${to_id}`).emit('new_message', {
      ...rows[0],
      from_name:   req.user.name,
      from_handle: req.user.handle,
    });
  }

  // Bildirim
  await pool.query(
    `INSERT INTO notifications (user_id,type,title,body,payload)
     VALUES ($1,'message_received','Yeni Mesaj',$2,$3)`,
    [to_id,
     `${req.user.name}: ${content.slice(0,60)}`,
     JSON.stringify({ from_id: req.user.id, add_id, use_id })]
  );

  res.status(201).json(rows[0]);
});

module.exports = router;
