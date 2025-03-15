// Fireworks Designer Simulation
import * as THREE from 'three';

class FireworksSimulator {
    constructor() {
        this.particles = [];
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particleSystem = null;
        this.mousePosition = new THREE.Vector2(0, 0);
        this.lastClick = new THREE.Vector2(0, 0);
        this.isMouseDown = false;
        this.lastLaunchTime = 0;
        this.fireworks = [];
        
        // Default configuration parameters
        this.config = {
            particleCount: 15000,
            particleSize: 3.0,
            particleOpacity: 0.8,
            gravity: 0.05,
            friction: 0.98,
            explosionForce: 3.0,
            launchForce: 6.0,
            trailEffect: true,
            colorMode: 'rainbow',
            launchOnClick: true,
            autoLaunch: true,
            autoLaunchInterval: 2000, // ms
            
            // Chemical reaction parameters
            enableReactions: true,
            reactionRadius: 5.0,
            reactionProbability: 0.3,
            sparkleEffect: true,
            
            // Particle types
            chemicalTypes: [
                { name: 'Strontium', color: '#ff0000', trailLength: 30, reactsWith: ['Copper'] }, // Red
                { name: 'Copper', color: '#0000ff', trailLength: 20, reactsWith: ['Sodium'] },    // Blue
                { name: 'Sodium', color: '#ffff00', trailLength: 15, reactsWith: ['Strontium'] }, // Yellow
                { name: 'Barium', color: '#00ff00', trailLength: 25, reactsWith: ['Potassium'] }, // Green
                { name: 'Potassium', color: '#800080', trailLength: 18, reactsWith: ['Barium'] }  // Purple
            ],
            
            // Firework designs
            patterns: [
                { name: 'Spherical', function: (angle) => 1 },
                { name: 'Heart', function: (angle) => 1 - Math.sin(angle) * Math.sqrt(Math.abs(Math.cos(angle))) / (Math.sin(angle) + 1.4) },
                { name: 'Star', function: (angle) => 1 + 0.5 * Math.cos(angle * 5) },
                { name: 'Ring', function: (angle) => 1.5 + Math.random() * 0.1 },
                { name: 'Spiral', function: (angle) => angle / 10 }
            ],
            selectedPattern: 0,
            
            resetSimulation: () => this.resetParticles()
        };
        
        // Initialize the simulation
        this.init();
        this.setupGUI();
        this.animate();
    }
    
    init() {
        // Create the scene with a dark blue-black gradient background for night sky
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);
        
