const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = 4200;

// Middleware
app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Proxy API requests to backend
app.use('/api', (req, res) => {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'localhost:3000'
    }
  };

  console.log(`📡 PROXY: ${req.method} /api${req.url}`);
  
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    console.log(`   Body: ${JSON.stringify(req.body)}`);
  }

  const proxyRequest = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyRequest.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).json({
      error: 'Backend unavailable',
      message: err.message
    });
  });

  // Send body if present
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body && Object.keys(req.body).length > 0) {
      const body = JSON.stringify(req.body);
      proxyRequest.setHeader('Content-Type', 'application/json');
      proxyRequest.setHeader('Content-Length', Buffer.byteLength(body));
      proxyRequest.write(body);
    }
    proxyRequest.end();
  } else {
    proxyRequest.end();
  }
});

// Routing
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'dashboard.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'auth.html'));
});

app.get('/campaigns', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'dashboard.html'));
});

// Fallback for all other routes - serve SPA
app.use((req, res) => {
  // If requesting a file with extension, try to serve it
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return res.status(404).send('Not Found');
  }
  // Otherwise serve dashboard.html for SPA routing
  res.sendFile(path.join(__dirname, 'src', 'dashboard.html'));
});

app.listen(PORT, () => {
  const banner = `
╔══════════════════════════════════════════════════╗
║      🎨 MetaIQ Frontend Development Server      ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  🌐 URL: http://localhost:${PORT}                  ║
║  📡 Backend: http://localhost:3000               ║
║  🔄 Proxy: /api/* → Backend                      ║
║                                                  ║
║  ✅ Status: RUNNING                              ║
║                                                  ║
║  📝 Demo Credentials:                            ║
║     Email: demo@metaiq.dev                       ║
║     Password: Demo@1234                          ║
║                                                  ║
╚══════════════════════════════════════════════════╝`;

  console.log(banner);
});
