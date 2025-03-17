// Simplified server-side physics for gravitational lensing
class ServerPhysicsSimulation {
    constructor(options = {}) {
        // Configuration
        this.options = {
            particleCount: options.particleCount || 2000, // Much fewer particles on server
            particleSpread: options.particleSpread || 800,
            initialSpeed: options.initialSpeed || 5.0,
            velocityDamping: options.velocityDamping || 0.98,
            gravityStrength: options.gravityStrength || 1.0,
            updateRate: options.updateRate || 30, // Updates per second
            maxPlayers: options.maxPlayers || 20,
            prismRadius: options.prismRadius || 50
        };
        
        // Simulation state
        this.particles = [];
        this.velocities = [];
        this.players = {};
        this.running = false;
        this.updateInterval = null;
        this.simulationTime = 0;
        
        // Initialize particles
        this.initParticles();
    }
    
    initParticles() {
        this.particles = [];
        this.velocities = [];
        
        for (let i = 0; i < this.options.particleCount; i++) {
            // Random position in a 2D circle
            let radius, theta;
            
            // Distribute particles similar to the client-side simulation
            if (Math.random() < 0.7) {
                // 70% of particles outside a central area
                radius = this.options.prismRadius * 0.5 + this.options.particleSpread * Math.sqrt(Math.random() * 0.8);
            } else {
                // 30% of particles inside central area
                radius = this.options.prismRadius * Math.sqrt(Math.random());
            }
            
            theta = Math.random() * Math.PI * 2;
            
            // Create particle position
            const particle = {
                x: radius * Math.cos(theta),
                y: radius * Math.sin(theta)
            };
            
            // Create initial velocity (tangential for orbital motion)
            let vx, vy;
            
            if (radius > 0.1) {
                // Calculate perpendicular vector for orbital motion
                const perpX = -particle.y / radius;
                const perpY = particle.x / radius;
                
                // Apply orbital velocity with some randomization
                const speed = this.options.initialSpeed * (0.8 + Math.random() * 0.4);
                vx = perpX * speed;
                vy = perpY * speed;
            } else {
                // Random velocity for particles near center
                vx = Math.random() * this.options.initialSpeed - this.options.initialSpeed/2;
                vy = Math.random() * this.options.initialSpeed - this.options.initialSpeed/2;
            }
            
            // Store position and velocity
            this.particles.push(particle);
            this.velocities.push({ x: vx, y: vy });
        }
    }
    
    addPlayer(playerId, initialParams = {}) {
        // Set default player gravity parameters with stronger effects
        this.players[playerId] = {
            position: initialParams.position || { x: 0, y: 0 },
            gravityStrength: initialParams.gravityStrength || this.options.gravityStrength * 1.5,
            prismRadius: initialParams.prismRadius || this.options.prismRadius,
            lensingStrength: initialParams.lensingStrength || 3.0,   // Much stronger lensing
            prismStrength: initialParams.prismStrength || 2.0        // Added prism strength
        };
        
        return this.players[playerId];
    }
    
    removePlayer(playerId) {
        if (this.players[playerId]) {
            delete this.players[playerId];
            return true;
        }
        return false;
    }
    
    updatePlayerPosition(playerId, position) {
        if (this.players[playerId]) {
            this.players[playerId].position = position;
            return true;
        }
        return false;
    }
    
    updatePlayerParams(playerId, params) {
        if (this.players[playerId]) {
            Object.assign(this.players[playerId], params);
            return true;
        }
        return false;
    }
    