        // Set up the camera - orthographic for true 2D view
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 1000;
        
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            2000
        );
        this.camera.position.z = 1000;
        
        // Create the WebGL renderer with post-processing support
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('canvas'),
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            const aspect = window.innerWidth / window.innerHeight;
            const frustumSize = 1000;
            
            this.camera.left = frustumSize * aspect / -2;
            this.camera.right = frustumSize * aspect / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = frustumSize / -2;
            
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Track mouse position for launching fireworks
        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        
        // Track mouse clicks for launching fireworks
        window.addEventListener('mousedown', (event) => {
            this.isMouseDown = true;
            this.lastClick.x = this.mousePosition.x * 500; // Convert to world coordinates
            this.lastClick.y = this.mousePosition.y * 400;
            
            if (this.config.launchOnClick) {
                this.launchFirework(this.lastClick.x, this.lastClick.y);
            }
        });
        
        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });
        
        // Initialize particles
        this.createParticleSystem();
    }
    
    createParticleSystem() {
        // Clean up existing particle system if it exists
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem.geometry.dispose();
            this.particleSystem.material.dispose();
        }
        
        // Create particle geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.config.particleCount * 3);
        const colors = new Float32Array(this.config.particleCount * 3);
        const sizes = new Float32Array(this.config.particleCount);
        const types = new Float32Array(this.config.particleCount);
        const lifetimes = new Float32Array(this.config.particleCount);
        
        // Create our array to track particle velocities
        this.velocities = new Float32Array(this.config.particleCount * 3);
        this.trails = [];
        
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // Start particles off-screen (inactive)
            positions[i3] = 0;
            positions[i3 + 1] = -1000; // Below the screen
            positions[i3 + 2] = 0;
            
            // Initialize with zero velocity
            this.velocities[i3] = 0;
            this.velocities[i3 + 1] = 0;
            this.velocities[i3 + 2] = 0;
            
            // Random particle sizes (smaller for more realism)
            sizes[i] = Math.random() * 2 + 1;
            
            // Set random chemical type
            types[i] = Math.floor(Math.random() * this.config.chemicalTypes.length);
            
            // Get color from the chemical type
            const chemicalType = this.config.chemicalTypes[Math.floor(types[i])];
            const color = new THREE.Color(chemicalType.color);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            // Initialize lifetime (will be set properly when particle becomes active)
            lifetimes[i] = 0;
            
            // Initialize empty trail for each particle
            this.trails.push([]);
        }
        
        // Set attributes for the geometry
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Store custom attributes for later use
        this.particleTypes = types;
        this.particleLifetimes = lifetimes;
        
        // Create particle texture with a glowing dot
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 240, 220, 0.8)');
        gradient.addColorStop(0.4, 'rgba(240, 180, 110, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        
        const sprite = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.PointsMaterial({
            size: this.config.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: this.config.particleOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: sprite,
            sizeAttenuation: true
        });
        
        // Create the particle system
        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }
    
    launchFirework(x, y) {
        // Check if we have available particles
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        
        // Don't launch too frequently
        const now = Date.now();
        if (now - this.lastLaunchTime < 300) {
            return;
        }
        this.lastLaunchTime = now;
        
        // Number of particles in the firework
        const particleCount = 1; // Just the shell initially
        let availableCount = 0;
        let startIndex = -1;
        
        // Find available particles
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            if (positions[i3 + 1] < -500) { // If the particle is inactive (below screen)
                if (startIndex === -1) {
                    startIndex = i; // Mark the first available particle
                }
                availableCount++;
                if (availableCount >= particleCount) {
                    break;
                }
            }
        }
        
        if (availableCount >= particleCount && startIndex !== -1) {
            // Calculate a random launch angle (slightly randomized from straight up)
            const launchAngle = Math.PI/2 + (Math.random() * 0.2 - 0.1);
            
            // Create the firework shell particle
            const i3 = startIndex * 3;
            
            // Start at bottom of screen with random x position if none provided
            positions[i3] = x !== undefined ? x : (Math.random() * 800 - 400);
            positions[i3 + 1] = -400; // Bottom of screen
            positions[i3 + 2] = 0;
            
            // Random chemical type for this firework
            const typeIndex = Math.floor(Math.random() * this.config.chemicalTypes.length);
            this.particleTypes[startIndex] = typeIndex;
            
            // Set the color based on chemical type
            const chemicalType = this.config.chemicalTypes[typeIndex];
            const color = new THREE.Color(chemicalType.color);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            // Initial upward velocity
            this.velocities[i3] = Math.cos(launchAngle) * this.config.launchForce * (0.8 + Math.random() * 0.4);
            this.velocities[i3 + 1] = Math.sin(launchAngle) * this.config.launchForce * (0.8 + Math.random() * 0.4);
            this.velocities[i3 + 2] = 0;
            
            // Set lifetime - shell particle lives until it explodes
            this.particleLifetimes[startIndex] = 60 + Math.random() * 40; // Random height for explosion
            
            // Store the firework info for later explosion
            this.fireworks.push({
                particleIndex: startIndex,
                type: typeIndex,
                pattern: this.config.selectedPattern
            });
            
            // Update attributes that have changed
            this.particleSystem.geometry.attributes.position.needsUpdate = true;
            this.particleSystem.geometry.attributes.color.needsUpdate = true;
        }
    }
    
    explodeFirework(fireworkIndex) {
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        const sizes = this.particleSystem.geometry.attributes.size.array;
        
        const firework = this.fireworks[fireworkIndex];
        const shellIndex = firework.particleIndex;
        const shellIndex3 = shellIndex * 3;
        
        // Get the position where the shell exploded
        const explosionX = positions[shellIndex3];
        const explosionY = positions[shellIndex3 + 1];
        
        // Number of particles in the explosion
        const explosionSize = 100 + Math.floor(Math.random() * 150);
        let availableCount = 0;
        let startIndex = -1;
        
        // Find available particles
        for (let i = 0; i < this.config.particleCount; i++) {
            if (i === shellIndex) continue; // Skip the shell particle
            
            const i3 = i * 3;
            if (positions[i3 + 1] < -500) { // If the particle is inactive
                if (startIndex === -1) {
                    startIndex = i;
                }
                availableCount++;
                if (availableCount >= explosionSize) {
                    break;
                }
            }
        }
        
        // Create the explosion if we have enough particles
        if (availableCount >= explosionSize && startIndex !== -1) {
            // Get the pattern function
            const patternFunc = this.config.patterns[firework.pattern].function;
            
            // The chemical type of the shell determines explosion color
            const mainType = firework.type;
            const mainColor = new THREE.Color(this.config.chemicalTypes[mainType].color);
            
            // Create the explosion particles
            for (let i = 0; i < explosionSize; i++) {
                const particleIndex = startIndex + i;
                if (particleIndex >= this.config.particleCount) break;
                
                const i3 = particleIndex * 3;
                
                // All particles start at explosion center
                positions[i3] = explosionX;
                positions[i3 + 1] = explosionY;
                positions[i3 + 2] = 0;
                
                // Create explosion pattern
                // Random angle and distance based on pattern
                const angle = Math.random() * Math.PI * 2;
                const distance = patternFunc(angle) * this.config.explosionForce;
                
                // Set velocity based on pattern
                this.velocities[i3] = Math.cos(angle) * distance;
                this.velocities[i3 + 1] = Math.sin(angle) * distance;
                this.velocities[i3 + 2] = 0;
                
                // Randomize particle size
                sizes[particleIndex] = Math.random() * 2 + 1;
                
                // Determine chemical type - mostly same as shell, some random
                let particleType;
                if (Math.random() < 0.8) {
                    // 80% same as main type
                    particleType = mainType;
                } else {
                    // 20% random type
                    particleType = Math.floor(Math.random() * this.config.chemicalTypes.length);
                }
                this.particleTypes[particleIndex] = particleType;
                
                // Set color based on chemical type with some variation
                const baseColor = new THREE.Color(this.config.chemicalTypes[particleType].color);
                // Slightly randomize color for more natural look
                const color = new THREE.Color(
                    baseColor.r * (0.9 + Math.random() * 0.2),
                    baseColor.g * (0.9 + Math.random() * 0.2),
                    baseColor.b * (0.9 + Math.random() * 0.2)
                );
                
                colors[i3] = color.r;
                colors[i3 + 1] = color.g;
                colors[i3 + 2] = color.b;
                
                // Set lifetime for the particle
                this.particleLifetimes[particleIndex] = 30 + Math.random() * 50;
                
                // Clear any existing trails
                this.trails[particleIndex] = [];
            }
            
            // Deactivate the shell particle
            positions[shellIndex3 + 1] = -1000; // Move below screen
            this.particleLifetimes[shellIndex] = 0;
            
            // Update the attributes that changed
            this.particleSystem.geometry.attributes.position.needsUpdate = true;
            this.particleSystem.geometry.attributes.color.needsUpdate = true;
            this.particleSystem.geometry.attributes.size.needsUpdate = true;
        }
        
        // Remove the firework from our tracking array
        this.fireworks.splice(fireworkIndex, 1);
    }
    
    updateParticlePhysics() {
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        const sizes = this.particleSystem.geometry.attributes.size.array;
        
        // Check for fireworks that need to explode
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            const firework = this.fireworks[i];
            const particleIndex = firework.particleIndex;
            
            // Check if this shell's lifetime is over or velocity is negative (falling)
            if (this.particleLifetimes[particleIndex] <= 0 || 
                this.velocities[particleIndex * 3 + 1] < 0) {
                this.explodeFirework(i);
            }
        }
        
        // Auto-launch fireworks if enabled
        if (this.config.autoLaunch) {
            const now = Date.now();
            if (now - this.lastLaunchTime > this.config.autoLaunchInterval) {
                this.launchFirework();
            }
        }
        
        // Update all particle positions based on their velocities
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // Skip inactive particles
            if (positions[i3 + 1] < -500) continue;
            
            // Get the chemical type for this particle
            const typeIndex = this.particleTypes[i];
            const chemicalType = this.config.chemicalTypes[typeIndex];
            
            // Add to particle trail if enabled
            if (this.config.trailEffect && positions[i3 + 1] > -400) {
                // Create a copy of the current position
                this.trails[i].push({
                    x: positions[i3],
                    y: positions[i3 + 1],
                    z: positions[i3 + 2],
                    life: 10 // Lifetime of trail point
                });
                
                // Limit trail length based on chemical type
                if (this.trails[i].length > chemicalType.trailLength) {
                    this.trails[i].shift();
                }
            }
            
            // Apply gravity
            this.velocities[i3 + 1] -= this.config.gravity;
            
            // Apply air friction
            this.velocities[i3] *= this.config.friction;
            this.velocities[i3 + 1] *= this.config.friction;
            this.velocities[i3 + 2] *= this.config.friction;
            
            // Update position
            positions[i3] += this.velocities[i3];
            positions[i3 + 1] += this.velocities[i3 + 1];
            positions[i3 + 2] += this.velocities[i3 + 2];
            
            // Decrease lifetime
            this.particleLifetimes[i]--;
            
            // Handle chemical reactions if enabled
            if (this.config.enableReactions && Math.random() < this.config.reactionProbability * 0.1) {
                // Find nearby particles to react with
                for (let j = 0; j < this.config.particleCount; j++) {
                    if (i === j || positions[j * 3 + 1] < -500) continue; // Skip self or inactive particles
                    
                    const j3 = j * 3;
                    const dx = positions[i3] - positions[j3];
                    const dy = positions[i3 + 1] - positions[j3 + 1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    // If particles are close enough and can react
                    if (dist < this.config.reactionRadius) {
                        const otherTypeIndex = this.particleTypes[j];
                        const otherType = this.config.chemicalTypes[otherTypeIndex];
                        
                        // Check if these chemicals react
                        if (chemicalType.reactsWith.includes(otherType.name)) {
                            // Create a new color - blend between the two
                            const color1 = new THREE.Color(chemicalType.color);
                            const color2 = new THREE.Color(otherType.color);
                            const newColor = new THREE.Color();
                            
                            // Weighted color blend based on sparkle effect
                            if (this.config.sparkleEffect && Math.random() < 0.5) {
                                // Bright white flash for sparkle
                                newColor.setRGB(1, 1, 1);
                                // Increase size temporarily
                                sizes[i] *= 1.5;
                            } else {
                                // Normal color blending
                                newColor.r = (color1.r + color2.r) * 0.5;
                                newColor.g = (color1.g + color2.g) * 0.5;
                                newColor.b = (color1.b + color2.b) * 0.5;
                            }
                            
                            // Apply new color
                            colors[i3] = newColor.r;
                            colors[i3 + 1] = newColor.g;
                            colors[i3 + 2] = newColor.b;
                            
                            // Give the particle a small velocity boost in a random direction
                            const angle = Math.random() * Math.PI * 2;
                            const force = 0.2 + Math.random() * 0.3;
                            this.velocities[i3] += Math.cos(angle) * force;
                            this.velocities[i3 + 1] += Math.sin(angle) * force;
                            
                            // Extend particle lifetime
                            this.particleLifetimes[i] += 5 + Math.random() * 10;
                            
                            break; // Only react once per frame
                        }
                    }
                }
            }
            
            // Check if particle lifetime is over
            if (this.particleLifetimes[i] <= 0) {
                // Gradually fade out by making particle smaller
                sizes[i] *= 0.95;
                
                // When size is very small, deactivate
                if (sizes[i] < 0.3) {
                    positions[i3 + 1] = -1000; // Move below screen to deactivate
                    this.trails[i] = []; // Clear trail
                }
            } else {
                // Sparkling effect - occasionally change brightness
                if (this.config.sparkleEffect && Math.random() < 0.05) {
                    const sparkFactor = 0.8 + Math.random() * 0.4;
                    colors[i3] = Math.min(1, colors[i3] * sparkFactor);
                    colors[i3 + 1] = Math.min(1, colors[i3 + 1] * sparkFactor);
                    colors[i3 + 2] = Math.min(1, colors[i3 + 2] * sparkFactor);
                }
            }
            
            // Boundary check - deactivate particles that go too far out
            if (positions[i3] < -600 || positions[i3] > 600 || positions[i3 + 1] < -500 || positions[i3 + 1] > 500) {
                positions[i3 + 1] = -1000; // Move below screen to deactivate
                this.trails[i] = []; // Clear trail
            }
        }
        
        // Update trails
        this.updateTrails();
        
        // Mark attribute buffers for update
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
        this.particleSystem.geometry.attributes.size.needsUpdate = true;
    }
    
    updateTrails() {
        if (!this.config.trailEffect) return;
        
        // Remove any existing trail meshes
        if (this.trailMeshes) {
            for (let i = 0; i < this.trailMeshes.length; i++) {
                this.scene.remove(this.trailMeshes[i]);
            }
        }
        
        this.trailMeshes = [];
        
        // Draw trails as line segments
        for (let i = 0; i < this.config.particleCount; i++) {
            const trail = this.trails[i];
            if (trail.length < 2) continue;
            
            // Decrease lifetime of trail points
            for (let j = 0; j < trail.length; j++) {
                trail[j].life--;
            }
            
            // Remove trail points that have expired
            while (trail.length > 0 && trail[0].life <= 0) {
                trail.shift();
            }
            
            if (trail.length < 2) continue;
            
            // Create line for this trail
            const lineGeometry = new THREE.BufferGeometry();
            const linePositions = new Float32Array(trail.length * 3);
            const lineColors = new Float32Array(trail.length * 3);
            
            // Get the particle's chemical type for trail color
            const typeIndex = this.particleTypes[i];
            const chemicalType = this.config.chemicalTypes[typeIndex];
            const color = new THREE.Color(chemicalType.color);
            
            for (let j = 0; j < trail.length; j++) {
                const j3 = j * 3;
                linePositions[j3] = trail[j].x;
                linePositions[j3 + 1] = trail[j].y;
                linePositions[j3 + 2] = trail[j].z;
                
                // Fade trail based on position in trail
                const alpha = j / trail.length;
                lineColors[j3] = color.r;
                lineColors[j3 + 1] = color.g;
                lineColors[j3 + 2] = color.b;
            }
            
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
            lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
            
            const lineMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                transparent: true,
                opacity: 0.5
            });
            
            const line = new THREE.Line(lineGeometry, lineMaterial);
            this.scene.add(line);
            this.trailMeshes.push(line);
        }
    }
    
    resetParticles() {
        // Recreate the particle system with current settings
        this.createParticleSystem();
    }
    
    setupGUI() {
        const gui = new dat.GUI({closed: false});
        
        // Firework controls
        const fireworkFolder = gui.addFolder('◉ FIREWORK CONTROLS');
        fireworkFolder.add(this.config, 'launchOnClick').name('CLICK TO LAUNCH');
        fireworkFolder.add(this.config, 'autoLaunch').name('AUTO LAUNCH');
        fireworkFolder.add(this.config, 'autoLaunchInterval', 500, 5000).name('LAUNCH INTERVAL');
        fireworkFolder.add(this.config, 'explosionForce', 1, 5).name('EXPLOSION SIZE');
        fireworkFolder.add(this.config, 'launchForce', 3, 10).name('LAUNCH POWER');
        
        // Pattern selector
        const patternOptions = {};
        this.config.patterns.forEach((pattern, index) => {
            patternOptions[pattern.name] = index;
        });
        fireworkFolder.add(this.config, 'selectedPattern', patternOptions).name('PATTERN');
        
        fireworkFolder.open();
        
        // Physics controls
        const physicsFolder = gui.addFolder('◉ PHYSICS');
        physicsFolder.add(this.config, 'gravity', 0.01, 0.2).name('GRAVITY');
        physicsFolder.add(this.config, 'friction', 0.9, 1).name('AIR FRICTION');
        physicsFolder.add(this.config, 'trailEffect').name('ENABLE TRAILS');
        physicsFolder.open();
        
        // Chemical controls
        const chemicalFolder = gui.addFolder('◉ CHEMICAL EFFECTS');
        chemicalFolder.add(this.config, 'enableReactions').name('ENABLE REACTIONS');
        chemicalFolder.add(this.config, 'reactionRadius', 1, 20).name('REACTION RADIUS');
        chemicalFolder.add(this.config, 'reactionProbability', 0.1, 1).name('REACTION CHANCE');
        chemicalFolder.add(this.config, 'sparkleEffect').name('SPARKLE EFFECT');
        chemicalFolder.open();
        
        // Particle appearance
        const appearanceFolder = gui.addFolder('◉ APPEARANCE');
        appearanceFolder.add(this.config, 'particleCount', 1000, 30000).step(1000).name('PARTICLE COUNT').onChange(() => this.resetParticles());
        appearanceFolder.add(this.config, 'particleSize', 1, 5).name('PARTICLE SIZE').onChange(value => {
            this.particleSystem.material.size = value;
        });
        appearanceFolder.add(this.config, 'particleOpacity', 0, 1).name('OPACITY').onChange(value => {
            this.particleSystem.material.opacity = value;
        });
        appearanceFolder.open();
        
        // Reset button
        gui.add(this.config, 'resetSimulation').name('⟲ RESET SIMULATION');
        
        // Add keyboard controls
        window.addEventListener('keydown', (e) => {
            // Toggle UI with X key
            if (e.key.toLowerCase() === 'x') {
                gui.closed ? gui.open() : gui.close();
            }
            
            // Launch a firework with spacebar
            if (e.key === ' ' || e.key === 'Enter') {
                this.launchFirework();
            }
            
            // Toggle auto-launch with A key
            if (e.key.toLowerCase() === 'a') {
                this.config.autoLaunch = !this.config.autoLaunch;
                // Update GUI controllers
                for (let i in fireworkFolder.__controllers) {
                    fireworkFolder.__controllers[i].updateDisplay();
                }
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update particle physics
        this.updateParticlePhysics();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the simulation when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const simulator = new FireworksSimulator();
});