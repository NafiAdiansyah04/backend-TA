const cron = require('node-cron');
const db = require('../db');
const { getLatestMoisture } = require('../server-data');

// Setiap jam (menit ke-0)
cron.schedule('0 * * * *', async () => {
    const { average } = getLatestMoisture();

    // Buat timestamp jam-bulat: YYYY-MM-DD HH:00:00
    const now = new Date();
    now.setMinutes(0, 0, 0); // Set menit, detik, dan milidetik ke nol

    try {
        await db.query(
            `INSERT INTO kelembapan_per_jam (timestamp, average)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE average = VALUES(average)`,
            [now, average]
        );

        console.log("✅ Data rata-rata kelembapan disimpan/diupdate ke database.");
    } catch (err) {
        console.error("❌ Gagal menyimpan ke database:", err);
    }
});
