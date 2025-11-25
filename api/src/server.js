const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const mqtt = require('mqtt');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mqtt_broker_logs',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
  console.log('API connected to MQTT broker');
});


// Get all devices
app.get('/api/devices', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT device_id, 
             MAX(ts) as last_seen,
             COUNT(*) as message_count
      FROM broker_logs 
      WHERE device_id IS NOT NULL 
      GROUP BY device_id 
      ORDER BY last_seen DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get logs by device
app.get('/api/devices/:deviceId/logs', async (req, res) => {
  const { deviceId } = req.params;
  const { limit = 50, type } = req.query;
  
  try {
    let query = `
      SELECT * FROM broker_logs 
      WHERE device_id = $1
    `;
    const params = [deviceId];
    
    if (type) {
      query += ` AND msg_type = $2`;
      params.push(type);
    }
    
    query += ` ORDER BY ts DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get recent activity
app.get('/api/activity', async (req, res) => {
  const { limit = 100 } = req.query;
  
  try {
    const result = await pool.query(`
      SELECT * FROM broker_logs 
      ORDER BY ts DESC 
      LIMIT $1
    `, [parseInt(limit)]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Send command to device
app.post('/api/devices/:deviceId/command', async (req, res) => {
  const { deviceId } = req.params;
  const { action, data } = req.body;
  
  try {
    let topic, payload;
    
    switch (action) {
      case 'unlock':
        topic = `doorlock/${deviceId}/cmd/open`;
        payload = {
          ts: Math.floor(Date.now() / 1000),
          v: 1,
          command: { lock1: "off" }
        };
        break;
        
      case 'lock':
        topic = `doorlock/${deviceId}/cmd/open`;
        payload = {
          ts: Math.floor(Date.now() / 1000),
          v: 1,
          command: { lock1: "on" }
        };
        break;
        
      case 'status':
        topic = `sensor/${deviceId}/cmd/status`;
        payload = {
          ts: Math.floor(Date.now() / 1000),
          v: 1,
          command: { action: "get_status" }
        };
        break;
        
      case 'custom':
        topic = data.topic;
        payload = data.payload;
        break;
        
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        console.error('MQTT publish error:', err);
        res.status(500).json({ error: 'Failed to send command' });
      } else {
        res.json({ 
          success: true, 
          topic, 
          payload,
          timestamp: new Date()
        });
      }
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get device statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT device_id) as total_devices,
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE msg_type = 'data') as data_messages,
        COUNT(*) FILTER (WHERE msg_type LIKE 'cmd%') as command_messages,
        COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '1 hour') as messages_last_hour
      FROM broker_logs
    `);
    
    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});