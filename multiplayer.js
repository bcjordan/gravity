// Multiplayer WebSocket Client with server-authoritative physics
class MultiplayerClient {
    constructor() {
        this.playerId = null;
        this.socket = null;
        this.playerList = document.getElementById('player-list');
        this.players = {};
        this.simulator = null;
        
        // Server simulation state
        this.serverParticles = [];
        this.receivedServerState = false;
        this.interpolationBuffer = [];
        this.serverTime = 0;
        
        // Performance metrics
        this.perfMetrics = {
            physicsTime: 0,
            avgPhysicsTime: 0,
            particleCount: 0,
            playerCount: 0,
            networkLatency: 0,
            avgNetworkLatency: 0,
            messageCount: 0
        };
        
        this.connect();
        
        // Add toggle for server physics
        this.addServerPhysicsToggle();
        
        // Add performance monitor UI
        this.addPerformanceMonitor();
    }
    
    addServerPhysicsToggle() {
        // Create toggle element
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'physics-toggle';
        
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'server-physics-toggle';
        toggle.checked = true; // Start with server physics enabled
        
        const label = document.createElement('label');
        label.htmlFor = 'server-physics-toggle';
        label.textContent = 'Server Physics (Slower/Bigger)';
        
        toggleContainer.appendChild(toggle);
        toggleContainer.appendChild(label);
        
        // Add to the multiplayer container
        document.getElementById('multiplayer-container').appendChild(toggleContainer);
        
        // Set up event listener
        toggle.addEventListener('change', (e) => {
            const useServerPhysics = e.target.checked;
            
            if (this.simulator) {
                this.simulator.setUseServerPhysics(useServerPhysics);
            }
        });
    }
    
