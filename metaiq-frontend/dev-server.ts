import express, { Express, Request, Response } from 'express';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = 4200;
const BACKEND_API = 'http://localhost:3000';

// Middleware
app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// API Proxy to Backend
app.all('/api/*', (req: Request, res: Response) => {
  const targetUrl = `${BACKEND_API}${req.url}`;
  console.log(`📡 PROXY: ${req.method} ${req.url} → ${targetUrl}`);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'localhost:3000',
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';

    proxyRes.on('data', (chunk) => {
      data += chunk;
    });

    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      res.end(data);
    });
  });

  proxyReq.on('error', (err) => {
    console.error('❌ Proxy Error:', err.message);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Cannot reach backend',
      details: err.message,
    });
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Length', Buffer.byteLength(body));
    proxyReq.write(body);
  }

  proxyReq.end();
});

// SPA Fallback - serve index.html for all routes
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║  🎨 MetaIQ Frontend Dev Server        ║
╠═══════════════════════════════════════╣
║  Status: ✅ RUNNING                    ║
║  Frontend: http://localhost:${PORT}        ║
║  Backend:  http://localhost:3000      ║
║  API Proxy: /api/* → Backend          ║
╠═══════════════════════════════════════╣
║  Componentes Active:                  ║
║  • Dashboard (/dashboard)             ║
║  • Campanhas (/campaigns)             ║
║  • Auth (/auth)                       ║
╚═══════════════════════════════════════╝
  `);
});
