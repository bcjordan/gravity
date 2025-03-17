import ServerPhysicsSimulation from './server-physics.js';

// Store players and their gravity point data
const players = {};
let nextPlayerId = 1;

// Create the physics simulation
const physicsSimulation = new ServerPhysicsSimulation({
    particleCount: 1000,       // Even fewer particles for clear visibility
    updateRate: 15,            // Slower updates for easier visualization
    gravityStrength: 2.0,      // Stronger gravity for more obvious effects
    particleSpread: 800,
    initialSpeed: 3.0,         // Slower initial speed
    velocityDamping: 0.96,     // More damping for slower movement
    prismRadius: 100           // Larger prism radius
});

// Start the simulation
physicsSimulation.startSimulation();

// Track the last time we sent a full simulation update
let lastFullUpdateTime = Date.now();
const FULL_UPDATE_INTERVAL = 200; // Send full state every 200ms

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

// Track server performance metrics
let lastPhysicsTime = 0;   // Time spent in last physics update
let avgPhysicsTime = 0;    // Moving average of physics update time
let updateCount = 0;       // Count of updates for averaging
const avgWindow = 50;      // Window size for moving average

// Add performance monitoring to the physics simulation
const originalUpdatePhysics = physicsSimulation.updatePhysics;
physicsSimulation.updatePhysics = function(deltaTime) {
    const startTime = performance.now();
    originalUpdatePhysics.call(this, deltaTime);
    const endTime = performance.now();
    
    // Calculate time spent in physics update
    lastPhysicsTime = endTime - startTime;
    
    // Update moving average
    updateCount++;
    avgPhysicsTime = avgPhysicsTime + (lastPhysicsTime - avgPhysicsTime) / Math.min(updateCount, avgWindow);
};

// Start a periodic broadcast of simulation state - slower updates (every 80ms or ~12 fps)
setInterval(() => {
    const now = Date.now();
    
    // Gather performance metrics
    const perfMetrics = {
        physicsTime: lastPhysicsTime,       // Last single update time (ms)
        avgPhysicsTime: avgPhysicsTime,     // Moving average update time (ms)
        particleCount: physicsSimulation.particles.length,
        playerCount: Object.keys(players).length
    };
    
    // Send partial update (just particle positions) most of the time
    if (now - lastFullUpdateTime < FULL_UPDATE_INTERVAL) {
        const simState = physicsSimulation.getState();
        const message = JSON.stringify({
            type: "particleUpdate",
            particles: simState.particles, // Just send particle positions
            time: simState.simulationTime,
            metrics: perfMetrics            // Include performance metrics
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
            state: simState,
            metrics: perfMetrics            // Include performance metrics
        });
        
        for (const id in players) {
            try {
                players[id].ws.send(message);
            } catch (e) {
                console.error(`Error sending full state to ${id}:`, e);
            }
        }
    }
}, 80); // Update clients at ~12 Hz for slower, more visible movements

// Handle process exit
process.on('SIGINT', () => {
    console.log('Stopping physics simulation...');
    physicsSimulation.stopSimulation();
    process.exit(0);
});

console.log(`Server running at http://localhost:${server.port}`);
console.log(`Physics simulation started with ${physicsSimulation.particles.length} particles`);