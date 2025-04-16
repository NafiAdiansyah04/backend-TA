const cron = require('node-cron');
const db = require('../db');
const { getLatestMoisture } = require('../server-data'); // buat file export data nanti

// Setiap jam (menit 0)
cron.schedule('0 * * * *', async () => {
    const { average, moisture1, moisture2, moisture3 } = getLatestMoisture();
    const timestamp = new Date();

    try {
        await db.query(
            'INSERT INTO kelembapan_per_jam (timestamp, moisture1, moisture2, moisture3, average) VALUES (?, ?, ?, ?, ?)',
            [timestamp, moisture1, moisture2, moisture3, average]
        );
        console.log("✅ Data rata-rata kelembapan disimpan ke database.");
    } catch (err) {
        console.error("❌ Gagal menyimpan ke database:", err);
    }
});
