# Gravitational Lensing

Particle gravity simulation with gravitational lensing effects using Three.js.

## Run Locally

```bash
# Install bun if you don't have it
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Run client only
bun run serve

# Run WebSocket server only
bun run server

# Run both client and server for multiplayer
bun run dev
```

Then visit http://localhost:3000

## Multiplayer Mode

In the multiplayer branch, users can chat with each other. Type a message beginning with "/" in the input box and press Enter to send it to all connected clients.

Example:
```
/Hello everyone!
```

The multiplayer system uses Bun's built-in WebSocket server to handle real-time communication between clients.