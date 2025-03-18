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
        this.colors = [];
        
        // Use the current particle count from options (which may have been updated)
        const count = this.options.particleCount;
        
        for (let i = 0; i < count; i++) {
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
            
            // Generate random RGB color components
            const color = {
                r: Math.random(),
                g: Math.random(),
                b: Math.random()
            };
            
            // Store position, velocity, and color
            this.particles.push(particle);
            this.velocities.push({ x: vx, y: vy });
            this.colors.push(color);
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
            const color = this.colors[i];
            
            // For each player, calculate color-based prismatic forces
            Object.values(this.players).forEach(player => {
                const toCenterX = player.position.x - particle.x;
                const toCenterY = player.position.y - particle.y;
                const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
                
                if (centerDist < player.prismRadius * 1.5) {
                    const dirX = toCenterX / centerDist;
                    const dirY = toCenterY / centerDist;
                    
                    let dispersionForce;
                    if (centerDist < player.prismRadius) {
                        // Inside prism - dispersive force pushing outward
                        const normalizedDist = centerDist / player.prismRadius;
                        dispersionForce = player.prismStrength * 2.0 * normalizedDist;
                    } else {
                        // Outside but near - lensing effect
                        const outsideDistance = centerDist - player.prismRadius;
                        const falloff = Math.max(0, 1 - outsideDistance / (player.prismRadius * 0.5));
                        dispersionForce = -player.prismStrength * 0.5 * falloff;
                    }
                    
                    // Color-dependent dispersion effect
                    const dispersionMultiplier = player.lensingStrength * 1.5;
                    
                    // Each color component affects motion differently
                    const rForce = dispersionForce * (1.0 - dispersionMultiplier * 0.8);
                    const gForce = dispersionForce;
                    const bForce = dispersionForce * (1.0 + dispersionMultiplier * 1.0);
                    
                    // Calculate dominant force based on particle color
                    const redDominance = color.r / Math.max(0.01, Math.max(color.g, color.b));
                    const greenDominance = color.g / Math.max(0.01, Math.max(color.r, color.b));
                    const blueDominance = color.b / Math.max(0.01, Math.max(color.r, color.g));
                    
                    let dominantForce;
                    let perpX = 0, perpY = 0;
                    
                    if (redDominance > 1.3) {
                        dominantForce = rForce * 0.3;
                        perpX = -dirY * 0.6 * player.lensingStrength;
                        perpY = dirX * 0.6 * player.lensingStrength;
                    } else if (greenDominance > 1.3) {
                        dominantForce = gForce * 0.6;
                        perpX = (-dirY * 0.7 + dirX * 0.3) * 0.3 * player.lensingStrength;
                        perpY = (dirX * 0.7 + dirY * 0.3) * 0.3 * player.lensingStrength;
                    } else if (blueDominance > 1.3) {
                        dominantForce = bForce * 1.5;
                        perpX = dirY * 0.7 * player.lensingStrength;
                        perpY = -dirX * 0.7 * player.lensingStrength;
                    } else {
                        const colorSum = color.r + color.g + color.b;
                        dominantForce = (color.r * rForce + color.g * gForce + color.b * bForce) / Math.max(0.1, colorSum);
                        const perpFactor = 0.3 * player.lensingStrength * (Math.random() - 0.5);
                        perpX = dirY * perpFactor;
                        perpY = -dirX * perpFactor;
                    }
                    
                    // Apply forces with jitter
                    const jitter = (Math.random() * 0.5 - 0.25) * dispersionForce * player.lensingStrength;
                    velocity.x -= (dirX * (dominantForce + jitter) - perpX) * timeScale;
                    velocity.y -= (dirY * (dominantForce + jitter) - perpY) * timeScale;
                }
            });
            
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
                    
                    // Enhanced prism effect for particles near player's prism
                    if (playerDist < player.prismRadius * 1.5) {
                        // Either pushing out from center or pulling in from edge
                        let prismForce;
                        
                        if (playerDist < player.prismRadius) {
                            // Inside prism - push outward with much stronger effect
                            const normalizedDist = playerDist / player.prismRadius;
                            // Use player's prismStrength if available
                            const strength = player.prismStrength || 2.0;
                            
                            // Dramatically enhanced color-based dispersion physics for server
                            // Simulation will assign "virtual colors" to particles for physics calculations
                            
                            // Get or assign a "virtual color" for this particle
                            // We'll use a deterministic approach based on particle index
                            if (!this.particleVirtualColors) {
                                // Initialize array of "virtual colors" for particles
                                this.particleVirtualColors = new Array(this.particles.length);
                                for (let j = 0; j < this.particles.length; j++) {
                                    // Assign one of 6 "color types" to each particle
                                    // 0-1: Reds, 2-3: Greens, 4-5: Blues
                                    this.particleVirtualColors[j] = Math.floor(Math.random() * 6);
                                }
                            }
                            
                            // Get this particle's virtual color (or assign one if it doesn't exist)
                            const virtualColor = this.particleVirtualColors[i] || 
                                                (this.particleVirtualColors[i] = Math.floor(Math.random() * 6));
                            
                            const dispersionStrength = player.prismDispersion || 3.0;
                            let colorFactor = 1.0;
                            let perpFactor = 0;
                            let perpSign = 1;
                            
                            // Apply different physics based on "virtual color"
                            if (virtualColor < 2) {
                                // "Red" particles - less radial force, more perpendicular motion
                                colorFactor = 0.7 - (dispersionStrength * 0.15);
                                perpFactor = 0.6 * dispersionStrength * timeScale;
                                perpSign = -1; // Counter-clockwise motion
                            } 
                            else if (virtualColor < 4) {
                                // "Green" particles - medium effects
                                colorFactor = 1.0;
                                perpFactor = 0.3 * dispersionStrength * timeScale;
                                perpSign = (Math.random() < 0.5 ? -1 : 1); // Random direction
                            }
                            else {
                                // "Blue" particles - stronger radial force, strong perpendicular motion
                                colorFactor = 1.3 + (dispersionStrength * 0.2);
                                perpFactor = 0.7 * dispersionStrength * timeScale;
                                perpSign = 1; // Clockwise motion
                            }
                            
                            // Strengthen the overall effect significantly
                            const effectMultiplier = strength * 1.5; // Higher multiplier for stronger effect
                            
                            // Calculate base prism force
                            prismForce = normalizedDist * timeScale * effectMultiplier * colorFactor;
                            
                            // Apply force against gravity direction (scaled by color)
                            velocity.x -= toPlayerX * norm * prismForce;
                            velocity.y -= toPlayerY * norm * prismForce;
                            
                            // Add perpendicular force for dramatic rainbow-like separation
                            const perpX = -toPlayerY * norm * perpSign;
                            const perpY = toPlayerX * norm * perpSign;
                            
                            // Apply perpendicular force (much stronger)
                            const perpStrength = Math.abs(prismForce) * perpFactor * effectMultiplier;
                            velocity.x += perpX * perpStrength;
                            velocity.y += perpY * perpStrength;
                            
                            // Add some randomness to create a more natural dispersion effect
                            const jitterStrength = prismForce * 0.4 * dispersionStrength;
                            velocity.x += (Math.random() - 0.5) * jitterStrength; 
                            velocity.y += (Math.random() - 0.5) * jitterStrength;
                        } else {
                            // Outside but near the prism - subtle lensing effect
                            const outsideDistance = playerDist - player.prismRadius;
                            const falloff = Math.max(0, 1 - outsideDistance / (player.prismRadius * 0.5));
                            prismForce = -0.1 * player.prismStrength * falloff * timeScale;
                            
                            // Apply gentle inward force with randomization
                            velocity.x += toPlayerX * norm * prismForce * (0.8 + Math.random() * 0.4);
                            velocity.y += toPlayerY * norm * prismForce * (0.8 + Math.random() * 0.4);
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