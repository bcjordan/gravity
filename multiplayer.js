// Multiplayer WebSocket Client
class MultiplayerClient {
    constructor() {
        this.playerId = null;
        this.socket = null;
        this.playerList = document.getElementById('player-list');
        this.gravityPoints = {};
        this.simulator = null;
        
        this.connect();
    }
    
    setSimulator(simulator) {
        this.simulator = simulator;
        
        // Set up mouse tracking to send updates
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('touchmove', this.handleTouchMove.bind(this));
    }
    
    handleMouseMove(event) {
        if (!this.socket || !this.playerId || !this.simulator) return;
        
        // Convert screen coordinates to normalized coordinates (-1 to 1)
        const normalized = {
            x: (event.clientX / window.innerWidth) * 2 - 1,
            y: -(event.clientY / window.innerHeight) * 2 + 1
        };
        
        // Convert normalized to world space
        const worldPos = {
            x: normalized.x * 400,
            y: normalized.y * 400
        };
        
        // Send position update to server
        this.sendPositionUpdate(worldPos);
    }
    
    handleTouchMove(event) {
        if (!this.socket || !this.playerId || !this.simulator) return;
        event.preventDefault();
        
        const touch = event.touches[0];
        
        // Convert screen coordinates to normalized coordinates (-1 to 1)
        const normalized = {
            x: (touch.clientX / window.innerWidth) * 2 - 1,
            y: -(touch.clientY / window.innerHeight) * 2 + 1
        };
        
        // Convert normalized to world space
        const worldPos = {
            x: normalized.x * 400,
            y: normalized.y * 400
        };
        
        // Send position update to server
        this.sendPositionUpdate(worldPos);
    }
    
    sendPositionUpdate(position) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'updatePosition',
                position: position
            }));
        }
    }
    
    sendParamsUpdate(params) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'updateParams',
                params: params
            }));
        }
    }
    
    connect() {
        // Use WebSocket protocol for client
        const host = window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        
        // For local development use port 3001, for production use port 3001 explicitly
        const port = ':3001';
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
                    
                case 'allGravityPoints':
                    this.updateGravityPoints(data.points);
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
    
    updateGravityPoints(points) {
        this.gravityPoints = points;
        
        // If we have a simulator reference, update its external gravity points
        if (this.simulator) {
            this.simulator.updateMultiplayerGravityPoints(points, this.playerId);
        }
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