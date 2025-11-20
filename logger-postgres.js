const { Pool } = require('pg');

class MQTTPublishLogger {
  constructor(options = {}) {
    this.pool = new Pool({
      user: options.user || 'postgres',
      host: options.host || 'localhost',
      database: options.database || 'mqtt_broker_logs',
      password: options.password || 'postgres',
      port: options.port || 5432,
      max: options.maxConnections || 10,
      idleTimeoutMillis: options.idleTimeout || 30000,
    });

    this.testConnection();
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      console.log('Connected to PostgreSQL database successfully.');
      client.release();
    } catch (err) {
        console.log(this.pool);
      console.error('Failed to connect PostgreSQL:', err.message);
    }
  }

  parseDeviceId(topic) {
    const parts = topic.split('/');
    if (parts.length >= 2) {
      return parts[1]; // <device-id>
    }
    return null;
  }

  parseMsgType(topic) {
    if (topic.includes('/cmd/open')) return 'cmd_open';
    if (topic.includes('/cmd/response')) return 'cmd_response';
    if (topic.includes('/event/health')) return 'health';
    return 'other';
  }

  parsePayload(payload) {
    try {
      if (Buffer.isBuffer(payload)) {
        return JSON.parse(payload.toString());
      }
      if (typeof payload === 'string') {
        return JSON.parse(payload);
      }
      return payload;
    } catch (e) {
      return { 
        raw: payload?.toString() || '',
        parse_error: e.message 
      };
    }
  }

  determineDirection(clientId, topic) {
    if (topic.includes('/cmd/')) {
      return 'out'; // broker -> device
    }
    if (topic.includes('/data') || topic.includes('/health') || topic.includes('/heartbeat')) {
      return 'in'; // device -> broker
    }
    return 'in'; // mặc định
  }

  async logPublish(clientId, topic, payload, qos = 0, clientInfo = {}) {
    if (topic.startsWith('$SYS')) {
      return;
    }

    const deviceId = this.parseDeviceId(topic);
    const msgType = this.parseMsgType(topic);
    const direction = this.determineDirection(clientId, topic);
    const parsedPayload = this.parsePayload(payload);

    const meta = {
      qos,
      client_ip: clientInfo.ip,
      client_port: clientInfo.port,
      payload_size: payload?.length || 0,
      received_at: new Date().toISOString()
    };

    if (parsedPayload && parsedPayload.meta && parsedPayload.meta.fw) {
      meta.firmware_version = parsedPayload.meta.fw;
    }

    const query = `
      INSERT INTO broker_logs (
        ts, device_id, client_id, direction, topic, 
        msg_type, status, payload, meta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    try {
      await this.pool.query(query, [
        new Date(), // ts
        deviceId,   // device_id
        clientId,   // client_id
        direction,  // direction
        topic,      // topic
        msgType,    // msg_type
        'success',  // status
        JSON.stringify(parsedPayload), // payload
        JSON.stringify(meta)           // meta
      ]);
    } catch (err) {
      console.error('Lỗi ghi publish log:', err.message);
      
      try {
        await this.pool.query(query, [
          new Date(),
          deviceId,
          clientId,
          direction,
          topic,
          msgType,
          'error',
          JSON.stringify({ error: 'Failed to parse or store message' }),
          JSON.stringify({ ...meta, error: err.message })
        ]);
      } catch (secondErr) {
        console.error('Không thể ghi error log:', secondErr.message);
      }
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = MQTTPublishLogger;