require('dotenv').config();
const net = require('net');
const http = require('http');
const aedes = require('aedes')();
const ws = require('websocket-stream');
const MQTTLogger = require('./logger');
const MQTTPublishLogger = require('./logger-postgres');

const TCP_PORT = process.env.MQTT_TCP_PORT ? Number(process.env.MQTT_TCP_PORT) : 1883;
const WS_PORT  = process.env.MQTT_WS_PORT  ? Number(process.env.MQTT_WS_PORT)  : 8888;

const logger = new MQTTLogger({
  logDir: './logs',
  logFile: 'mqtt-broker.log',
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 5
});

const loggerDb = new MQTTPublishLogger({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mqtt_broker_logs',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432
});
const clientInfo = new Map();
let USERS = [];
try {
  if (process.env.MQTT_USERS) {
    USERS = JSON.parse(process.env.MQTT_USERS);
  }
} catch (e) {
  console.warn('Cann\'t parse MQTT_USERS', e.message);
}

if (USERS.length > 0) {
  aedes.authenticate = (client, username, password, done) => {
    const pass = password ? Buffer.from(password).toString() : '';
    const ok = USERS.some((x) => x.u === username && x.p === pass);
    if (!ok) {
      const err = new Error('Auth failed');
      err.returnCode = 4;
      return done(err, false);
    }
    return done(null, true);
  };
  console.log('Auth MQTT enabled with users:', USERS.map(u => u.u).join(', '));
} else {
  console.log('Auth MQTT disabled (allow all clients).');
}

aedes.on('client', (client) => {
  logger.logClientConnect(client.id, {
    ip: client.conn?.remoteAddress,
    port: client.conn?.remotePort
  });
  clientInfo.set(client.id, {
    ip: client.conn?.remoteAddress,
    port: client.conn?.remotePort,
    connectedAt: new Date(),
    lastSeen: new Date()
  });
});

aedes.on('clientDisconnect', (client) => {
  logger.logClientDisconnect(client.id);
  clientInfo.delete(client.id);
});

aedes.on('subscribe', (subs, client) => {
  const topics = subs.map((s) => s.topic).join(', ');
  logger.logSubscribe(client.id, subs.map(s => ({ topic: s.topic, qos: s.qos })));
});

aedes.on('unsubscribe', (subs, client) => {
  logger.logUnsubscribe(client.id, subs);
});

aedes.on('publish', async (packet, client) => {
  if (packet && packet.topic && !packet.topic.startsWith('$SYS')) {
    const clientId = client?.id || 'broker';
    const info = clientInfo.get(clientId) || {};
    if (clientInfo.has(clientId)) {
      clientInfo.get(clientId).lastSeen = new Date();
    }
    await loggerDb.logPublish(
      clientId,
      packet.topic,
      packet.payload,
      packet.qos,
      info
    );
  }
});

aedes.on('clientError', (client, err) => {
  logger.logError(`Client error: ${client.id}`, err, { clientId: client.id });
});

aedes.on('connectionError', (client, err) => {
  logger.logError('Connection error', err, { clientId: client?.id });
});

const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(TCP_PORT, () => {
  console.log(`MQTT TCP broker listening on mqtt://localhost:${TCP_PORT}`);
});

const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(WS_PORT, () => {
  console.log(`MQTT WS broker listening on ws://localhost:${WS_PORT}`);
});

function shutdown() {
  logger.logBrokerStop();
  httpServer.close(() => {
    tcpServer.close(() => {
      aedes.close(() => {
        console.log('Closed.');
        process.exit(0);
      });
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
