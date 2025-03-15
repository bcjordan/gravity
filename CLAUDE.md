# GravitationalLensing Project Guidelines

## Project Structure
- `index.html` - Main HTML file with basic page structure
- `styles.css` - CSS styling for the application
- `main.js` - JavaScript implementation of the gravitational lensing simulation using Three.js

## Commands
- Run the application by serving with a local HTTP server
  ```bash
  npx serve .  # Serves the directory through http://localhost:3000
  ```

## Code Style Guidelines
- **Naming**: Use camelCase for variables and functions, PascalCase for classes
- **Indentation**: 4 spaces
- **Imports**: Import modules at the top of the file
- **JavaScript**: ES6 module syntax with classes for organization
- **Comments**: Include descriptive comments for complex functions
- **Organization**: Group related functions and properties together
- **Error Handling**: Use try/catch blocks for error-prone operations
- **Physics Constants**: Define physics constants as class properties 

## Three.js Conventions
- Initialize scene, camera, and renderer in a setup method
- Use BufferGeometry for efficient particle rendering
- Separate update logic from rendering logic
- Use requestAnimationFrame for the animation loop