    updatePhysics(deltaTime) {
        // Adjust gravity strength based on framerate
        const timeScale = Math.min(deltaTime / (1000/60), 2.0); // Cap at 2x normal strength
        
        // Update each particle
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const velocity = this.velocities[i];
            
            // Apply weak gravity toward center of simulation (stable orbits)
            const toCenterX = -particle.x;
            const toCenterY = -particle.y;
            const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
            
            if (centerDist > 1.0) {
                const centralForce = 0.01 * this.options.gravityStrength / (centerDist * centerDist) * timeScale;
                velocity.x += toCenterX / centerDist * centralForce;
                velocity.y += toCenterY / centerDist * centralForce;
            }
            
            // Apply each player's gravity
            for (const playerId in this.players) {
                const player = this.players[playerId];
                
                // Vector from particle to player gravity point
                const toPlayerX = player.position.x - particle.x;
                const toPlayerY = player.position.y - particle.y;
                const playerDist = Math.sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY);
                
                if (playerDist > 0.1) {
                    // Apply gravitational force based on player's gravity strength
                    const gravityForce = player.gravityStrength / Math.max(playerDist * 0.1, 0.5) * timeScale;
                    
                    // Apply lensing effect
                    const lensingForce = player.lensingStrength / Math.max(playerDist * 0.05, 0.1) * timeScale;
                    
                    // Combined force
                    const totalForce = gravityForce + lensingForce;
                    
                    // Normalize and apply force
                    const norm = 1 / playerDist;
                    velocity.x += toPlayerX * norm * totalForce;
                    velocity.y += toPlayerY * norm * totalForce;
                    
                    // Simplified prism effect for particles near player's prism
                    if (playerDist < player.prismRadius * 1.5) {
                        // Either pushing out from center or pulling in from edge
                        let prismForce;
                        
                        if (playerDist < player.prismRadius) {
                            // Inside prism - push outward with much stronger effect
                            const normalizedDist = playerDist / player.prismRadius;
                            // Use player's prismStrength if available
                            const strength = player.prismStrength || 2.0;
                            prismForce = 0.2 * normalizedDist * timeScale * strength;
                            
                            // Apply force against gravity direction
                            velocity.x -= toPlayerX * norm * prismForce;
                            velocity.y -= toPlayerY * norm * prismForce;
                        }
                    }
                }
            }
            
            // Apply velocity damping
            velocity.x *= Math.pow(this.options.velocityDamping, timeScale);
            velocity.y *= Math.pow(this.options.velocityDamping, timeScale);
            
            // Update position based on velocity
            particle.x += velocity.x * timeScale;
            particle.y += velocity.y * timeScale;
            
            // Boundary check - wrap particles that go too far away
            const maxDistance = this.options.particleSpread * 2;
            const distanceFromCenter = Math.sqrt(particle.x * particle.x + particle.y * particle.y);
            
            if (distanceFromCenter > maxDistance) {
                // Reset particle to a new position with orbital velocity
                if (Math.random() < 0.3) {
                    // New position on a random point of the circle
                    const newRadius = this.options.particleSpread * Math.sqrt(Math.random());
                    const newAngle = Math.random() * Math.PI * 2;
                    
                    // Set new position
                    particle.x = newRadius * Math.cos(newAngle);
                    particle.y = newRadius * Math.sin(newAngle);
                    
                    // Calculate orbital velocity at this radius
                    const perpX = -particle.y / newRadius;
                    const perpY = particle.x / newRadius;
                    const speed = this.options.initialSpeed * (0.8 + Math.random() * 0.4);
                    
                    // Set new velocity (orbital motion)
                    velocity.x = perpX * speed;
                    velocity.y = perpY * speed;
                } 
                // Bounce off an invisible boundary
                else {
                    // Normalize the position vector to the edge
                    const factor = maxDistance / distanceFromCenter;
                    particle.x = particle.x * factor * 0.9;
                    particle.y = particle.y * factor * 0.9;
                    
                    // Reflect velocity (bounce off the boundary)
                    const normalX = -particle.x / distanceFromCenter;
                    const normalY = -particle.y / distanceFromCenter;
                    
                    // Calculate dot product of velocity and normal
                    const dot = velocity.x * normalX + velocity.y * normalY;
                    
                    // Reflect velocity with some energy loss
                    velocity.x = (velocity.x - 2 * dot * normalX) * 0.5;
                    velocity.y = (velocity.y - 2 * dot * normalY) * 0.5;
                }
            }
        }
        
        // Increment simulation time
        this.simulationTime += deltaTime;
    }
    
    startSimulation() {
        if (this.running) return;
        
        this.running = true;
        let lastUpdateTime = Date.now();
        
        // Start update loop
        this.updateInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = now - lastUpdateTime;
            
            // Update physics
            this.updatePhysics(deltaTime);
            
            // Update timestamp
            lastUpdateTime = now;
        }, 1000 / this.options.updateRate);
    }
    
    stopSimulation() {
        if (!this.running) return;
        
        this.running = false;
        clearInterval(this.updateInterval);
        this.updateInterval = null;
    }
    
    getState() {
        // Return current state of simulation
        return {
            particles: this.particles,
            players: this.players,
            simulationTime: this.simulationTime
        };
    }
    
    resetSimulation() {
        this.stopSimulation();
        this.initParticles();
        this.simulationTime = 0;
        this.startSimulation();
    }
}

export default ServerPhysicsSimulation;