// Multiplayer WebSocket Client
class MultiplayerClient {
    constructor() {
        this.playerId = null;
        this.socket = null;
        this.messageInput = document.getElementById('message-input');
        this.messageLog = document.getElementById('message-log');
        this.playerList = document.getElementById('player-list');
        
        this.connect();
        this.setupEventListeners();
    }
    
    connect() {
        // Use WebSocket protocol for client
        const host = window.location.hostname;
        const wsUrl = `ws://${host}:3001`;
        
        // Create WebSocket connection
        this.socket = new WebSocket(wsUrl);
        
        // Set up event handlers
        this.socket.onopen = this.onSocketOpen.bind(this);
        this.socket.onmessage = this.onSocketMessage.bind(this);
        this.socket.onclose = this.onSocketClose.bind(this);
        this.socket.onerror = this.onSocketError.bind(this);
    }
    
    onSocketOpen(event) {
        this.addSystemMessage('Connected to server');
    }
    
    onSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'id':
                    this.playerId = data.id;
                    this.addSystemMessage(`You joined as Player ${this.playerId}`);
                    break;
                    
                case 'players':
                    this.updatePlayerList(data.players);
                    break;
                    
                case 'allMessages':
                    this.updateAllMessages(data.messages);
                    break;
                    
                default:
                    console.log('Unknown message type:', data);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    }
    
    onSocketClose(event) {
        this.addSystemMessage('Disconnected from server');
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
            this.connect();
        }, 5000);
    }
    
    onSocketError(error) {
        console.error('WebSocket error:', error);
        this.addSystemMessage('Connection error occurred');
    }
    
    sendMessage(text) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.playerId) {
            const message = {
                type: 'message',
                playerId: this.playerId,
                text: text
            };
            
            this.socket.send(JSON.stringify(message));
        } else {
            this.addSystemMessage('Cannot send message: not connected');
        }
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
    
    updateAllMessages(messages) {
        // Clear existing messages first
        this.messageLog.innerHTML = '<h3>Messages</h3>';
        
        // Add all messages to the log
        for (const playerId in messages) {
            const messageText = messages[playerId];
            this.addPlayerMessage(playerId, messageText);
        }
    }
    
    addPlayerMessage(playerId, text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('player-message');
        
        const playerSpan = document.createElement('span');
        playerSpan.classList.add('player-id');
        playerSpan.textContent = `Player ${playerId}:`;
        
        if (playerId == this.playerId) {
            playerSpan.classList.add('current-player');
            messageElement.classList.add('own-message');
        }
        
        messageElement.appendChild(playerSpan);
        messageElement.appendChild(document.createTextNode(' ' + text));
        
        this.messageLog.appendChild(messageElement);
        this.scrollToBottom();
    }
    
    addSystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('system-message');
        messageElement.textContent = text;
        
        this.messageLog.appendChild(messageElement);
        this.scrollToBottom();
    }
    
    scrollToBottom() {
        this.messageLog.scrollTop = this.messageLog.scrollHeight;
    }
    
    setupEventListeners() {
        // Handle message input
        this.messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const text = this.messageInput.value.trim();
                
                if (text.startsWith('/')) {
                    // Remove the slash and send the message
                    const messageText = text.slice(1);
                    if (messageText) {
                        this.sendMessage(messageText);
                        this.messageInput.value = '';
                    }
                }
            }
        });
    }
}

// Initialize the multiplayer client when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the multiplayer client
    window.multiplayerClient = new MultiplayerClient();
});