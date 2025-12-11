# MQTT Broker Docker Setup

This project consists of four main services:
- **PostgreSQL Database** - Stores MQTT message logs
- **MQTT Broker** - Handles MQTT message routing using Aedes
- **API Server** - REST API for accessing logs and sending commands
- **Dashboard** - React web interface for monitoring and control

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Make (optional, for convenience commands)

### Build and Run

1. **Clone and navigate to the project:**
   ```bash
   cd /home/domanhcuong/development/javascript/mqtt-broker-node
   ```

2. **Build all services:**
   ```bash
   # Using docker-compose directly
   docker-compose build
   
   # Or using Makefile
   make build
   ```

3. **Start all services:**
   ```bash
   # Using docker-compose directly
   docker-compose up -d
   
   # Or using Makefile
   make up
   ```

4. **Check service status:**
   ```bash
   docker-compose ps
   # Or
   make status
   ```

### Access the Services

- **MQTT Broker (TCP)**: `localhost:1883`
- **MQTT Broker (WebSocket)**: `ws://localhost:8888`
- **API Server**: `http://localhost:3001`
- **Dashboard**: `http://localhost:3000`
- **PostgreSQL**: `localhost:5432` (postgres/postgres)

### Useful Commands

```bash
# View logs for all services
make logs

# View logs for specific service
make logs-broker
make logs-api
make logs-dashboard
make logs-postgres

# Stop all services
make down

# Clean up everything (containers, volumes, networks)
make clean

# Restart all services
make restart

# Access shell in a service
make shell-broker
make shell-api
```

### Environment Variables

The following environment variables can be configured in the docker-compose.yaml:

**Database:**
- `DB_USER` - PostgreSQL username (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: postgres)
- `DB_HOST` - PostgreSQL host (default: postgres)
- `DB_NAME` - Database name (default: mqtt_broker_logs)
- `DB_PORT` - PostgreSQL port (default: 5432)

**MQTT Broker:**
- `MQTT_TCP_PORT` - MQTT TCP port (default: 1883)
- `MQTT_WS_PORT` - MQTT WebSocket port (default: 8888)
- `MQTT_USERS` - JSON string for authentication (optional)

**API Server:**
- `API_PORT` - API server port (default: 3001)

### Development Mode

For development, you can run services individually:

```bash
# Start only database
docker-compose up -d postgres

# Run broker locally
cd broker && npm install && npm run dev

# Run API locally  
cd api && npm install && npm run dev

# Run dashboard locally
cd mqtt-dashboard && npm install && npm start
```

### Troubleshooting

1. **Port conflicts**: Make sure ports 1883, 3001, 3000, and 5432 are not in use
2. **Database connection issues**: Wait for PostgreSQL to be fully ready before starting other services
3. **View container logs**: Use `docker-compose logs <service-name>` to debug issues

### Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   MQTT      │    │     API     │    │  Dashboard  │
│   Broker    │◄───┤   Server    │◄───┤   (React)   │
│  (Aedes)    │    │  (Express)  │    │   (Nginx)   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────▼───────────────────┘
                    ┌─────────────┐
                    │ PostgreSQL  │
                    │  Database   │
                    └─────────────┘
```

All services communicate through a dedicated Docker network (`mqtt_network`) for security and isolation.
