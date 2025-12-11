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

# Expose API port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production

# Start the API server
CMD ["node", "src/server.js"]
