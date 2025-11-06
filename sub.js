// sub.js
const mqtt = require('mqtt');

const useWs = process.env.MQTT_WS === '1'; // set MQTT_WS=1 để test WS
const url = useWs ? 'ws://localhost:8888' : 'mqtt://localhost:1883';

// Nếu có auth:
const options = {};
if (process.env.MQTT_USER) {
  options.username = process.env.MQTT_USER;
  options.password = process.env.MQTT_PASS || '';
}

const client = mqtt.connect(url, options);

client.on('connect', () => {
  console.log('✅ SUB connected:', url);
  client.subscribe('sensors/temperature', { qos: 0 }, (err) => {
    if (err) console.error('Subscribe error:', err);
    else console.log('📥 Subscribed to sensors/temperature');
  });
});

client.on('message', (topic, payload) => {
  console.log(`💬 [${topic}] ${payload.toString()}`);
});

client.on('error', (e) => console.error('Client error:', e.message));
