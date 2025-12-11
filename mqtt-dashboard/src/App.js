import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import { 
  Wifi, 
  WifiOff, 
  Unlock, 
  Lock, 
  Activity, 
  Database,
  Send,
  RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function App() {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('devices');

  useEffect(() => {
    loadDevices();
    loadStats();
    loadRecentActivity();
    
    const interval = setInterval(() => {
      loadDevices();
      loadStats();
      if (activeTab === 'activity') {
        loadRecentActivity();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadDevices = async () => {
    try {
      const response = await axios.get(`${API_BASE}/devices`);
      setDevices(response.data);
    } catch (err) {
      console.error('Error loading devices:', err);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const response = await axios.get(`${API_BASE}/activity?limit=100`);
      setLogs(response.data);
    } catch (err) {
      console.error('Error loading activity:', err);
    }
  };

  const loadDeviceLogs = async (deviceId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/devices/${deviceId}/logs?limit=100`);
      setLogs(response.data);
      setSelectedDevice(deviceId);
      setActiveTab('logs');
    } catch (err) {
      console.error('Error loading device logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendCommand = async (deviceId, action) => {
    try {
      setLoading(true);
      const response = await axios.post(`${API_BASE}/devices/${deviceId}/command`, {
        action
      });
      
      if (response.data.success) {
        alert(`Command sent successfully: ${action}`);
        // Reload logs để thấy command mới
        setTimeout(() => loadDeviceLogs(deviceId), 1000);
      }
    } catch (err) {
      console.error('Error sending command:', err);
      alert('Failed to send command');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    return moment(timestamp).format('HH:mm:ss DD/MM/YYYY');
  };

  const getDeviceStatus = (lastSeen) => {
    const diff = moment().diff(moment(lastSeen), 'minutes');
    if (diff < 5) return 'online';
    if (diff < 30) return 'idle';
    return 'offline';
  };

  const DeviceCard = ({ device }) => {
    const status = getDeviceStatus(device.last_seen);
    
    return (
      <div className={`device-card ${status}`}>
        <div className="device-header">
          <h3>{device.device_id}</h3>
          <div className={`status-indicator ${status}`}>
            {status === 'online' ? <Wifi size={16} /> : <WifiOff size={16} />}
            {status}
          </div>
        </div>
        
        <div className="device-info">
          <p>Last seen: {formatTime(device.last_seen)}</p>
          <p>Messages: {device.message_count}</p>
        </div>
        
        <div className="device-controls">
          <button 
            onClick={() => loadDeviceLogs(device.device_id)}
            className="btn btn-info"
          >
            <Activity size={16} />
            View Logs
          </button>
          
          {device.device_id.includes('door') && (
            <>
              <button 
                onClick={() => sendCommand(device.device_id, 'unlock')}
                className="btn btn-success"
                disabled={loading}
              >
                <Unlock size={16} />
                Unlock
              </button>
              <button 
                onClick={() => sendCommand(device.device_id, 'lock')}
                className="btn btn-danger"
                disabled={loading}
              >
                <Lock size={16} />
                Lock
              </button>
            </>
          )}
          
          {/* <button 
            onClick={() => sendCommand(device.device_id, 'status')}
            className="btn btn-secondary"
            disabled={loading}
          >
            <Send size={16} />
            Get Status
          </button> */}
        </div>
      </div>
    );
  };

  const LogEntry = ({ log }) => {
    const getLogTypeColor = (msgType) => {
      switch (msgType) {
        case 'cmd_open': 
        case 'cmd_response': return 'command';
        case 'data': return 'data';
        case 'health': return 'health';
        default: return 'other';
      }
    };

    const formatPayload = (payload) => {
      if (!payload) return '';
      
      if (typeof payload === 'object') {
        return JSON.stringify(payload, null, 2);
      }
      
      try {
        const parsed = JSON.parse(payload);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return payload;
      }
    };

    return (
      <div className={`log-entry ${getLogTypeColor(log.msg_type)}`}>
        <div className="log-header">
          <span className="log-time">{formatTime(log.ts)}</span>
          <span className="log-device">{log.device_id || 'broker'}</span>
          <span className={`log-type ${log.msg_type}`}>{log.msg_type}</span>
          <span className={`log-direction ${log.direction}`}>{log.direction}</span>
        </div>
        
        <div className="log-topic">{log.topic}</div>
        
        {log.payload && (
          <div className="log-payload">
            <pre>{formatPayload(log.payload)}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1><Database size={24} /> MQTT Dashboard</h1>
        
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-label">Devices:</span>
            <span className="stat-value">{stats.total_devices || 0}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Messages:</span>
            <span className="stat-value">{stats.total_messages || 0}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Last Hour:</span>
            <span className="stat-value">{stats.messages_last_hour || 0}</span>
          </div>
        </div>
      </header>

      <nav className="nav-tabs">
        <button 
          className={activeTab === 'devices' ? 'active' : ''}
          onClick={() => setActiveTab('devices')}
        >
          Devices
        </button>
        <button 
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => {
            setActiveTab('activity');
            loadRecentActivity();
          }}
        >
          Recent Activity
        </button>
        {selectedDevice && (
          <button 
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            {selectedDevice} Logs
          </button>
        )}
        
        <button 
          className="refresh-btn"
          onClick={() => {
            loadDevices();
            loadStats();
            if (activeTab === 'activity') loadRecentActivity();
            if (activeTab === 'logs' && selectedDevice) loadDeviceLogs(selectedDevice);
          }}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'devices' && (
          <div className="devices-grid">
            {devices.map(device => (
              <DeviceCard key={device.device_id} device={device} />
            ))}
          </div>
        )}

        {(activeTab === 'activity' || activeTab === 'logs') && (
          <div className="logs-container">
            <h2>
              {activeTab === 'logs' ? `${selectedDevice} Logs` : 'Recent Activity'}
            </h2>
            
            <div className="logs-list">
              {logs.map(log => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;