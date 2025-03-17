// Multiplayer WebSocket Client
class MultiplayerClient {
    constructor() {
        this.playerId = null;
        this.socket = null;
        this.playerList = document.getElementById('player-list');
        
        this.connect();
    }
    
    connect() {
        // Use WebSocket protocol for client
        const host = window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        
        // For local development use port 3001, for production use the same port as the page
        const port = host === 'localhost' || host === '127.0.0.1' ? ':3001' : '';
        const wsUrl = `${protocol}${host}${port}`;
        
        console.log(`Connecting to WebSocket at ${wsUrl}`);
        
        // Create WebSocket connection
        this.socket = new WebSocket(wsUrl);
        
        // Set up event handlers
        this.socket.onopen = this.onSocketOpen.bind(this);
        this.socket.onmessage = this.onSocketMessage.bind(this);
        this.socket.onclose = this.onSocketClose.bind(this);
        this.socket.onerror = this.onSocketError.bind(this);
    }
    
    onSocketOpen(event) {
        console.log('Connected to server');
    }
    
    onSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'id':
                    this.playerId = data.id;
                    this.updateDisplay();
                    break;
                    
                case 'players':
                    this.updatePlayerList(data.players);
                    break;
                    
                default:
                    console.log('Unknown message type:', data);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    }
    
    onSocketClose(event) {
        console.log('Disconnected from server');
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
            this.connect();
        }, 5000);
    }
    
    onSocketError(error) {
        console.error('WebSocket error:', error);
    }
    
    updatePlayerList(players) {
        this.playerList.innerHTML = '<h3>Players Online</h3>';
        
        players.forEach(id => {
            const playerElement = document.createElement('div');
            playerElement.textContent = `Player ${id}`;
            playerElement.classList.add('player-entry');
            
            if (id == this.playerId) {
                playerElement.classList.add('current-player');
                playerElement.textContent += ' (You)';
            }
            
            this.playerList.appendChild(playerElement);
        });
    }
    
    updateDisplay() {
        // You could update any additional UI elements here
        document.getElementById('multiplayer-container').classList.add('connected');
    }
}

// Initialize the multiplayer client when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the multiplayer client
    window.multiplayerClient = new MultiplayerClient();
});