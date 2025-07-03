require('dotenv').config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const cors = require("cors");
const { updateMoisture, getLatestMoisture } = require("./server-data");
require("./cron/saveAverage");
const db = require("./db");
const { scheduleJob } = require("node-schedule");

const MQTT_BROKER = process.env.MQTT_BROKER || "wss://...";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "username";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "password";
const PORT = process.env.PORT || 10000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors({
  origin: '*',  // atau ganti dengan origin frontend kamu misal 'https://yourfrontend.com'
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const client = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  protocol: "wss",
  port: 8884,
  rejectUnauthorized: false
});

let latestPesticideStatus = "OFF";
let scheduledJobs = {};

client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");
  client.subscribe("moisture/data");
  client.subscribe("pesticide/status");
});

client.on("message", (topic, message) => {
  const msg = message.toString();
  if (topic === "moisture/data") {
    try {
      const parsed = JSON.parse(msg);
      updateMoisture(parsed);
    } catch (error) {
      console.error("❌ Error parsing moisture data:", error);
    }
  }

  if (topic === "pesticide/status") {
    latestPesticideStatus = msg;
  }

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ topic, msg }));
    }
  });
});

// Load jadwal dari DB ke job saat server mulai
async function loadScheduledJobs() {
  const [rows] = await db.query("SELECT * FROM jadwal_pestisida");
  rows.forEach(row => {
    const job = scheduleJob({ hour: row.hour, minute: row.minute }, () => {
      client.publish("pesticide/control", "ON");
      console.log(`[JOB ${row.id}] Pompa pestisida ON`);
      setTimeout(() => {
        client.publish("pesticide/control", "OFF");
        console.log(`[JOB ${row.id}] Pompa pestisida OFF`);
      }, row.duration * 1000);
    });
    scheduledJobs[row.id] = job;
  });
}

// Endpoint moisture & kontrol
app.get("/moisture/data", (req, res) => res.json(getLatestMoisture()));

app.get("/pesticide/status", (req, res) => {
  res.json({ status: latestPesticideStatus });
});

app.post("/control/pesticide", (req, res) => {
  const { status } = req.body;
  if (status !== "ON" && status !== "OFF") {
    return res.status(400).json({ error: "Status harus 'ON' atau 'OFF'" });
  }
  if (!client.connected) {
    return res.status(500).json({ error: "MQTT tidak terhubung!" });
  }
  client.publish("pesticide/control", status, (err) => {
    if (err) return res.status(500).json({ error: "Gagal publish ke MQTT" });
    latestPesticideStatus = status;
    res.json({ message: `Pompa pestisida ${status}` });
  });
});

app.get("/moisture/hourly", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT timestamp AS hour_timestamp, average AS average_value FROM kelembapan_per_jam ORDER BY timestamp DESC LIMIT 24");
        res.json(rows);
    } catch (error) {
        console.error("❌ Gagal mengambil data rata-rata kelembapan per jam:", error);
        res.status(500).json({ error: "Gagal mengambil data kelembapan" });
    }
});


// CRUD Jadwal
app.get("/api/schedules", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM jadwal_pestisida ORDER BY hour, minute");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil jadwal" });
  }
});

app.post("/api/schedules", async (req, res) => {
  const { hour, minute, duration } = req.body;
  if (hour == null || minute == null || duration == null) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO jadwal_pestisida (hour, minute, duration) VALUES (?, ?, ?)",
      [hour, minute, duration]
    );

    const job = scheduleJob({ hour, minute }, () => {
      client.publish("pesticide/control", "ON");
      setTimeout(() => {
        client.publish("pesticide/control", "OFF");
      }, duration * 1000);
    });

    scheduledJobs[result.insertId] = job;
    res.json({ message: "Jadwal berhasil disimpan", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan jadwal" });
  }
});

app.delete("/api/schedules/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM jadwal_pestisida WHERE id = ?", [id]);
    if (scheduledJobs[id]) {
      scheduledJobs[id].cancel();
      delete scheduledJobs[id];
    }
    res.json({ message: "Jadwal berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus jadwal" });
  }
});

// WebSocket
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket Connected");
  ws.send(JSON.stringify({ topic: "moisture/data", msg: getLatestMoisture() }));
  ws.send(JSON.stringify({ topic: "pesticide/status", msg: latestPesticideStatus }));
  ws.on("close", () => console.log("❌ WebSocket Disconnected"));
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  loadScheduledJobs();
});
