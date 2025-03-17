// Particle Gravity Simulation with Gravitational Lensing
import * as THREE from 'three';

class ParticleGravitySimulator {
    constructor() {
        this.particles = [];
        this.scene = null;
        // Initialize mouse position tracking
        this.mousePosition = new THREE.Vector2(0, 0);
        // Store multiplayer gravity points
        this.multiplayerGravityPoints = {};
        this.myPlayerId = null;
        
        // Server-side physics
        this.useServerPhysics = true;
        this.serverParticles = [];
        this.serverParticlesMesh = null;
        
        // Default configuration parameters with user's preferred settings
        this.config = {
            particleCount: 50000,
            particleSize: 2.4,
            particleColor: '#ffffff', // White light base color (not used with random colors)
            particleOpacity: 0.61,
            gravityStrength: 1.0,
            lensingStrength: 2.0,
            velocityDamping: 0.99,
            initialSpeed: 5.0,
            particleSpread: 800,
            colorMode: 'uniform', // Not used with our custom coloring
            colorByVelocity: false,
            colorByDistance: false,
            showLensingEffect: true,
            // Prism effect parameters
            prismEffect: true,
            prismRadius: 50,    // Smaller prism size (50)
            prismStrength: 2.0, 
            prismDispersion: 3.0,  // Maximum color dispersion strength
            prismOpacity: 0.05,    // Subtle prism outline
            ringOpacity: 0.2,      // Subtle ring opacity
            resetSimulation: () => this.resetParticles()
        };
        
        // Initialize the simulation
        this.init();
        this.setupGUI();
        this.animate();
        
        // Connect to multiplayer if available
        if (window.multiplayerClient) {
            window.multiplayerClient.setSimulator(this);
        }
    }
    
    // Set whether to use server-side physics
    setUseServerPhysics(useServer) {
        this.useServerPhysics = useServer;
        
        // Show/hide appropriate particle systems
        if (this.serverParticlesMesh) {
            this.serverParticlesMesh.visible = useServer;
        }
        if (this.particleSystem) {
            this.particleSystem.visible = !useServer;
        }
        
        console.log(`Using ${useServer ? 'server' : 'client'}-side physics`);
    }
    
    // Update particles from server
    updateServerParticles(particles) {
        this.serverParticles = particles;
        
        // If server particles mesh doesn't exist yet, create it
        if (!this.serverParticlesMesh && particles.length > 0) {
            this.createServerParticlesMesh();
        }
        
        // Update positions if mesh exists
        if (this.serverParticlesMesh) {
            const positions = this.serverParticlesMesh.geometry.attributes.position.array;
            
            // Update positions from server data
            for (let i = 0; i < particles.length; i++) {
                const i3 = i * 3;
                if (i3 + 2 < positions.length) {
                    positions[i3] = particles[i].x;
                    positions[i3 + 1] = particles[i].y;
                    positions[i3 + 2] = 0; // Keep z at 0
                }
            }
            
            // Mark for update
            this.serverParticlesMesh.geometry.attributes.position.needsUpdate = true;
        }
    }
    
    // Create mesh for server particles
    createServerParticlesMesh() {
        // Create particle geometry
        const geometry = new THREE.BufferGeometry();
        const particleCount = this.serverParticles.length;
        
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        // Initialize positions from server data
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Set positions
            positions[i3] = this.serverParticles[i].x;
            positions[i3 + 1] = this.serverParticles[i].y;
            positions[i3 + 2] = 0;
            
            // Create similar color patterns as client particles
            const color = new THREE.Color();
            const hue = Math.random(); // Random hue
            const saturation = 1.0;    // Full saturation
            const lightness = 0.5;     // Medium lightness
            
            color.setHSL(hue, saturation, lightness);
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }
        
        // Set attributes for the geometry
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Create the same particle material as client particles
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(160, 255, 255, 0.8)');
        gradient.addColorStop(0.7, 'rgba(80, 180, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 64, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        
        const sprite = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.PointsMaterial({
            size: this.config.particleSize * 1.5, // 50% larger for server particles
            vertexColors: true,
            transparent: true,
            opacity: this.config.particleOpacity * 1.2, // Slightly more opaque
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            depthWrite: false,
            map: sprite
        });
        
        // Create the particle system
        this.serverParticlesMesh = new THREE.Points(geometry, material);
        this.serverParticlesMesh.visible = this.useServerPhysics;
        this.scene.add(this.serverParticlesMesh);
    }
    
