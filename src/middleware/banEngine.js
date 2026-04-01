const pool = require('../config/db');

const BAN_CONFIG = {
  MIN_REVIEWS:   100,
  NEG_THRESHOLD: 0.20,
  NEG_STARS:     2,
  BAN_DAYS:      30,
};

async function checkAndApplyBan(userId) {
  const { rows } = await pool.query(
    'SELECT rating FROM reviews WHERE to_id=$1', [userId]
  );

  const total = rows.length;
  if (total < BAN_CONFIG.MIN_REVIEWS) return null;

  const negCount = rows.filter(r => r.rating <= BAN_CONFIG.NEG_STARS).length;
  const negPct   = negCount / total;

  if (negPct > BAN_CONFIG.NEG_THRESHOLD) {
    const banUntil = new Date();
    banUntil.setDate(banUntil.getDate() + BAN_CONFIG.BAN_DAYS);

    await pool.query(
      'UPDATE users SET is_banned=true, ban_until=$1 WHERE id=$2',
      [banUntil, userId]
    );

    // Bildirim gönder
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, payload)
       VALUES ($1,'ban_applied','Hesabın Askıya Alındı',
       $2, $3)`,
      [userId,
       `Olumsuz yorum oranın %${Math.round(negPct*100)}'e ulaştı. Hesabın ${BAN_CONFIG.BAN_DAYS} gün askıya alındı.`,
       JSON.stringify({ ban_until: banUntil, neg_pct: negPct })]
    );

    return { banned: true, banUntil, negPct };
  }

  // Uyarı
  if (negPct > 0.14) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1,'ban_warning','Uyarı',$2)`,
      [userId, `Olumsuz yorum oranın %${Math.round(negPct*100)}'e ulaştı. %20 eşiğini aşarsan hesabın askıya alınır.`]
    );
    return { warned: true, negPct };
  }

  return null;
}

module.exports = { checkAndApplyBan, BAN_CONFIG };
