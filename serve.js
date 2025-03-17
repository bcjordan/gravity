import { serve } from "bun";

const server = serve({
  port: 3000,
  hostname: "0.0.0.0",  // Make sure to listen on all interfaces
  fetch(req) {
    const url = new URL(req.url);
    
    // Serve files from the current directory
    if (url.pathname === "/") {
      return new Response(Bun.file("index.html"));
    }
    
    // Serve other files
    const filePath = "." + url.pathname;
    const file = Bun.file(filePath);
    
    return new Response(file);
  },
});

console.log(`HTTP server running at http://${server.hostname}:${server.port}`);