    // Update gravity points from multiplayer
    updateMultiplayerGravityPoints(points, myPlayerId) {
        this.multiplayerGravityPoints = points;
        this.myPlayerId = myPlayerId;
        
        // Update prism meshes for all players
        this.updateMultiplayerPrisms();
    }
    
    // Create or update prism meshes for all players
    updateMultiplayerPrisms() {
        // Remove any existing multiplayer prisms
        if (this.playerPrisms) {
            for (const id in this.playerPrisms) {
                if (this.playerPrisms[id].prismMesh) {
                    this.scene.remove(this.playerPrisms[id].prismMesh);
                    this.playerPrisms[id].prismMesh.geometry.dispose();
                    this.playerPrisms[id].prismMesh.material.dispose();
                }
                if (this.playerPrisms[id].ringMesh) {
                    this.scene.remove(this.playerPrisms[id].ringMesh);
                    this.playerPrisms[id].ringMesh.geometry.dispose();
                    this.playerPrisms[id].ringMesh.material.dispose();
                }
            }
        }
        
        // Create new object to store player prisms
        this.playerPrisms = {};
        
        // Create prisms for all players except self (self uses the main prism)
        for (const id in this.multiplayerGravityPoints) {
            if (id == this.myPlayerId) continue; // Skip self
            
            const params = this.multiplayerGravityPoints[id];
            this.createPlayerPrism(id, params);
        }
    }
    
