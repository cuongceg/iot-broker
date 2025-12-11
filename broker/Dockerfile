# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose MQTT ports
EXPOSE 1883 8888

# Set environment variables
ENV NODE_ENV=production

# Start the broker
CMD ["node", "broker.js"]
