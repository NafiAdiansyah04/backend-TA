require('dotenv').config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const cors = require("cors");
const { updateMoisture, getLatestMoisture } = require("./server-data");
require("./cron/saveAverage");
const db = require("./db");


const MQTT_BROKER = process.env.MQTT_BROKER || "wss://8f3fd6867485477db38c34b326a4073b.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "brokertugasakhir";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "brokerTa040903";
const PORT = process.env.PORT || 10000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const client = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocol: "wss",
    port: 8884,
    rejectUnauthorized: false
});

let latestPesticideStatus = "OFF";

client.on("connect", () => {
    console.log("✅ Connected to MQTT Broker");
    client.subscribe("moisture/data");
    client.subscribe("pesticide/status");
});

client.on("message", (topic, message) => {
    const msg = message.toString();
    console.log(`📩 MQTT Message Received: ${topic} - ${msg}`);

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

app.get("/moisture/data", (req, res) => {
    res.json(getLatestMoisture());
});

app.get("/pesticide/status", (req, res) => {
    res.json({ status: latestPesticideStatus });
});

app.post("/control/pesticide", (req, res) => {
    const { status } = req.body;
    if (status !== "ON" && status !== "OFF") {
        return res.status(400).json({ error: "Status harus 'ON' atau 'OFF'" });
    }

    console.log(`🚀 Mengirim kontrol pestisida: ${status}`);

    if (!client.connected) {
        console.error("⚠️ MQTT Client tidak terhubung!");
        return res.status(500).json({ error: "MQTT Client tidak terhubung!" });
    }

    client.publish("pesticide/control", status, (err) => {
        if (err) {
            console.error("❌ Gagal mengirim ke MQTT:", err);
            return res.status(500).json({ error: "Gagal mengirim ke MQTT" });
        }
        latestPesticideStatus = status;
        res.json({ message: `Pesticide pump set to ${status}` });
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


wss.on("connection", (ws) => {
    console.log("🔗 WebSocket Client Connected");
    ws.send(JSON.stringify({ topic: "moisture/data", msg: getLatestMoisture() }));
    ws.send(JSON.stringify({ topic: "pesticide/status", msg: latestPesticideStatus }));

    ws.on("close", () => {
        console.log("❌ WebSocket Client Disconnected");
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
