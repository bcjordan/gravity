// Store players and their gravity point data
const players = {};
let nextPlayerId = 1;

// Default physics parameters for new players
const defaultGravityParams = {
    position: { x: 0, y: 0 },
    gravityStrength: 1.0,
    lensingStrength: 1.5,
    prismRadius: 50,
    prismStrength: 1.0,
    prismDispersion: 1.5
};

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
            
            // Store player with websocket and default gravity parameters
            players[playerId] = {
                ws: ws,
                params: {...defaultGravityParams}
            };
            
            console.log(`Player ${playerId} connected`);
            
            // Send the new player their ID
            ws.send(JSON.stringify({ 
                type: "id", 
                id: playerId 
            }));
            
            // Send current player gravity points to the new player
            ws.send(JSON.stringify({
                type: "allGravityPoints",
                points: getAllGravityPoints()
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
                    // Update player's gravity point position
                    players[playerId].params.position = data.position;
                    
                    // Broadcast updated gravity points to all players
                    broadcastGravityPoints();
                }
                else if (data.type === "updateParams") {
                    // Update player's gravity parameters
                    Object.assign(players[playerId].params, data.params);
                    
                    // Broadcast updated gravity points to all players
                    broadcastGravityPoints();
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
                delete players[playerId];
                
                // Notify everyone about the player list change
                broadcastPlayerList();
                
                // Broadcast updated gravity points to all players
                broadcastGravityPoints();
            }
        }
    }
});

// Function to get all gravity points with player IDs
function getAllGravityPoints() {
    const points = {};
    
    for (const id in players) {
        points[id] = players[id].params;
    }
    
    return points;
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

// Broadcast all gravity points to all clients
function broadcastGravityPoints() {
    const points = getAllGravityPoints();
    const message = JSON.stringify({
        type: "allGravityPoints",
        points: points
    });
    
    for (const id in players) {
        try {
            players[id].ws.send(message);
        } catch (e) {
            console.error(`Error sending gravity points to player ${id}:`, e);
        }
    }
}

console.log(`Server running at http://localhost:${server.port}`);