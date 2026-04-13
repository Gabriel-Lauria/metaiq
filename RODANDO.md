# 🚀 MetaIQ - Sistema Completo Rodando

## Status Atual ✅

✅ **Backend (NestJS)** - Rodando em `http://localhost:3000`
✅ **Frontend (Express)**- Rodando em `http://localhost:4200`  
✅ **Proxy API** - Funcionando (`/api/*` → Backend)
✅ **Banco de Dados** - SQLite configurado

---

## 🎯 Como Usar

### Opção 1: Comandos Individuais

**Terminal 1 - Backend:**
```bash
cd metaiq-backend
npm run start:prod
```

**Terminal 2 - Frontend:**
```bash
cd metaiq-frontend
npm start
```

### Opção 2: Scripts Automáticos

**Windows (PowerShell):**
```bash
.\start.ps1
```

**Mac/Linux:**
```bash
./start.sh
```

---

## 📍 URLs

| Serviço | URL |
|---------|-----|
| Dashboard | http://localhost:4200 |
| Autenticação | http://localhost:4200/auth.html |
| API Backend | http://localhost:3000 |
| Health Check | http://localhost:3000/health |
| Proxy API | http://localhost:4200/api/* |

---

## 🔐 Credenciais de Teste

- **Email:** demo@metaiq.dev
- **Senha:** Demo@1234

---

## 📦 Estrutura de Pastas

```
metaiq/
├── metaiq-backend/          # NestJS Backend
│   ├── src/
│   │   ├── main.ts          # ✅ Entry point (corrigido)
│   │   ├── app.module.ts    # ✅ Principais módulos
│   │   └── app.controller.ts # ✅ Controladores
│   └── dist/                # Build compilado
│
└── metaiq-frontend/         # Express Frontend
    ├── server.js            # ✅ Express server (corrigido)
    └── src/
        ├── dashboard.html   # Principal página
        ├── auth.html        # Página de login
        ├── app.js           # Lógica do app
        ├── dashboard.css    # Estilos
        └── assets/          # Fontes, imagens
```

---

## ✨ Mudanças Realizadas

### Backend
- ✅ Corrigido `main.ts` para usar NestJS corretamente
- ✅ Criado `app.controller.ts` com health check
- ✅ Atualizado `app.module.ts` para registrar o controlador
- ✅ Build compile sem erros

### Frontend
- ✅ Simplificado `package.json` (removidas dependências Angular desnecessárias)
- ✅ Mantido Express como único servidor
- ✅ Corrigido routing para middleware (ao invés de `app.all('*')`)
- ✅ Proxy funcionando corretamente

---

## 🧪 Testes Rápidos

### Testar Backend
```bash
curl http://localhost:3000/health
```

### Testar Frontend
```bash
curl http://localhost:4200
```

### Testar Proxy
```bash
curl http://localhost:4200/api/health
```

---

## 🎨 Próximos Passos (Opcionais)

- [ ] Criar endpoints de autenticação (`POST /api/auth/login`)
- [ ] Implementar endpoints de campanhas (`GET /api/campaigns`)
- [ ] Conectar dashboard aos dados reais do backend
- [ ] Adicionar filtros e busca avançada
- [ ] Criar exportação de relatórios

---

## 📝 Debug

Se houver problemas:

1. **Matar todos os processos Node:**
   ```bash
   taskkill /F /IM node.exe
   ```

2. **Verificar portas em uso:**
   ```bash
   netstat -ano | findstr :3000
   netstat -ano | findstr :4200
   ```

3. **Limpar node_modules e reinstalar:**
   ```bash
   # Backend
   cd metaiq-backend
   rm -r node_modules
   npm install
   
   # Frontend
   cd metaiq-frontend
   rm -r node_modules
   npm install
   ```

---

última atualização: 2026-04-13 
Status: 🟢 OPERATIONAL
