/**
 * OTIMIZAÇÕES DE PERFORMANCE E BUNDLE SIZE
 * 
 * Recomendações implementadas e a implementar:
 */

export const PERFORMANCE_IMPROVEMENTS = {
  /**
   * 1. Code Splitting - Lazy Load de Rotas
   * Já implementado em app.routes.ts com loadComponent e loadChildren
   */
  codeSplitting: `
    // app.routes.ts
    const routes = [
      {
        path: 'campaigns',
        loadComponent: () => import('./features/campaigns').then(m => m.CampaignsComponent),
        canActivate: [authGuard]
      }
    ];
  `,

  /**
   * 2. Tree Shaking - Remover código não utilizado
   */
  treeShaking: `
    // Verificar no angular.json:
    "build": {
      "options": {
        "optimization": true,
        "sourceMap": false,
        "namedChunks": false,
        "aot": true,
        "buildOptimizer": true
      }
    }
  `,

  /**
   * 3. Compressão e Minificação
   */
  compression: `
    // Adicionar ao backend nginx/express:
    compression: gzip (configurar no servidor)
    brotli: para browsers modernos
  `,

  /**
   * 4. Image Optimization
   */
  imageOptimization: `
    // Usar WebP com fallback
    <picture>
      <source srcset="image.webp" type="image/webp">
      <source srcset="image.png" type="image/png">
      <img src="image.png" alt="">
    </picture>

    // Lazy load com loading="lazy"
    <img src="image.png" loading="lazy" alt="">
  `,

  /**
   * 5. Change Detection OnPush
   */
  changeDetection: `
    // Usar em componentes sem inputs dinâmicos
    @Component({
      selector: 'app-card',
      changeDetection: ChangeDetectionStrategy.OnPush
    })
  `,

  /**
   * 6. Preloading Strategy
   */
  preloading: `
    // app.routes.ts
    bootstrapApplication(AppComponent, {
      providers: [
        withPreloading(PreloadAllModules)
      ]
    })
  `,

  /**
   * 7. Service Worker para Caching
   */
  serviceWorker: `
    // ng add @angular/service-worker
    // Implementar offline support e caching
  `,

  /**
   * 8. HttpClient Caching
   */
  httpCaching: `
    // Implementar cache interceptor
    export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
      const cached = cache.get(req.url);
      if (cached && isCacheable(req)) {
        return of(cached);
      }
      return next(req).pipe(
        tap(response => cache.set(req.url, response))
      );
    };
  `,

  /**
   * 9. Bundle Analysis
   */
  bundleAnalysis: `
    // npm install -g webpack-bundle-analyzer
    // npm run build -- --stats-json
    // npx webpack-bundle-analyzer dist/stats.json
  `,

  /**
   * 10. Third-party Scripts
   */
  thirdParty: `
    // Carregar scripts third-party com async/defer
    <script src="analytics.js" async></script>
  `
};

/**
 * Checklist de Performance
 */
export const PERFORMANCE_CHECKLIST = [
  '✅ Lazy loading de rotas',
  '✅ Componentes standalone',
  '✅ Change detection OnPush',
  '✅ Virtual scrolling em listas grandes',
  '⚠️ Image optimization (implementar)',
  '⚠️ Service worker offline (implementar)',
  '⚠️ HTTP caching (implementar)',
  '⚠️ Bundle analysis e optimization',
  '⚠️ Remove unused dependencies',
  '⚠️ Tree shaking habilitado'
];
