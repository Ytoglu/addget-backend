const router = require('express').Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email gerekli' });

    const normalizedEmail = email.toLowerCase();
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO otp_codes (email, code, expires_at)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, code, expiresAt]
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log(`OTP [${normalizedEmail}]: ${code}`);
      return res.json({ success: true, message: 'OTP gonderildi' });
    }

    if (!resend) {
      console.error('RESEND_API_KEY tanimli degil.');
      return res.status(500).json({ error: 'Mail servisi yapilandirilmamis.' });
    }

    const fromEmail = process.env.MAIL_FROM || 'onboarding@resend.dev';
    const { error: resendError } = await resend.emails.send({
      from: `Addget <${fromEmail}>`,
      to: normalizedEmail,
      subject: 'Addget Giris Kodu',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
          <h2 style="color:#2C2C2A">Addget</h2>
          <p>Giris kodun:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#7F77DD;padding:16px 0">${code}</div>
          <p style="color:#888">Bu kod 10 dakika gecerlidir.</p>
        </div>
      `,
    });

    if (resendError) {
      console.error('Resend gonderim hatasi:', resendError);
      return res.status(500).json({ error: 'OTP gonderilemedi. Mail servisini kontrol edin.' });
    }

    return res.json({ success: true, message: 'OTP gonderildi' });
  } catch (error) {
    console.error('OTP gonderme hatasi:', error);
    return res.status(500).json({ error: 'OTP gonderilemedi. Mail servisini kontrol edin.' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, code, name, handle } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email ve kod gerekli' });

  const normalizedEmail = email.toLowerCase();
  const normalizedCode = String(code).trim();

  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE email=$1 AND code=$2 AND used=false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, normalizedCode]
  );

  if (!rows[0]) return res.status(400).json({ error: 'Gecersiz veya suresi dolmus kod' });

  let user = (await pool.query('SELECT * FROM users WHERE email=$1', [normalizedEmail])).rows[0];

  if (!user) {
    if (!name || !handle) {
      return res.status(400).json({ error: 'Yeni kullanici icin isim ve kullanici adi gerekli', new_user: true });
    }

    const handleClean = handle.startsWith('@') ? handle : '@' + handle;
    const exists = await pool.query('SELECT id FROM users WHERE handle=$1', [handleClean]);
    if (exists.rows[0]) return res.status(400).json({ error: 'Bu kullanici adi alinmis' });

    const ins = await pool.query(
      `INSERT INTO users (email, name, handle) VALUES ($1,$2,$3) RETURNING *`,
      [normalizedEmail, name, handleClean]
    );
    user = ins.rows[0];
  }

  await pool.query('UPDATE otp_codes SET used=true WHERE id=$1', [rows[0].id]);

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '90d' });
  res.json({ token, user });
});

router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json(req.user);
});

module.exports = router;
