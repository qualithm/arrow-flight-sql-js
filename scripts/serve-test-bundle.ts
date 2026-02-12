/**
 * Simple HTTP server for browser tests
 *
 * Serves the built library and test HTML files for Playwright tests.
 */

const PORT = 5173

const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Arrow Flight SQL Browser Tests</title>
  <script type="module">
    // Import the library and expose it globally for tests
    import * as FlightSql from '/dist/index.js';
    window.FlightSql = FlightSql;
    window.__FLIGHT_SQL_LOADED__ = true;
    console.log('Library loaded:', Object.keys(FlightSql));
  </script>
</head>
<body>
  <h1>Arrow Flight SQL Browser Test Environment</h1>
  <div id="status">Loading...</div>
  <script type="module">
    const statusEl = document.getElementById('status');
    
    // Wait for module to load
    const checkLoaded = () => {
      if (window.__FLIGHT_SQL_LOADED__) {
        statusEl.textContent = 'Library loaded successfully';
        statusEl.style.color = 'green';
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    checkLoaded();
  </script>
</body>
</html>
`

// Start server
Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname

    // Serve test HTML at root
    if (path === "/" || path === "/index.html") {
      return new Response(TEST_HTML, {
        headers: { "Content-Type": "text/html" }
      })
    }

    // Serve dist files
    if (path.startsWith("/dist/")) {
      const filePath = `.${path}`
      const file = Bun.file(filePath)
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "application/javascript" }
        })
      }
    }

    return new Response("Not Found", { status: 404 })
  }
})

console.log(`Test server running at http://localhost:${String(PORT)}`)
