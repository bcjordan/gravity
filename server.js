const players = {};
let nextPlayerId = 1;

// Create WebSocket server with HTTP server
const server = Bun.serve({
    port: 3001,
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
            players[playerId] = ws;
            
            console.log(`Player ${playerId} connected`);
            
            // Send the new player their ID
            ws.send(JSON.stringify({ 
                type: "id", 
                id: playerId 
            }));
            
            // Notify everyone about the new player
            broadcastPlayerList();
        },
        message(ws, message) {
            // Not handling messages in this simplified version
        },
        close(ws, code, message) {
            // Find playerId for this websocket
            const playerId = Object.keys(players).find(id => players[id] === ws);
            
            if (playerId) {
                console.log(`Player ${playerId} disconnected`);
                delete players[playerId];
                
                // Notify everyone about the player list change
                broadcastPlayerList();
            }
        }
    }
});

function broadcastPlayerList() {
    const playerIds = Object.keys(players);
    const message = JSON.stringify({ 
        type: "players", 
        players: playerIds 
    });
    
    for (const id in players) {
        try {
            players[id].send(message);
        } catch (e) {
            console.error(`Error sending to player ${id}:`, e);
        }
    }
}

console.log(`Server running at http://localhost:${server.port}`);