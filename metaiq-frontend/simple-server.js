const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 4200;
const SRC_DIR = path.join(__dirname, 'src');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ts': 'application/typescript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Remove leading slash
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }

  let filePath = path.join(SRC_DIR, pathname);

  try {
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Se é diretório, tenta index.html
      filePath = path.join(filePath, 'index.html');
    }

    // Ler arquivo
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (e) {
    // Arquivo não encontrado, servir index.html (SPA fallback)
    try {
      const indexPath = path.join(SRC_DIR, 'index.html');
      const data = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 - Arquivo não encontrado');
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n🎨 Frontend rodando em http://localhost:${PORT}`);
  console.log(`📦 Servindo arquivos de: src/\n`);
  console.log('   Credenciais de teste:');
  console.log('   Email:  demo@metaiq.dev');
  console.log('   Senha:  Demo@1234\n');
});

