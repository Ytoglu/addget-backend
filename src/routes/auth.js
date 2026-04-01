const router     = require('express').Router();
const pool       = require('../config/db');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Mail transporter (Gmail veya SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER || 'addget.app@gmail.com',
    pass: process.env.MAIL_PASS || '',
  },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email gerekli' });

  const code      = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 dk

  await pool.query(
    `INSERT INTO otp_codes (email, code, expires_at)
     VALUES ($1, $2, $3)`,
    [email.toLowerCase(), code, expiresAt]
  );

  // Geliştirme ortamında konsola yaz
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📧 OTP [${email}]: ${code}`);
  } else {
    await transporter.sendMail({
      from: '"Addget" <addget.app@gmail.com>',
      to: email,
      subject: 'Addget Giriş Kodu',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <h2 style="color:#2C2C2A">Addget</h2>
          <p>Giriş kodun:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#7F77DD;padding:16px 0">${code}</div>
          <p style="color:#888">Bu kod 10 dakika geçerlidir.</p>
        </div>
      `,
    });
  }

  res.json({ success: true, message: 'OTP gönderildi' });
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, code, name, handle } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email ve kod gerekli' });

  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE email=$1 AND code=$2 AND used=false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase(), code]
  );

  if (!rows[0]) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş kod' });

  await pool.query('UPDATE otp_codes SET used=true WHERE id=$1', [rows[0].id]);

  // Kullanıcı var mı?
  let user = (await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];

  if (!user) {
    // Yeni kullanıcı — name ve handle zorunlu
    if (!name || !handle) return res.status(400).json({ error: 'Yeni kullanıcı için isim ve kullanıcı adı gerekli', new_user: true });

    const handleClean = handle.startsWith('@') ? handle : '@' + handle;
    const exists = await pool.query('SELECT id FROM users WHERE handle=$1', [handleClean]);
    if (exists.rows[0]) return res.status(400).json({ error: 'Bu kullanıcı adı alınmış' });

    const ins = await pool.query(
      `INSERT INTO users (email, name, handle) VALUES ($1,$2,$3) RETURNING *`,
      [email.toLowerCase(), name, handleClean]
    );
    user = ins.rows[0];
  }

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '90d' });
  res.json({ token, user });
});

// GET /auth/me
router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json(req.user);
});

module.exports = router;