    setSimulator(simulator) {
        this.simulator = simulator;
        
        // Set initial server physics state
        const useServerPhysics = document.getElementById('server-physics-toggle').checked;
        this.simulator.setUseServerPhysics(useServerPhysics);
        
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
                    
                case 'playerUpdate':
                    this.updatePlayer(data.playerId, data.data);
                    break;
                    
                case 'particleUpdate':
                    // Calculate network latency
                    const receiveTime = Date.now();
                    
                    // Store the server particles for rendering
                    this.serverParticles = data.particles;
                    this.serverTime = data.time;
                    this.receivedServerState = true;
                    
                    // Add to interpolation buffer
                    this.interpolationBuffer.push({
                        particles: data.particles,
                        time: data.time,
                        timestamp: receiveTime
                    });
                    
                    // Limit buffer size
                    if (this.interpolationBuffer.length > 5) {
                        this.interpolationBuffer.shift();
                    }
                    
                    // Update client display
                    if (this.simulator) {
                        this.simulator.updateServerParticles(this.serverParticles);
                    }
                    
                    // Update performance metrics if provided
                    if (data.metrics) {
                        this.updatePerformanceMetrics(data.metrics, receiveTime);
                    }
                    break;
                    
                case 'fullState':
                    // Calculate network latency
                    const fullStateReceiveTime = Date.now();
                    
                    // Handle full state update
                    this.serverParticles = data.state.particles;
                    this.players = data.state.players;
                    this.serverTime = data.state.simulationTime;
                    this.receivedServerState = true;
                    
                    // Clear interpolation buffer and add new state
                    this.interpolationBuffer = [{
                        particles: data.state.particles,
                        time: data.state.simulationTime,
                        timestamp: fullStateReceiveTime
                    }];
                    
                    // Update the client display
                    if (this.simulator) {
                        this.simulator.updateServerParticles(this.serverParticles);
                        this.simulator.updateMultiplayerGravityPoints(this.players, this.playerId);
                    }
                    
                    // Update performance metrics if provided
                    if (data.metrics) {
                        this.updatePerformanceMetrics(data.metrics, fullStateReceiveTime);
                    }
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
    
    updatePlayer(playerId, data) {
        // Update player data
        if (!this.players[playerId]) {
            this.players[playerId] = {};
        }
        
        // Update with new data
        Object.assign(this.players[playerId], data);
        
        // Update simulator if available
        if (this.simulator) {
            this.simulator.updateMultiplayerGravityPoints(this.players, this.playerId);
        }
    }
    
    getInterpolatedParticles() {
        if (this.interpolationBuffer.length < 2) {
            return this.serverParticles;
        }
        
        const now = Date.now();
        const targetTime = now - 50; // Interpolate 50ms behind for smoothness
        
        // Find the two states to interpolate between
        let state1 = this.interpolationBuffer[0];
        let state2 = this.interpolationBuffer[1];
        
        for (let i = 1; i < this.interpolationBuffer.length; i++) {
            if (this.interpolationBuffer[i].timestamp > targetTime) {
                state1 = this.interpolationBuffer[i - 1];
                state2 = this.interpolationBuffer[i];
                break;
            }
        }
        
        // Calculate interpolation factor (0 to 1)
        const timeDiff = state2.timestamp - state1.timestamp;
        if (timeDiff <= 0) return state2.particles;
        
        const factor = Math.max(0, Math.min(1, (targetTime - state1.timestamp) / timeDiff));
        
        // Interpolate between states
        return state1.particles.map((p1, index) => {
            const p2 = state2.particles[index];
            return {
                x: p1.x + (p2.x - p1.x) * factor,
                y: p1.y + (p2.y - p1.y) * factor
            };
        });
    }
    
    updateDisplay() {
        // You could update any additional UI elements here
        document.getElementById('multiplayer-container').classList.add('connected');
    }
    
    // Check if we've received any server state yet
    hasReceivedServerState() {
        return this.receivedServerState;
    }
    
    // Add performance monitor UI element
    addPerformanceMonitor() {
        // Create container
        const perfContainer = document.createElement('div');
        perfContainer.className = 'perf-monitor';
        perfContainer.id = 'perf-monitor';
        perfContainer.innerHTML = `
            <h3>Server Performance</h3>
            <div class="metrics">
                <div>Physics Time: <span id="physics-time">0.00</span> ms</div>
                <div>Avg Physics: <span id="avg-physics">0.00</span> ms</div>
                <div>Particles: <span id="particle-count">0</span></div>
                <div>Players: <span id="player-count">0</span></div>
                <div>Latency: <span id="network-latency">0</span> ms</div>
            </div>
        `;
        
        // Add to multiplayer container
        document.getElementById('multiplayer-container').appendChild(perfContainer);
        
        // Update metrics every 500ms
        setInterval(() => this.updatePerformanceDisplay(), 500);
    }
    
    // Update performance display
    updatePerformanceDisplay() {
        if (!this.receivedServerState) return;
        
        // Update UI elements with current metrics
        document.getElementById('physics-time').textContent = this.perfMetrics.physicsTime.toFixed(2);
        document.getElementById('avg-physics').textContent = this.perfMetrics.avgPhysicsTime.toFixed(2);
        document.getElementById('particle-count').textContent = this.perfMetrics.particleCount;
        document.getElementById('player-count').textContent = this.perfMetrics.playerCount;
        document.getElementById('network-latency').textContent = this.perfMetrics.networkLatency.toFixed(0);
    }
    
    // Update performance metrics from server data
    updatePerformanceMetrics(metrics, receiveTime) {
        // Update server-side metrics
        this.perfMetrics.physicsTime = metrics.physicsTime;
        this.perfMetrics.avgPhysicsTime = metrics.avgPhysicsTime;
        this.perfMetrics.particleCount = metrics.particleCount;
        this.perfMetrics.playerCount = metrics.playerCount;
        
        // Calculate network latency (time between server sending and client receiving)
        // We need to account for any clock offset between client and server
        // For simplicity, we'll just use the transport time which is an approximation
        const latency = Date.now() - receiveTime;
        
        // Update message count and network latency
        this.perfMetrics.messageCount++;
        this.perfMetrics.networkLatency = latency;
        
        // Update moving average of network latency
        if (!this.perfMetrics.avgNetworkLatency) {
            this.perfMetrics.avgNetworkLatency = latency;
        } else {
            this.perfMetrics.avgNetworkLatency = 
                0.9 * this.perfMetrics.avgNetworkLatency + 0.1 * latency;
        }
    }
}

// Initialize the multiplayer client when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the multiplayer client
    window.multiplayerClient = new MultiplayerClient();
});