    // Create a prism for a specific player
    createPlayerPrism(playerId, params) {
        // Use default parameters if not provided
        const radius = params.prismRadius || this.config.prismRadius;
        const opacity = this.config.prismOpacity * 1.5; // Make other players' prisms more visible
        const ringOpacity = this.config.ringOpacity * 1.5;
        
        // Create prism geometry
        const prismGeometry = new THREE.CircleGeometry(radius, 64);
        const prismMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide
        });
        
        // Add a colorful ring to show the prism boundary
        const ringGeometry = new THREE.RingGeometry(
            radius - 1.5, 
            radius, 
            64
        );
        
        // Create a gradient texture for the ring
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 128;
        ringCanvas.height = 2;
        const ctx = ringCanvas.getContext('2d');
        const ringGradient = ctx.createLinearGradient(0, 0, ringCanvas.width, 0);
        
        // Random hue for each player's ring - consistent based on player ID
        const hueOffset = (parseInt(playerId) * 0.37) % 1.0;
        
        // Rainbow gradient, offset by player-specific hue
        ringGradient.addColorStop(0, this.hslToHex((0.0 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(1/6, this.hslToHex((0.05 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(2/6, this.hslToHex((0.2 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(3/6, this.hslToHex((0.3 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(4/6, this.hslToHex((0.54 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(5/6, this.hslToHex((0.75 + hueOffset) % 1, 1, 0.5));
        ringGradient.addColorStop(1, this.hslToHex((0.85 + hueOffset) % 1, 1, 0.5));
        
        ctx.fillStyle = ringGradient;
        ctx.fillRect(0, 0, ringCanvas.width, ringCanvas.height);
        
        const rainbowTexture = new THREE.CanvasTexture(ringCanvas);
        rainbowTexture.wrapS = THREE.RepeatWrapping;
        
        const ringMaterial = new THREE.MeshBasicMaterial({
            map: rainbowTexture,
            transparent: true,
            opacity: ringOpacity,
            side: THREE.DoubleSide
        });
        
        // Create both prism circle and rainbow ring
        const prismMesh = new THREE.Mesh(prismGeometry, prismMaterial);
        this.scene.add(prismMesh);
        
        // Add the rainbow ring
        const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.scene.add(ringMesh);
        
        // Position prism at player's gravity point
        if (params.position) {
            prismMesh.position.set(params.position.x, params.position.y, 0);
            ringMesh.position.set(params.position.x, params.position.y, 0);
        }
        
        // Store meshes
        this.playerPrisms[playerId] = {
            prismMesh: prismMesh,
            ringMesh: ringMesh,
            params: params
        };
    }
    
    // Helper function to convert HSL to hex color
    hslToHex(h, s, l) {
        const toRGB = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const r = Math.round(toRGB(p, q, h + 1/3) * 255);
        const g = Math.round(toRGB(p, q, h) * 255);
        const b = Math.round(toRGB(p, q, h - 1/3) * 255);
        
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
    }
    
    init() {
        // Create the scene with a black background (for Dark Side of the Moon theme)
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        // Set up the camera - orthographic for true 2D view
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 800;
        
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
        
        // Handle window resize for orthographic camera
        window.addEventListener('resize', () => {
            const aspect = window.innerWidth / window.innerHeight;
            const frustumSize = 800;
            
            this.camera.left = frustumSize * aspect / -2;
            this.camera.right = frustumSize * aspect / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = frustumSize / -2;
            
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Track mouse position for gravitational lensing
        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        
        // Add touch event support for mobile devices
        window.addEventListener('touchstart', (event) => {
            event.preventDefault();
            const touch = event.touches[0];
            this.mousePosition.x = (touch.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        });
        
        window.addEventListener('touchmove', (event) => {
            event.preventDefault();
            const touch = event.touches[0];
            this.mousePosition.x = (touch.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(touch.clientY / window.innerHeight) * 2 + 1;
        });
        
        window.addEventListener('touchend', (event) => {
            event.preventDefault();
            // Not resetting mousePosition allows the gravitational lensing 
            // to continue from the last touch position
        });
        
        // Initialize particles
        this.createParticleSystem();
    }
    
    // New method to update prism and ring geometry when radius changes
    updatePrismGeometry() {
        // Clean up existing prism and ring meshes
        if (this.prismMesh) {
            this.scene.remove(this.prismMesh);
            this.prismMesh.geometry.dispose();
            this.prismMesh.material.dispose();
        }
        if (this.ringMesh) {
            this.scene.remove(this.ringMesh);
            this.ringMesh.geometry.dispose();
            this.ringMesh.material.dispose();
        }
        
        // Create new prism geometry with current radius
        const prismGeometry = new THREE.CircleGeometry(this.config.prismRadius, 64);
        const prismMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: this.config.prismOpacity,
            side: THREE.DoubleSide
        });
        
        // Add a colorful ring to show the prism boundary
        const ringGeometry = new THREE.RingGeometry(
            this.config.prismRadius - 1.5, 
            this.config.prismRadius, 
            64
        );
        
        // Create a gradient texture for the ring
        const ringCanvas = document.createElement('canvas');
        ringCanvas.width = 128;
        ringCanvas.height = 2;
        const ctx = ringCanvas.getContext('2d');
        const ringGradient = ctx.createLinearGradient(0, 0, ringCanvas.width, 0);
        
        // Rainbow gradient
        ringGradient.addColorStop(0, '#ff0000');
        ringGradient.addColorStop(1/6, '#ff8800');
        ringGradient.addColorStop(2/6, '#ffff00');
        ringGradient.addColorStop(3/6, '#00ff00');
        ringGradient.addColorStop(4/6, '#00ffff');
        ringGradient.addColorStop(5/6, '#0000ff');
        ringGradient.addColorStop(1, '#ff00ff');
        
        ctx.fillStyle = ringGradient;
        ctx.fillRect(0, 0, ringCanvas.width, ringCanvas.height);
        
        const rainbowTexture = new THREE.CanvasTexture(ringCanvas);
        rainbowTexture.wrapS = THREE.RepeatWrapping;
        
        const ringMaterial = new THREE.MeshBasicMaterial({
            map: rainbowTexture,
            transparent: true,
            opacity: this.config.ringOpacity,
            side: THREE.DoubleSide
        });
        
        // Create both prism circle and rainbow ring
        this.prismMesh = new THREE.Mesh(prismGeometry, prismMaterial);
        this.scene.add(this.prismMesh);
        
        // Add the rainbow ring
        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.scene.add(this.ringMesh);
    }
    
    createParticleSystem() {
        // Clean up existing particle system if it exists
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem.geometry.dispose();
            this.particleSystem.material.dispose();
        }
        
        // Create the central prism shape (visible when no particles are in it)
        this.updatePrismGeometry();
        
        // Create particle geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.config.particleCount * 3);
        const colors = new Float32Array(this.config.particleCount * 3);
        const velocities = new Float32Array(this.config.particleCount * 3);
        
        for (let i = 0; i < this.config.particleCount; i++) {
            // Calculate the array index
            const i3 = i * 3;
            
            // Random position in a 2D circle - flat distribution
            // Avoid placing too many particles directly in the prism
            let radius, theta;
            
            if (Math.random() < 0.7) {
                // 70% of particles outside the prism or at the edge
                radius = this.config.prismRadius * 0.5 + this.config.particleSpread * Math.sqrt(Math.random() * 0.8); 
            } else {
                // 30% of particles inside the prism
                radius = this.config.prismRadius * Math.sqrt(Math.random()); 
            }
            
            theta = Math.random() * Math.PI * 2;
            
            positions[i3] = radius * Math.cos(theta);     // x position
            positions[i3 + 1] = radius * Math.sin(theta); // y position
            positions[i3 + 2] = 0;                        // z is always 0 (flat 2D)
            
            // Initial velocities (tangential to create orbital motion)
            // Calculate position vector and perpendicular vector for orbital velocity
            const px = positions[i3];
            const py = positions[i3 + 1];
            
            // Normalize the position vector
            const dist = Math.sqrt(px * px + py * py);
            if (dist > 0.1) {
                // Calculate perpendicular vector (for orbital motion)
                const perpX = -py / dist;
                const perpY = px / dist;
                
                // Apply orbital velocity with some randomization
                const speed = this.config.initialSpeed * (0.8 + Math.random() * 0.4);
                velocities[i3] = perpX * speed;
                velocities[i3 + 1] = perpY * speed;
            } else {
                // Random velocity for particles near center
                velocities[i3] = Math.random() * this.config.initialSpeed - this.config.initialSpeed/2;
                velocities[i3 + 1] = Math.random() * this.config.initialSpeed - this.config.initialSpeed/2;
            }
            velocities[i3 + 2] = 0; // No z velocity for 2D
            
            // Set pure, vibrant colors from across the spectrum (no pastels)
            // More extreme pure colors for better dispersion visualization
            let color;
            
            // Choose from several approaches for broader color diversity
            const colorMode = Math.floor(Math.random() * 3);
            
            if (colorMode === 0) {
                // Pure spectral colors (red, orange, yellow, green, blue, violet)
                const hueOptions = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.55, 0.6, 0.7, 0.75, 0.8, 0.85];
                const randomHue = hueOptions[Math.floor(Math.random() * hueOptions.length)];
                color = new THREE.Color();
                color.setHSL(randomHue, 1.0, 0.5);
            } else if (colorMode === 1) {
                // RGB primaries and secondaries for maximum contrast
                const pureColors = [
                    0xff0000, // Red
                    0x00ff00, // Green
                    0x0000ff, // Blue
                    0xffff00, // Yellow
                    0x00ffff, // Cyan
                    0xff00ff  // Magenta
                ];
                color = new THREE.Color(pureColors[Math.floor(Math.random() * pureColors.length)]);
            } else {
                // Full random but with full saturation
                color = new THREE.Color();
                color.setHSL(Math.random(), 1.0, 0.5);
            }
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }
        
        // Store velocities for physics calculation
        this.velocities = velocities;
        
        // Set attributes for the geometry
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Create particle material with simple circular point texture
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(160, 255, 255, 0.8)');
        gradient.addColorStop(0.7, 'rgba(80, 180, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 64, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        
        const sprite = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.PointsMaterial({
            size: this.config.particleSize,
            vertexColors: true,
            transparent: true,
            opacity: this.config.particleOpacity,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            depthWrite: false,
            map: sprite
        });
        
        // Create the particle system
        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    }
    
    updateParticleColors() {
        // We're no longer updating colors in animation loop
        // All particles keep their initial random colors
        // This simulates white light being split by the prism

        // This function is now just a placeholder in case we need to re-enable color updating
        // But we do still need to mark colors for update in case other code modifies them
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
    }
    
    updateParticlePhysics() {
        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        
        // Convert mouse position from normalized device coordinates to world space
        const mouseWorld = new THREE.Vector3(
            this.mousePosition.x * 400,
            this.mousePosition.y * 400,
            0
        );
        
        // Update player prism positions if they exist
        if (this.playerPrisms) {
            for (const id in this.playerPrisms) {
                if (this.multiplayerGravityPoints[id] && this.multiplayerGravityPoints[id].position) {
                    const pos = this.multiplayerGravityPoints[id].position;
                    if (this.playerPrisms[id].prismMesh) {
                        this.playerPrisms[id].prismMesh.position.set(pos.x, pos.y, 0);
                    }
                    if (this.playerPrisms[id].ringMesh) {
                        this.playerPrisms[id].ringMesh.position.set(pos.x, pos.y, 0);
                        this.playerPrisms[id].ringMesh.rotation.z += 0.01; // Rotate each player's ring
                    }
                }
            }
        }
        
        for (let i = 0; i < this.config.particleCount; i++) {
            const i3 = i * 3;
            
            // Current position vector - always in 2D plane
            const particlePos = new THREE.Vector2(
                positions[i3],
                positions[i3 + 1]
            );
            
            // Apply weak gravity toward center of simulation (stable orbits)
            if (this.config.gravityStrength > 0) {
                // Weak central gravity for orbital stability
                const toCenterX = -positions[i3];
                const toCenterY = -positions[i3 + 1];
                const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
                
                if (centerDist > 1.0) {
                    const centralForce = 0.01 * this.config.gravityStrength / (centerDist * centerDist);
                    this.velocities[i3] += toCenterX / centerDist * centralForce;
                    this.velocities[i3 + 1] += toCenterY / centerDist * centralForce;
                }
            }
            
            // Apply prism/lens effect for main player
            if (this.config.prismEffect) {
                const toCenterX = -positions[i3];
                const toCenterY = -positions[i3 + 1];
                const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
                
                // Get the particle's color components
                const r = colors[i3];
                const g = colors[i3 + 1];
                const b = colors[i3 + 2];
                
                // Calculate color-based dispersion within and around the prism radius
                if (centerDist < this.config.prismRadius * 1.5) {
                    // Normalize direction vector
                    const dirX = toCenterX / centerDist;
                    const dirY = toCenterY / centerDist;
                    
                    // Different force for each color component (red, green, blue)
                    // This simulates dispersion - red, green, and blue light bend differently
                    let dispersionForce;
                    
                    if (centerDist < this.config.prismRadius) {
                        // Inside the prism radius - dispersive force pushing outward
                        // Force increases as particles get closer to edge
                        const normalizedDist = centerDist / this.config.prismRadius;
                        dispersionForce = this.config.prismStrength * normalizedDist;
                    } else {
                        // Outside but near the prism - lensing effect
                        // Force decreases with distance from the edge
                        const outsideDistance = centerDist - this.config.prismRadius;
                        const falloff = Math.max(0, 1 - outsideDistance / (this.config.prismRadius * 0.5));
                        dispersionForce = -this.config.prismStrength * 0.5 * falloff;
                    }
                    
                    // MUCH stronger color-dependent dispersion for extreme prism effect
                    // Wavelength-dependent refraction index (physics-based)
                    const rForce = dispersionForce * (1.0 - this.config.prismDispersion * 0.6); // Red bends least
                    const gForce = dispersionForce * 1.1;                                        // Green medium
                    const bForce = dispersionForce * (1.0 + this.config.prismDispersion * 0.8); // Blue bends most
                    
                    // Exaggerate color separation based on color dominance
                    let dominantForce;
                    const colorSum = r + g + b;
                    
                    // Find the dominant color component (RGB)
                    if (r > g * 1.5 && r > b * 1.5) {
                        // Strongly red dominant - much less bending
                        dominantForce = rForce * 0.5;
                        
                        // Add perpendicular "rainbow" motion for stronger separation
                        const perpX = -dirY;
                        const perpY = dirX;
                        this.velocities[i3] += perpX * rForce * 0.3;
                        this.velocities[i3 + 1] += perpY * rForce * 0.3;
                    } else if (g > r * 1.5 && g > b * 1.5) {
                        // Strongly green dominant - medium bending
                        dominantForce = gForce * 0.8;
                    } else if (b > r * 1.5 && b > g * 1.5) {
                        // Strongly blue dominant - much more bending
                        dominantForce = bForce * 1.8;
                        
                        // Add opposite perpendicular motion for blues
                        const perpX = dirY;
                        const perpY = -dirX;
                        this.velocities[i3] += perpX * bForce * 0.4;
                        this.velocities[i3 + 1] += perpY * bForce * 0.4;
                    } else {
                        // Mixed colors - weighted average based on RGB components
                        dominantForce = (r * rForce + g * gForce + b * bForce) / Math.max(0.1, colorSum);
                    }
                    
                    // Apply primary force with random jitter
                    const jitter = (Math.random() * 0.3 - 0.15) * dispersionForce; // More randomness
                    this.velocities[i3] -= dirX * (dominantForce + jitter);
                    this.velocities[i3 + 1] -= dirY * (dominantForce + jitter);
                }
            }
            
            // Apply prism/lens effects for each multiplayer gravity point
            if (this.multiplayerGravityPoints) {
                for (const id in this.multiplayerGravityPoints) {
                    // Skip self (already handled by main prism)
                    if (id == this.myPlayerId) continue;
                    
                    const params = this.multiplayerGravityPoints[id];
                    if (!params.position) continue;
                    
                    // Vector from particle to gravity point
                    const toPointX = params.position.x - positions[i3];
                    const toPointY = params.position.y - positions[i3 + 1];
                    const pointDist = Math.sqrt(toPointX * toPointX + toPointY * toPointY);
                    
                    if (pointDist < 0.1) continue; // Avoid division by zero
                    
                    // Gravity and prism parameters (use defaults if not provided)
                    const gravityStrength = params.gravityStrength || this.config.gravityStrength;
                    const lensingStrength = params.lensingStrength || this.config.lensingStrength;
                    const prismRadius = params.prismRadius || this.config.prismRadius;
                    const prismStrength = params.prismStrength || this.config.prismStrength;
                    const prismDispersion = params.prismDispersion || this.config.prismDispersion;
                    
                    // Apply gravitational and lensing forces
                    let gravityForce = 0;
                    
                    // Apply lensing force
                    gravityForce = lensingStrength / Math.max(pointDist * 0.05, 0.1);
                    
                    // Add main gravity effect
                    gravityForce += gravityStrength / Math.max(pointDist * 0.1, 0.5);
                    
                    // Normalize the direction vector
                    const norm = 1 / pointDist;
                    const dirX = toPointX * norm;
                    const dirY = toPointY * norm;
                    
                    // Apply gravitational acceleration toward point
                    this.velocities[i3] += dirX * gravityForce;
                    this.velocities[i3 + 1] += dirY * gravityForce;
                    
                    // Apply prism effects for particles near the prism
                    if (pointDist < prismRadius * 1.5) {
                        // Get the particle's color components
                        const r = colors[i3];
                        const g = colors[i3 + 1];
                        const b = colors[i3 + 2];
                        
                        let dispersionForce;
                        
                        if (pointDist < prismRadius) {
                            // Inside the prism - dispersive force pushing outward
                            const normalizedDist = pointDist / prismRadius;
                            dispersionForce = prismStrength * normalizedDist;
                        } else {
                            // Outside but near - lensing effect
                            const outsideDistance = pointDist - prismRadius;
                            const falloff = Math.max(0, 1 - outsideDistance / (prismRadius * 0.5));
                            dispersionForce = -prismStrength * 0.5 * falloff;
                        }
                        
                        // Color-dependent dispersion
                        const rForce = dispersionForce * (1.0 - prismDispersion * 0.6);
                        const gForce = dispersionForce * 1.1;
                        const bForce = dispersionForce * (1.0 + prismDispersion * 0.8);
                        
                        // Calculate dominant force based on color
                        let dominantForce;
                        const colorSum = r + g + b;
                        
                        if (r > g * 1.5 && r > b * 1.5) {
                            dominantForce = rForce * 0.5;
                        } else if (g > r * 1.5 && g > b * 1.5) {
                            dominantForce = gForce * 0.8;
                        } else if (b > r * 1.5 && b > g * 1.5) {
                            dominantForce = bForce * 1.8;
                        } else {
                            dominantForce = (r * rForce + g * gForce + b * bForce) / Math.max(0.1, colorSum);
                        }
                        
                        // Apply force with jitter
                        const jitter = (Math.random() * 0.3 - 0.15) * dispersionForce;
                        this.velocities[i3] -= dirX * (dominantForce + jitter);
                        this.velocities[i3 + 1] -= dirY * (dominantForce + jitter);
                    }
                }
            }
            
            // Create gravitational lensing effect around mouse position (local player)
            // Mouse creates a gravitational well that bends particle paths
            const toMouseX = mouseWorld.x - positions[i3];
            const toMouseY = mouseWorld.y - positions[i3 + 1];
            const mouseDistance = Math.sqrt(toMouseX * toMouseX + toMouseY * toMouseY);
            
            if (mouseDistance > 0.1) {
                // Apply gravitational force around mouse cursor
                let gravityForce = 0;
                
                if (this.config.showLensingEffect) {
                    // Apply lensing force - stronger when closer to mouse
                    gravityForce = this.config.lensingStrength / Math.max(mouseDistance * 0.05, 0.1);
                }
                
                if (this.config.gravityStrength > 0) {
                    // Add main gravity effect from mouse 
                    gravityForce += this.config.gravityStrength / Math.max(mouseDistance * 0.1, 0.5);
                }
                
                // Normalize the direction vector
                const norm = 1 / mouseDistance;
                const dirX = toMouseX * norm;
                const dirY = toMouseY * norm;
                
                // Apply gravitational acceleration toward mouse
                this.velocities[i3] += dirX * gravityForce;
                this.velocities[i3 + 1] += dirY * gravityForce;
                this.velocities[i3 + 2] = 0; // Keep z velocity at 0
            }
            
            // Apply velocity damping (simulates friction)
            this.velocities[i3] *= this.config.velocityDamping;
            this.velocities[i3 + 1] *= this.config.velocityDamping;
            this.velocities[i3 + 2] *= this.config.velocityDamping;
            
            // Update positions based on velocities - enforce 2D
            positions[i3] += this.velocities[i3];
            positions[i3 + 1] += this.velocities[i3 + 1];
            positions[i3 + 2] = 0; // Keep z position at 0
            
            // Boundary check - wrap particles that go too far away
            const maxDistance = this.config.particleSpread * 2;
            const distanceFromCenter = Math.sqrt(
                positions[i3] * positions[i3] + 
                positions[i3 + 1] * positions[i3 + 1]
            );
            
            if (distanceFromCenter > maxDistance) {
                // Option 1: Reset particle to a new position with orbital velocity
                if (Math.random() < 0.3) {
                    // New position on a random point of the circle
                    const newRadius = this.config.particleSpread * Math.sqrt(Math.random());
                    const newAngle = Math.random() * Math.PI * 2;
                    
                    // Set new position
                    positions[i3] = newRadius * Math.cos(newAngle);
                    positions[i3 + 1] = newRadius * Math.sin(newAngle);
                    
                    // Calculate orbital velocity at this radius
                    const perpX = -positions[i3 + 1] / newRadius;
                    const perpY = positions[i3] / newRadius;
                    const speed = this.config.initialSpeed * (0.8 + Math.random() * 0.4);
                    
                    // Set new velocity (orbital motion)
                    this.velocities[i3] = perpX * speed;
                    this.velocities[i3 + 1] = perpY * speed;
                    this.velocities[i3 + 2] = 0;
                } 
                // Option 2: Bounce off an invisible boundary
                else {
                    // Normalize the position vector to the edge
                    const factor = maxDistance / distanceFromCenter;
                    positions[i3] = positions[i3] * factor * 0.9;
                    positions[i3 + 1] = positions[i3 + 1] * factor * 0.9;
                    
                    // Reflect velocity (bounce off the boundary)
                    const normalX = -positions[i3] / distanceFromCenter;
                    const normalY = -positions[i3 + 1] / distanceFromCenter;
                    
                    // Calculate dot product of velocity and normal
                    const dot = this.velocities[i3] * normalX + this.velocities[i3 + 1] * normalY;
                    
                    // Reflect velocity with some energy loss
                    this.velocities[i3] = (this.velocities[i3] - 2 * dot * normalX) * 0.5;
                    this.velocities[i3 + 1] = (this.velocities[i3 + 1] - 2 * dot * normalY) * 0.5;
                }
            }
        }
        
        // Mark the position attribute for update
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }
    
    resetParticles() {
        // Recreate the particle system with current settings
        this.createParticleSystem();
    }
    
    setupGUI() {
        const gui = new dat.GUI({closed: true}); // Start with UI closed
        
        // Particle appearance
        const appearanceFolder = gui.addFolder('◉ PARTICLE SETTINGS');
        appearanceFolder.add(this.config, 'particleCount', 100, 8000000).step(10000).name('PARTICLE COUNT').onChange(() => this.resetParticles());
        appearanceFolder.add(this.config, 'particleSize', 0.5, 8).name('PARTICLE SIZE').onChange(value => {
            this.particleSystem.material.size = value;
        });
        appearanceFolder.addColor(this.config, 'particleColor').name('BASE COLOR');
        appearanceFolder.add(this.config, 'particleOpacity', 0, 1).name('OPACITY').onChange(value => {
            this.particleSystem.material.opacity = value;
        });
        appearanceFolder.add(this.config, 'colorMode', ['uniform', 'rainbow']).name('COLOR MODE');
        appearanceFolder.add(this.config, 'colorByVelocity').name('VELOCITY COLORS');
        appearanceFolder.add(this.config, 'colorByDistance').name('DISTANCE COLORS');
        appearanceFolder.open();
        
        // Physics parameters
        const physicsFolder = gui.addFolder('◉ PHYSICS CONTROLS');
        physicsFolder.add(this.config, 'gravityStrength', 0, 1).name('GRAVITY STRENGTH');
        physicsFolder.add(this.config, 'lensingStrength', 0, 2).name('LENSING STRENGTH');
        physicsFolder.add(this.config, 'velocityDamping', 0.9, 1).step(0.0001).name('FRICTION');
        physicsFolder.add(this.config, 'initialSpeed', 0, 5).name('PARTICLE SPEED');
        physicsFolder.add(this.config, 'particleSpread', 50, 800).name('SPREAD RADIUS').onChange(() => this.resetParticles());
        physicsFolder.add(this.config, 'showLensingEffect').name('ENABLE LENSING');
        physicsFolder.open();
        
        // Prism controls
        const prismFolder = gui.addFolder('◉ PRISM CONTROLS');
        prismFolder.add(this.config, 'prismEffect').name('ENABLE PRISM');
        prismFolder.add(this.config, 'prismRadius', 50, 300).name('PRISM SIZE').onChange(() => {
            // Recreate the prism and ring with new radius
            this.updatePrismGeometry();
        });
        prismFolder.add(this.config, 'prismStrength', 0.1, 2.0).name('PRISM STRENGTH');
        prismFolder.add(this.config, 'prismDispersion', 0.2, 3.0).name('COLOR DISPERSION');
        prismFolder.add(this.config, 'prismOpacity', 0, 0.3).name('PRISM OPACITY').onChange(value => {
            if (this.prismMesh) {
                this.prismMesh.material.opacity = value;
            }
        });
        prismFolder.add(this.config, 'ringOpacity', 0, 1).name('RING OPACITY').onChange(value => {
            if (this.ringMesh) {
                this.ringMesh.material.opacity = value;
            }
        });
        prismFolder.open();
        
        // Actions
        gui.add(this.config, 'resetSimulation').name('⟲ RESET SIMULATION');
        
        // Add keyboard controls
        window.addEventListener('keydown', (e) => {
            // Toggle UI with X key
            if (e.key.toLowerCase() === 'x') {
                gui.closed ? gui.open() : gui.close();
            }
            
            // Toggle lens strength with L key
            if (e.key.toLowerCase() === 'l') {
                this.config.lensingStrength = this.config.lensingStrength > 0 ? 0 : 2.0;
                // Update GUI controllers
                for (let i in physicsFolder.__controllers) {
                    physicsFolder.__controllers[i].updateDisplay();
                }
            }
            
            // Toggle black hole strength with B key
            if (e.key.toLowerCase() === 'b') {
                this.config.gravityStrength = this.config.gravityStrength > 0 ? 0 : 1.0;
                // Update GUI controllers
                for (let i in physicsFolder.__controllers) {
                    physicsFolder.__controllers[i].updateDisplay();
                }
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Only run client-side physics if we're not using server physics
        if (!this.useServerPhysics || !window.multiplayerClient || !window.multiplayerClient.hasReceivedServerState()) {
            // Update particle physics
            this.updateParticlePhysics();
            
            // Update particle colors
            this.updateParticleColors();
        }
        
        // Rotate the rainbow ring for animated effect
        if (this.ringMesh) {
            this.ringMesh.rotation.z += 0.005;
        }
        
        // Rotate player rings if they exist
        if (this.playerPrisms) {
            for (const id in this.playerPrisms) {
                if (this.playerPrisms[id].ringMesh) {
                    this.playerPrisms[id].ringMesh.rotation.z += 0.005;
                }
            }
        }
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the simulation when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const simulator = new ParticleGravitySimulator();
});