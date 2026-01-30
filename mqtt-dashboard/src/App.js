import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { 
  Wifi, 
  WifiOff, 
  Unlock, 
  Lock, 
  Activity, 
  Database,
  Send,
  RefreshCw,
  Download,
  FileText,
  Search,
  X
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
  
  // Search filters
  const [filters, setFilters] = useState({
    deviceId: '',
    startDate: '',
    endDate: ''
  });
  const [showFilters, setShowFilters] = useState(false);

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
      let url = `${API_BASE}/activity?limit=100`;
      
      if (filters.deviceId) {
        url += `&deviceId=${encodeURIComponent(filters.deviceId)}`;
      }
      if (filters.startDate) {
        url += `&startDate=${encodeURIComponent(filters.startDate)}`;
      }
      if (filters.endDate) {
        url += `&endDate=${encodeURIComponent(filters.endDate)}`;
      }
      
      const response = await axios.get(url);
      setLogs(response.data);
    } catch (err) {
      console.error('Error loading activity:', err);
    }
  };

  const loadDeviceLogs = async (deviceId) => {
    try {
      setLoading(true);
      let url = `${API_BASE}/devices/${deviceId}/logs?limit=100`;
      
      if (filters.startDate) {
        url += `&startDate=${encodeURIComponent(filters.startDate)}`;
      }
      if (filters.endDate) {
        url += `&endDate=${encodeURIComponent(filters.endDate)}`;
      }
      
      const response = await axios.get(url);
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

  const exportToExcel = () => {
    try {
      const exportData = logs.map(log => ({
        'Timestamp': formatTime(log.ts),
        'Device ID': log.device_id || 'N/A',
        'Client ID': log.client_id || 'N/A',
        'Direction': log.direction,
        'Topic': log.topic,
        'Message Type': log.msg_type,
        'Status': log.status,
        'Payload': typeof log.payload === 'object' ? JSON.stringify(log.payload) : log.payload
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Logs');
      
      // Auto-size columns
      const maxWidth = 50;
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.min(maxWidth, Math.max(key.length, 10))
      }));
      ws['!cols'] = colWidths;
      
      const fileName = `mqtt_logs_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Failed to export to Excel');
    }
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(16);
      doc.text('MQTT Broker Logs', 14, 15);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, 14, 22);
      
      if (selectedDevice) {
        doc.text(`Device: ${selectedDevice}`, 14, 28);
      }
      
      if (filters.startDate || filters.endDate) {
        let filterText = 'Filters: ';
        if (filters.startDate) filterText += `From ${moment(filters.startDate).format('DD/MM/YYYY HH:mm')} `;
        if (filters.endDate) filterText += `To ${moment(filters.endDate).format('DD/MM/YYYY HH:mm')}`;
        doc.text(filterText, 14, 34);
      }
      
      const tableData = logs.map(log => [
        formatTime(log.ts),
        log.device_id || 'N/A',
        log.direction,
        log.topic.substring(0, 30) + (log.topic.length > 30 ? '...' : ''),
        log.msg_type,
        log.status,
        typeof log.payload === 'object' 
          ? JSON.stringify(log.payload).substring(0, 30) + '...'
          : (log.payload || '').substring(0, 30)
      ]);
      
      doc.autoTable({
        startY: filters.startDate || filters.endDate ? 38 : (selectedDevice ? 32 : 26),
        head: [['Time', 'Device', 'Direction', 'Topic', 'Type', 'Status', 'Payload']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 10 }
      });
      
      const fileName = `mqtt_logs_${moment().format('YYYY-MM-DD_HH-mm-ss')}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      alert('Failed to export to PDF');
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const applyFilters = () => {
    if (activeTab === 'activity') {
      loadRecentActivity();
    } else if (activeTab === 'logs' && selectedDevice) {
      loadDeviceLogs(selectedDevice);
    }
  };

  const clearFilters = () => {
    setFilters({
      deviceId: '',
      startDate: '',
      endDate: ''
    });
    setTimeout(() => {
      if (activeTab === 'activity') {
        loadRecentActivity();
      } else if (activeTab === 'logs' && selectedDevice) {
        loadDeviceLogs(selectedDevice);
      }
    }, 100);
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
                Turn off
              </button>
              <button 
                onClick={() => sendCommand(device.device_id, 'lock')}
                className="btn btn-danger"
                disabled={loading}
              >
                <Lock size={16} />
                Turn on
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
            <div className="logs-header">
              <h2>
                {activeTab === 'logs' ? `${selectedDevice} Logs` : 'Recent Activity'}
              </h2>
              
              <div className="logs-actions">
                <button 
                  className="btn btn-filter"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Search size={16} />
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                </button>
                
                <button 
                  className="btn btn-export"
                  onClick={exportToExcel}
                  disabled={logs.length === 0}
                >
                  <Download size={16} />
                  Export Excel
                </button>
                
                <button 
                  className="btn btn-export"
                  onClick={exportToPDF}
                  disabled={logs.length === 0}
                >
                  <FileText size={16} />
                  Export PDF
                </button>
              </div>
            </div>
            
            {showFilters && (
              <div className="filters-panel">
                {activeTab === 'activity' && (
                  <div className="filter-group">
                    <label>Device ID:</label>
                    <input
                      type="text"
                      placeholder="Enter device ID"
                      value={filters.deviceId}
                      onChange={(e) => handleFilterChange('deviceId', e.target.value)}
                    />
                  </div>
                )}
                
                <div className="filter-group">
                  <label>Start Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </div>
                
                <div className="filter-group">
                  <label>End Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </div>
                
                <div className="filter-actions">
                  <button 
                    className="btn btn-primary"
                    onClick={applyFilters}
                  >
                    <Search size={16} />
                    Apply Filters
                  </button>
                  
                  <button 
                    className="btn btn-secondary"
                    onClick={clearFilters}
                  >
                    <X size={16} />
                    Clear
                  </button>
                </div>
              </div>
            )}
            
            <div className="logs-list">
              {logs.length === 0 ? (
                <div className="no-data">No logs found</div>
              ) : (
                logs.map(log => (
                  <LogEntry key={log.id} log={log} />
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;