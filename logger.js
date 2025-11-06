const fs = require('fs');
const path = require('path');

class MQTTLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || './logs';
    this.logFile = options.logFile || 'mqtt-broker.log';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.logPath = path.join(this.logDir, this.logFile);
  }

  writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logEntry += ` | Data: ${JSON.stringify(data)}`;
    }
    
    logEntry += '\n';
    
    this.checkAndRotateLog();
    
    fs.appendFileSync(this.logPath, logEntry);
  }

  // Rotate log file when file size exceeds maxFileSize
  checkAndRotateLog() {
    if (!fs.existsSync(this.logPath)) return;
    
    const stats = fs.statSync(this.logPath);
    if (stats.size >= this.maxFileSize) {
      this.rotateLogFiles();
    }
  }

  rotateLogFiles() {
    const baseName = path.parse(this.logFile).name;
    const ext = path.parse(this.logFile).ext;
    
    const oldestFile = path.join(this.logDir, `${baseName}.${this.maxFiles}${ext}`);
    if (fs.existsSync(oldestFile)) {
      fs.unlinkSync(oldestFile);
    }

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const currentFile = path.join(this.logDir, `${baseName}.${i}${ext}`);
      const nextFile = path.join(this.logDir, `${baseName}.${i + 1}${ext}`);
      
      if (fs.existsSync(currentFile)) {
        fs.renameSync(currentFile, nextFile);
      }
    }
    
    const firstRotatedFile = path.join(this.logDir, `${baseName}.1${ext}`);
    fs.renameSync(this.logPath, firstRotatedFile);
  }

  logClientConnect(clientId, clientInfo = {}) {
    this.writeLog('INFO', `Client connected: ${clientId}`, {
      clientId,
      timestamp: Date.now(),
      ...clientInfo
    });
  }

  logClientDisconnect(clientId, reason = '') {
    this.writeLog('INFO', `Client disconnected: ${clientId}`, {
      clientId,
      reason,
      timestamp: Date.now()
    });
  }

  logSubscribe(clientId, topics) {
    this.writeLog('INFO', `Client subscribed: ${clientId}`, {
      clientId,
      topics,
      timestamp: Date.now()
    });
  }

  logUnsubscribe(clientId, topics) {
    this.writeLog('INFO', `Client unsubscribed: ${clientId}`, {
      clientId,
      topics,
      timestamp: Date.now()
    });
  }

  logPublish(clientId, topic, payload, qos = 0) {
    const maxPayloadLog = 1000;
    let payloadStr = payload?.toString() || '';
    if (payloadStr.length > maxPayloadLog) {
      payloadStr = payloadStr.substring(0, maxPayloadLog) + '...[truncated]';
    }
    
    this.writeLog('INFO', `Message published: ${topic}`, {
      clientId,
      topic,
      payload: payloadStr,
      payloadSize: payload?.length || 0,
      qos,
      timestamp: Date.now()
    });
  }

  logAuthAttempt(clientId, username, success) {
    const level = success ? 'INFO' : 'WARN';
    const message = `Auth attempt: ${username} - ${success ? 'SUCCESS' : 'FAILED'}`;
    
    this.writeLog(level, message, {
      clientId,
      username,
      success,
      timestamp: Date.now()
    });
  }

  logError(message, error, context = {}) {
    this.writeLog('ERROR', message, {
      error: error?.message || error,
      stack: error?.stack,
      context,
      timestamp: Date.now()
    });
  }

  logBrokerStart(ports) {
    this.writeLog('INFO', 'MQTT Broker started', {
      tcpPort: ports.tcp,
      wsPort: ports.ws,
      timestamp: Date.now()
    });
  }

  logBrokerStop() {
    this.writeLog('INFO', 'MQTT Broker stopped', {
      timestamp: Date.now()
    });
  }
}

module.exports = MQTTLogger;