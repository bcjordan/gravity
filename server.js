const players = {};
let nextPlayerId = 1;

// Store player messages
const playerMessages = {};

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
            const playerId = nextPlayerId++;
            players[playerId] = ws;
            playerMessages[playerId] = "Player " + playerId;
            
            console.log(`Player ${playerId} connected`);
            
            // Send the new player their ID
            ws.send(JSON.stringify({ 
                type: "id", 
                id: playerId 
            }));
            
            // Send current player messages to the new player
            ws.send(JSON.stringify({ 
                type: "allMessages", 
                messages: playerMessages 
            }));
            
            // Notify everyone about the new player
            broadcastPlayerList();
        },
        message(ws, message) {
            try {
                const data = JSON.parse(message);
                
                if (data.type === "message" && data.playerId) {
                    // Update player message
                    playerMessages[data.playerId] = data.text;
                    
                    // Broadcast the updated message to all players
                    broadcastPlayerMessages();
                }
            } catch (e) {
                console.error("Error processing message:", e);
            }
        },
        close(ws, code, message) {
            // Find playerId for this websocket
            const playerId = Object.keys(players).find(id => players[id] === ws);
            
            if (playerId) {
                console.log(`Player ${playerId} disconnected`);
                delete players[playerId];
                delete playerMessages[playerId];
                
                // Notify everyone about the player list change
                broadcastPlayerList();
                broadcastPlayerMessages();
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

function broadcastPlayerMessages() {
    const message = JSON.stringify({ 
        type: "allMessages", 
        messages: playerMessages 
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