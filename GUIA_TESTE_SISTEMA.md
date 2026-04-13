# 🧪 GUIA DE TESTE - MetaIQ Sistema Ponta-a-Ponta

## ✅ Status Atual

```
BACKEND:   ✅ Rodando em http://localhost:3000
FRONTEND:  ✅ Rodando em http://localhost:5173
DATABASE:  ✅ PostgreSQL conectado
```

---

## 🚀 COMO TESTAR

### PASSO 1: Acessar a Aplicação
Abra seu navegador e vá para:
```
http://localhost:5173
```

### PASSO 2: Login
Você será redirecionado para a página de login.

**Use credenciais de teste:**
- Email: `usuario@teste.com` (ou qualquer email registrado no seu banco)
- Senha: `123456` (ou a senha registrada)

> 💡 Se você não tem usuário criado, use o seed data do backend

### PASSO 3: Dashboard
Após fazer login, você será redirecionado para o dashboard onde verá:
- Total de Campanhas
- Orçamento Total
- Gasto Total
- Lista de suas campanhas com detalhes

### PASSO 4: Sair
Clique no botão **"Sair"** no canto superior direito para fazer logout.

---

## 📋 O QUE FOI IMPLEMENTADO

### 🔐 Autenticação
- ✅ Login com email e senha
- ✅ JWT token armazenado em localStorage
- ✅ Redirecionamento automático para dashboard
- ✅ Logout com limpeza de token

### 📊 Dashboard
- ✅ Exibição de campanhas
- ✅ Métricas resumidas (total, orçamento, gasto)
- ✅ Cards com informações de cada campanha
- ✅ Barra de progresso de gasto vs orçamento
- ✅ Status de campanha (Ativa, Pausada, Arquivada)

### 🛡️ Proteção de Rota
- ✅ Rotas protegidas (redirecionamento se não autenticado)
- ✅ Verificação de token no localStorage
- ✅ Navegação segura entre páginas

### 🎨 UI/UX
- ✅ Design moderno com gradiente roxo
- ✅ Responsivo para mobile
- ✅ Transições suaves
- ✅ Feedback visual (loading, erros)

---

## 🔗 ARQUITETURA DO FRONTEND

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.tsx      (Página de login)
│   │   ├── Login.css      (Estilos do login)
│   │   ├── Dashboard.tsx  (Página do dashboard)
│   │   └── Dashboard.css  (Estilos do dashboard)
│   ├── services/
│   │   └── api.ts         (Funções de API com token JWT)
│   ├── hooks/
│   │   └── useAuth.ts     (Gerenciamento de autenticação)
│   ├── App.tsx            (Rotas e ProtectedRoute)
│   ├── App.css            (Estilos globais)
│   ├── main.tsx           (Entry point)
│   └── index.css          (Estilos base)
└── vite.config.ts         (Configuração do Vite)
```

---

## 📡 ENDPOINTS USADOS

### Login
```
POST /auth/login
Body: { email, password }
Response: { access_token }
```

### Campanhas
```
GET /campaigns
Headers: Authorization: Bearer <token>
Response: Campaign[]
```

### Métricas
```
GET /metrics
Headers: Authorization: Bearer <token>
Response: Metrics
```

---

## 🐛 TROUBLESHOOTING

### "Conexão recusada" ao fazer login
- Verifique se o backend está rodando: `npm run start` em `metaiq-backend`
- Verifique se PostgreSQL está rodando
- Verifique as variáveis de ambiente em `.env`

### "404 Not Found" nas campanhas
- Crie campanhas no banco de dados usando o seed
- Verifique se o endpoint `/campaigns` existe no backend

### Token inválido
- Limpe localStorage: `localStorage.clear()`
- Faça login novamente
- Verifique se o JWT_SECRET está configurado no backend

### Erro de CORS
- Verifique se o backend tem CORS habilitado
- Adicione `@EnableCors()` no `main.ts`

---

## 🚀 PRÓXIMOS PASSOS (SPRINT 2)

### Frontend
- [ ] Melhorar UI com icons (FontAwesome, Heroicons)
- [ ] Adicionar gráficos (Chart.js, Recharts)
- [ ] Implementar filtros de campanha
- [ ] Criar página de detalhes da campanha
- [ ] Adicionar formulário de criação de campanha

### Backend
- [ ] Implementar Refresh Token
- [ ] Adicionar mais validações
- [ ] Criar endpoints CRUD para campanhas
- [ ] Integrar com API da Meta
- [ ] Implementar analytics

### DevOps
- [ ] Configurar GitHub Actions para CI/CD
- [ ] Docker compose para development
- [ ] Variáveis de ambiente por ambiente
- [ ] Testes automatizados

---

## 📞 SUPORTE

Se encontrar problemas:
1. Verifique se backend e frontend estão rodando
2. Revise as variáveis de ambiente
3. Cheque logs do terminal
4. Limpe cache e localStorage do navegador

---

**Ambiente:** Development  
**Stack:** React 18 + Vite + NestJS + PostgreSQL  
**Última atualização:** 2026-04-13
