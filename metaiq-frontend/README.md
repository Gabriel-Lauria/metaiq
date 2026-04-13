# metaIQ Frontend — Angular 19

## Setup
```bash
npm install
ng serve        # dev em http://localhost:4200
ng build        # build de produção
```

## Estrutura
```
src/app/
├── core/
│   ├── models/         Interfaces TypeScript
│   ├── services/       AuthService, ApiService
│   ├── guards/         authGuard, guestGuard
│   └── interceptors/   authInterceptor (JWT + refresh automático)
│
├── features/
│   ├── auth/           Login + Registro
│   ├── dashboard/      KPIs, gráficos, insights
│   ├── campaigns/      Tabela com métricas e drill-down
│   └── accounts/       Contas Meta conectadas
│
└── shared/
    └── layout/         ShellComponent (sidebar + roteador)
```

## Páginas
| Rota | Componente | Descrição |
|---|---|---|
| /auth | AuthComponent | Login / Registro |
| /dashboard | DashboardComponent | KPIs, gráficos, insights |
| /campaigns | CampaignsComponent | Tabela com score e drill-down |
| /accounts | AccountsComponent | Contas Meta + botão conectar |

## Variável de ambiente
Editar `src/environments/environment.ts`:
```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',  // URL do backend NestJS
};
```
