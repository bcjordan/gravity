import { WebSocketServer } from "bun";

const players = {};
let nextPlayerId = 1;

// Store player messages
const playerMessages = {};

// Create WebSocket server
const wss = new WebSocketServer({
    port: 3001,
});

console.log(`WebSocket server running at ws://localhost:${wss.port}`);

// HTTP server for health checks
const server = Bun.serve({
    port: 3002,
    fetch(req) {
        return new Response("Gravitational Lensing WebSocket Server");
    },
});

console.log(`HTTP server running at http://localhost:${server.port}`);

// Handle WebSocket connections
wss.subscribe("message", (ws, message) => {
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
});

wss.subscribe("open", (ws) => {
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
});

wss.subscribe("close", (ws) => {
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
});

function broadcastPlayerList() {
    const playerIds = Object.keys(players);
    const message = JSON.stringify({ 
        type: "players", 
        players: playerIds 
    });
    
    for (const id in players) {
        players[id].send(message);
    }
}

function broadcastPlayerMessages() {
    const message = JSON.stringify({ 
        type: "allMessages", 
        messages: playerMessages 
    });
    
    for (const id in players) {
        players[id].send(message);
    }
}