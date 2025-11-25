const mqtt = require('mqtt');

const useWs = process.env.MQTT_WS === '1';
const url = useWs ? 'ws://localhost:8888' : 'mqtt://localhost:1883';

const options = {};

const client = mqtt.connect(url, options);

client.on('connect', () => {
  console.log('PUB connected:', url);

  client.publish('doorlock/esp-door-01/cmd/open', JSON.stringify({
    ts: Math.floor(Date.now()/1000),
    v: 1,
    command: { lock1: "off" }
  }), { retain: false, qos: 1 }, (err) => {
    if (err) console.error('Publish error:', err);
    client.end();
  });
});

client.on('error', (e) => console.error('Client error:', e.message));
