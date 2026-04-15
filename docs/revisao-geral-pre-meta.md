# Revisão Geral Pré-Meta

## Escopo Revisado

- Login, sessão, logout e inicialização após refresh.
- Navegação por role: ADMIN, MANAGER, OPERATIONAL e CLIENT.
- Contexto de store no frontend e endpoint `GET /stores/accessible`.
- Dashboard por role.
- Listagem e filtro de campanhas por store.
- Fluxos de gestão: managers, stores, usuários e vínculos user-store.
- Contratos principais entre frontend e backend.

## Problemas Encontrados

- O contexto de store não persistia a store selecionada entre refreshes.
- O dashboard exibia CTR multiplicado por 100 duas vezes, distorcendo o percentual.
- O dashboard mostrava cards de contagem gerencial para OPERATIONAL, misturando visão operacional com gestão.
- A tela de campanhas montava a URL de filtro por store manualmente, em vez de usar o contrato tipado do `ApiService`.
- A tipagem local de campanha ainda aceitava `ENDED`, enquanto o backend usa `ARCHIVED`.
- As telas de gestão tinham pouco feedback após ações de sucesso e alguns empty states fracos.
- O model de `AdAccount` no frontend ainda assumia `metaAccountId` e `accessToken` obrigatório, mas o backend retorna `metaId` e omite token.

## Correções Aplicadas

- Store selecionada agora é persistida em `localStorage` pelo `StoreContextService`.
- CTR do dashboard agora é exibido como percentual já calculado pelo backend.
- Cards de stores/usuários/campanhas no dashboard ficam restritos a ADMIN e MANAGER.
- `ApiService.getCampaigns()` passou a aceitar `storeId` com `HttpParams`.
- `CampaignsComponent` agora usa o método tipado do `ApiService`.
- Tipagem local de campaign foi alinhada para `ARCHIVED`.
- Telas de managers, stores e users ganharam mensagens simples de sucesso e estados vazios.
- Formulários de stores/users ganharam validações front-end básicas para evitar submits frágeis.
- `AdAccount` no frontend agora aceita `metaId`, `metaAccountId` opcional e token opcional.

## Validação Funcional Por Role

### ADMIN

- Login e dashboard administrativo mínimo seguem funcionando.
- Menu não mostra campanhas operacionais por padrão.
- Managers, stores e usuários ficam disponíveis.
- Rotas administrativas permanecem protegidas por role.

### MANAGER

- Acesso a central do tenant, campanhas, stores e usuários.
- Criação de stores usa tenant do usuário no backend.
- Criação de usuários continua restrita a OPERATIONAL e CLIENT.
- Vínculos user-store seguem validados contra tenant.

### OPERATIONAL

- Acesso a dashboard operacional e campanhas.
- Store context usa `GET /stores/accessible`.
- Filtro de campanhas por store usa store acessível e contrato tipado.
- Não acessa telas de gestão.

### CLIENT

- Vê apenas resumo/dashboard.
- Não vê menu operacional.
- Dashboard usa linguagem mais executiva.
- Store única é selecionada automaticamente quando aplicável.

## Pendências Para Fase 7.6 UI/UX

- Revisar visual do dashboard atual, que ainda carrega estilos antigos e paleta pesada.
- Melhorar hierarquia visual dos cards e listas.
- Refinar microcopy de CLIENT com linguagem ainda menos técnica.
- Criar padrões visuais consistentes para feedback de sucesso/erro.
- Avaliar lazy loading para reduzir warning de bundle inicial.

## Pendências Para Fase 8 Meta

- Conectar fluxo real de Meta Ads.
- Trocar dados seed/demo por dados sincronizados.
- Tratar estados de conexão Meta por store/ad account.
- Validar métricas reais e mapeamento de campaign/ad account.
- Planejar backfill definitivo de `storeId` antes de remover legado.

## Riscos Ainda Existentes

- `userId` legado ainda existe por compatibilidade e precisa de backfill futuro.
- Algumas rotinas internas unsafe continuam existindo, mas estão nomeadas explicitamente.
- O frontend ainda depende de dados seed para experiência completa até integração Meta.
- O bundle Angular segue acima do budget configurado, embora não bloqueie execução.

## Veredito

Pronto para Fase 7.6 com ressalvas de UI/UX e integração Meta ainda pendentes.
