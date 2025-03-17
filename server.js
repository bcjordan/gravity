import ServerPhysicsSimulation from './server-physics.js';

// Store players and their gravity point data
const players = {};
let nextPlayerId = 1;

// Create the physics simulation
const physicsSimulation = new ServerPhysicsSimulation({
    particleCount: 2000,       // Reduced for server performance
    updateRate: 20,            // Updates per second
    gravityStrength: 1.0,
    particleSpread: 800
});

// Start the simulation
physicsSimulation.startSimulation();

// Track the last time we sent a full simulation update
let lastFullUpdateTime = Date.now();
const FULL_UPDATE_INTERVAL = 100; // Send full state every 100ms

// Create WebSocket server with HTTP server
const server = Bun.serve({
    port: 3001,
    hostname: "0.0.0.0",  // Make sure to listen on all interfaces
    fetch(req, server) {
        // Upgrade HTTP requests to WebSocket
        if (server.upgrade(req)) {
            return; // Return if upgraded to WebSocket
        }
        
        // Return a standard HTTP response for non-WebSocket requests
        return new Response("Gravitational Lensing WebSocket Server");
    },
    websocket: {
        open(ws) {
            // Generate a random ID
            const playerId = nextPlayerId++;
            
            // Store player with websocket
            players[playerId] = {
                ws: ws
            };
            
            // Add player to physics simulation with default params
            const playerParams = physicsSimulation.addPlayer(playerId);
            
            console.log(`Player ${playerId} connected`);
            
            // Send the new player their ID
            ws.send(JSON.stringify({ 
                type: "id", 
                id: playerId 
            }));
            
            // Send current simulation state to the new player
            ws.send(JSON.stringify({
                type: "fullState",
                state: physicsSimulation.getState()
            }));
            
            // Notify everyone about the new player
            broadcastPlayerList();
        },
        message(ws, message) {
            try {
                const data = JSON.parse(message);
                
                // Find player ID for this websocket
                const playerId = Object.keys(players).find(id => players[id].ws === ws);
                
                if (!playerId) return;
                
                if (data.type === "updatePosition") {
                    // Update player's gravity point position in the simulation
                    physicsSimulation.updatePlayerPosition(playerId, data.position);
                    
                    // Broadcast the position update to all other players
                    broadcastPlayerUpdate(playerId, {
                        position: data.position
                    });
                }
                else if (data.type === "updateParams") {
                    // Update player's gravity parameters in the simulation
                    physicsSimulation.updatePlayerParams(playerId, data.params);
                    
                    // Broadcast the parameter update to all other players
                    broadcastPlayerUpdate(playerId, data.params);
                }
                else if (data.type === "setParticleCount" && data.count) {
                    // Admin command to change particle count
                    console.log(`Player ${playerId} changing particle count to ${data.count}`);
                    physicsSimulation.options.particleCount = Math.min(10000, Math.max(500, data.count));
                    physicsSimulation.resetSimulation();
                    
                    // Broadcast system message about the change
                    broadcastSystemMessage(`Particle count changed to ${physicsSimulation.options.particleCount}`);
                }
            } catch (e) {
                console.error("Error processing message:", e);
            }
        },
        close(ws, code, message) {
            // Find playerId for this websocket
            const playerId = Object.keys(players).find(id => players[id].ws === ws);
            
            if (playerId) {
                console.log(`Player ${playerId} disconnected`);
                
                // Remove from players object
                delete players[playerId];
                
                // Remove from physics simulation
                physicsSimulation.removePlayer(playerId);
                
                // Notify everyone about the player list change
                broadcastPlayerList();
            }
        }
    }
});

// Function to broadcast a player update to all connected clients
function broadcastPlayerUpdate(playerId, updateData) {
    const message = JSON.stringify({
        type: "playerUpdate",
        playerId: playerId,
        data: updateData
    });
    
    for (const id in players) {
        try {
            players[id].ws.send(message);
        } catch (e) {
            console.error(`Error sending player update to ${id}:`, e);
        }
    }
}

// Function to broadcast a system message to all clients
function broadcastSystemMessage(text) {
    const message = JSON.stringify({
        type: "systemMessage",
        text: text
    });
    
    for (const id in players) {
        try {
            players[id].ws.send(message);
        } catch (e) {
            console.error(`Error sending system message to ${id}:`, e);
        }
    }
}

// Broadcast the player list to all clients
function broadcastPlayerList() {
    const playerIds = Object.keys(players);
    const message = JSON.stringify({ 
        type: "players", 
        players: playerIds 
    });
    
    for (const id in players) {
        try {
            players[id].ws.send(message);
        } catch (e) {
            console.error(`Error sending to player ${id}:`, e);
        }
    }
}

// Start a periodic broadcast of simulation state
setInterval(() => {
    const now = Date.now();
    
    // Send partial update (just particle positions) most of the time
    if (now - lastFullUpdateTime < FULL_UPDATE_INTERVAL) {
        const simState = physicsSimulation.getState();
        const message = JSON.stringify({
            type: "particleUpdate",
            particles: simState.particles, // Just send particle positions
            time: simState.simulationTime
        });
        
        for (const id in players) {
            try {
                players[id].ws.send(message);
            } catch (e) {
                console.error(`Error sending particle update to ${id}:`, e);
            }
        }
    } 
    // Send full update periodically
    else {
        lastFullUpdateTime = now;
        const simState = physicsSimulation.getState();
        const message = JSON.stringify({
            type: "fullState",
            state: simState
        });
        
        for (const id in players) {
            try {
                players[id].ws.send(message);
            } catch (e) {
                console.error(`Error sending full state to ${id}:`, e);
            }
        }
    }
}, 50); // Update clients at 20Hz

// Handle process exit
process.on('SIGINT', () => {
    console.log('Stopping physics simulation...');
    physicsSimulation.stopSimulation();
    process.exit(0);
});

console.log(`Server running at http://localhost:${server.port}`);
console.log(`Physics simulation started with ${physicsSimulation.particles.length} particles`);