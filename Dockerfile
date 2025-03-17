FROM oven/bun:latest

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json bun.lock ./
RUN bun install --production

# Copy application files
COPY . .

# Expose ports for both WebSocket server and HTTP server
EXPOSE 3000
EXPOSE 3001

# Set up the server command
CMD ["sh", "-c", "bun run server.js & bun run serve.js"]