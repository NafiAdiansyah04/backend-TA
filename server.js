const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const cors = require("cors");

// Konfigurasi dari Environment Variables (agar bisa diatur di Railway)
const MQTT_BROKER = process.env.MQTT_BROKER || "wss://8f3fd6867485477db38c34b326a4073b.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "brokertugasakhir";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "brokerTa040903";
const PORT = process.env.PORT || 10000;

// Inisialisasi Express App
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors()); // Aktifkan CORS agar bisa diakses dari frontend
app.use(express.json());

// Koneksi ke MQTT Broker
const client = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    protocol: "wss",
    port: 8884,
    rejectUnauthorized: false
});

// Variabel untuk menyimpan data terbaru dari MQTT
let latestMoistureData = { moisture1: 0, moisture2: 0, moisture3: 0, average: 0 };
let latestMoistureStatus = "OFF";
let latestPesticideStatus = "OFF";

// Saat berhasil terhubung ke MQTT
client.on("connect", () => {
    console.log("✅ Connected to MQTT Broker");

    // Subscribe ke topik sensor & status
    client.subscribe("moisture/data");
    client.subscribe("moisture/status");
    client.subscribe("pesticide/status");
});

// Menangani pesan dari MQTT
client.on("message", (topic, message) => {
    const msg = message.toString();
    console.log(`📩 MQTT Message Received: ${topic} - ${msg}`);

    if (topic === "moisture/data") {
        try {
            latestMoistureData = JSON.parse(msg);
        } catch (error) {
            console.error("❌ Error parsing moisture data:", error);
        }
    }

    if (topic === "moisture/status") {
        latestMoistureStatus = msg;
    }

    if (topic === "pesticide/status") {
        latestPesticideStatus = msg;
    }

    // Kirim data ke semua client WebSocket yang terhubung
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ topic, msg }));
        }
    });
});

// API untuk mendapatkan data kelembapan terbaru
app.get("/moisture/data", (req, res) => {
    res.json(latestMoistureData);
});

// API untuk mendapatkan status pompa kelembapan
app.get("/moisture/status", (req, res) => {
    res.json({ status: latestMoistureStatus });
});

// API untuk mendapatkan status pestisida
app.get("/pesticide/status", (req, res) => {
    res.json({ status: latestPesticideStatus });
});

// API untuk mengontrol pompa pestisida
app.post("/control/pesticide", (req, res) => {
    const { status } = req.body;

    if (status !== "ON" && status !== "OFF") {
        return res.status(400).json({ error: "Status harus 'ON' atau 'OFF'" });
    }

    console.log(`🚀 Mengirim kontrol pestisida: ${status}`);
    client.publish("pesticide/control", status);

    res.json({ message: `Pesticide pump set to ${status}` });
});

// WebSocket Connection
wss.on("connection", (ws) => {
    console.log("🔗 WebSocket Client Connected");

    ws.on("message", (message) => {
        console.log(`💬 WebSocket Message: ${message}`);
    });

    ws.on("close", () => {
        console.log("❌ WebSocket Client Disconnected");
    });
});

// Jalankan server di PORT yang ditentukan
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
