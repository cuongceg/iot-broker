const mqtt = require('mqtt');

const useWs = process.env.MQTT_WS === '1';
const url = useWs ? 'ws://localhost:8888' : 'mqtt://localhost:1883';

const options = {};
if (process.env.MQTT_USER) {
  options.username = process.env.MQTT_USER;
  options.password = process.env.MQTT_PASS || '';
}

const client = mqtt.connect(url, options);

client.on('connect', () => {
  console.log('PUB connected:', url);

  client.publish('sensors/temperature', JSON.stringify({ celsius: 27.5, ts: Date.now() }), { retain: true, qos: 0 }, () => {
    console.log('📦 Published to sensors/temperature');
    client.end();
  });
});

client.on('error', (e) => console.error('Client error:', e.message));
