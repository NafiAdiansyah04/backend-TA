require("dotenv").config();
const express = require("express");
const mqtt = require("mqtt");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(3000, () => console.log("Server running on port 3000"));
const wss = new WebSocket.Server({ server });

// MQTT Connection
const client = mqtt.connect(process.env.MQTT_BROKER, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocol: "wss",
    port: 8884,
    rejectUnauthorized: false
});

client.on("connect", () => {
    console.log("Connected to MQTT Broker");
    client.subscribe("moisture/data");
    client.subscribe("moisture/status");
    client.subscribe("pesticide/status");
});

client.on("message", (topic, message) => {
    const data = message.toString();
    console.log(`Received on ${topic}: ${data}`);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ topic, data }));
        }
    });
});

// API untuk mengontrol pompa pestisida
app.post("/control/pesticide", (req, res) => {
    const { status } = req.body;
    client.publish("pesticide/control", status);
    res.json({ message: `Pesticide pump set to ${status}` });
});
