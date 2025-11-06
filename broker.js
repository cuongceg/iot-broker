const net = require('net');
const http = require('http');
const aedes = require('aedes')();
const ws = require('websocket-stream');
const MQTTLogger = require('./logger');

const TCP_PORT = process.env.MQTT_TCP_PORT ? Number(process.env.MQTT_TCP_PORT) : 1883;
const WS_PORT  = process.env.MQTT_WS_PORT  ? Number(process.env.MQTT_WS_PORT)  : 8888;

// (Tùy chọn) danh sách user/pass đơn giản, set qua biến môi trường JSON: 
// export MQTT_USERS='[{"u":"iot","p":"123456"},{"u":"admin","p":"secret"}]'
const logger = new MQTTLogger({
  logDir: './logs',
  logFile: 'mqtt-broker.log',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});
let USERS = [];
try {
  if (process.env.MQTT_USERS) {
    USERS = JSON.parse(process.env.MQTT_USERS);
  }
} catch (e) {
  console.warn('⚠️  Không parse được MQTT_USERS, bỏ qua xác thực:', e.message);
}

// =============== AUTH (tuỳ chọn) ===============
// Nếu USERS rỗng => cho phép tất cả (no-auth). Nếu có USERS => bật auth.
if (USERS.length > 0) {
  aedes.authenticate = (client, username, password, done) => {
    const pass = password ? Buffer.from(password).toString() : '';
    const ok = USERS.some((x) => x.u === username && x.p === pass);
    if (!ok) {
      const err = new Error('Auth failed');
      err.returnCode = 4; // Bad username or password
      return done(err, false);
    }
    return done(null, true);
  };
  console.log('🔐 Auth được bật (danh sách người dùng từ MQTT_USERS).');
} else {
  console.log('🔓 Auth tắt (cho phép tất cả client).');
}

// =============== LOG SỰ KIỆN ===============
aedes.on('client', (client) => {
  logger.logClientConnect(client.id, {
    ip: client.conn?.remoteAddress,
    port: client.conn?.remotePort
  });
});

aedes.on('clientDisconnect', (client) => {
  logger.logClientDisconnect(client.id);
});

aedes.on('subscribe', (subs, client) => {
  const topics = subs.map((s) => s.topic).join(', ');
  logger.logSubscribe(client.id, subs.map(s => ({ topic: s.topic, qos: s.qos })));
});

aedes.on('unsubscribe', (subs, client) => {
  logger.logUnsubscribe(client.id, subs);
});

aedes.on('publish', (packet, client) => {
  if (packet && packet.topic && !packet.topic.startsWith('$SYS')) {
    logger.logPublish(client?.id, packet.topic, packet.payload, packet.qos);
  }
});

aedes.on('clientError', (client, err) => {
  logger.logError(`Client error: ${client.id}`, err, { clientId: client.id });
});

aedes.on('connectionError', (client, err) => {
  logger.logError('Connection error', err, { clientId: client?.id });
});

// =============== TCP SERVER (1883) ===============
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(TCP_PORT, () => {
  console.log(`MQTT TCP broker lắng nghe tại mqtt://localhost:${TCP_PORT}`);
});

// =============== WEBSOCKET SERVER (8888) ===============
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(WS_PORT, () => {
  console.log(`✅ MQTT WS broker lắng nghe tại ws://localhost:${WS_PORT}`);
});

// =============== GRACEFUL SHUTDOWN ===============
function shutdown() {
  logger.logBrokerStop();
  httpServer.close(() => {
    tcpServer.close(() => {
      aedes.close(() => {
        console.log('Đã tắt.');
        process.exit(0);
      });
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
