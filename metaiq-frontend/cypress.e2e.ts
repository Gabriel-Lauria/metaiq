/**
 * Exemplo de E2E Tests com Cypress
 * 
 * Para usar:
 * npm install --save-dev cypress
 * npx cypress open
 */

describe('Campaigns Feature E2E Tests', () => {
  beforeEach(() => {
    // Login antes de cada teste
    cy.visit('http://localhost:4200');
    cy.get('input[type="email"]').type('test@example.com');
    cy.get('input[type="password"]').type('password');
    cy.get('button:contains("Login")').click();
    cy.url().should('include', '/dashboard');
  });

  describe('Campaigns List', () => {
    it('should display campaigns list', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('app-campaigns').should('exist');
      cy.get('.campaign-item').should('have.length.greaterThan', 0);
    });

    it('should filter campaigns by status', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="filter-active"]').click();
      cy.get('.campaign-item').each(($el) => {
        cy.wrap($el).should('contain', 'ACTIVE');
      });
    });

    it('should search campaigns', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="search-input"]').type('Test Campaign');
      cy.get('.campaign-item').should('have.length', 1);
      cy.get('.campaign-item').should('contain', 'Test Campaign');
    });

    it('should sort campaigns', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="sort-name"]').click();
      
      // Verificar ordem alfabética
      const names: string[] = [];
      cy.get('.campaign-name').each(($el) => {
        names.push($el.text());
      }).then(() => {
        const sorted = [...names].sort();
        expect(names).to.deep.equal(sorted);
      });
    });

    it('should paginate campaigns', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="next-page"]').click();
      cy.get('.pagination-info').should('contain', 'Page 2');
    });
  });

  describe('Campaign Details', () => {
    it('should show campaign details', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('.campaign-item').first().click();
      cy.get('app-campaign-detail').should('exist');
      cy.get('[data-testid="campaign-name"]').should('not.be.empty');
      cy.get('[data-testid="campaign-metrics"]').should('exist');
    });

    it('should show campaign charts', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('.campaign-item').first().click();
      cy.get('canvas').should('exist');
      cy.get('[data-testid="chart-ctr"]').should('be.visible');
    });
  });

  describe('Theme Switching', () => {
    it('should toggle dark mode', () => {
      cy.visit('http://localhost:4200');
      cy.get('app-theme-toggle button').click();
      cy.get('body').should('have.class', 'dark-theme');
    });

    it('should persist theme preference', () => {
      cy.visit('http://localhost:4200');
      cy.get('app-theme-toggle button').click();
      cy.reload();
      cy.get('body').should('have.class', 'dark-theme');
    });
  });

  describe('Error Handling', () => {
    it('should show error notification on failed request', () => {
      cy.intercept('GET', '/api/campaigns', { statusCode: 500 }).as('getCampaigns');
      cy.visit('http://localhost:4200/campaigns');
      cy.wait('@getCampaigns');
      cy.get('[data-testid="error-notification"]').should('exist');
    });

    it('should retry on connection error', () => {
      cy.intercept('GET', '/api/campaigns', { forceNetworkError: true }).as('getCampaignsFailed');
      cy.intercept('GET', '/api/campaigns', { statusCode: 200, body: [] }).as('getCampaignsSuccess');
      cy.visit('http://localhost:4200/campaigns');
      cy.wait('@getCampaignsFailed');
      // Verificar se retry aconteceu (implementar lógica de retry)
    });
  });

  describe('Performance', () => {
    it('should load campaigns within acceptable time', () => {
      cy.visit('http://localhost:4200/campaigns', { timeout: 5000 });
      cy.get('.campaign-item').should('exist');
    });

    it('should render large lists with virtual scrolling', () => {
      // Mock 1000 campanhas
      cy.intercept('GET', '/api/campaigns', {
        statusCode: 200,
        body: Array.from({ length: 1000 }, (_, i) => ({
          id: `campaign-${i}`,
          name: `Campaign ${i}`,
          status: 'ACTIVE'
        }))
      }).as('getCampaigns');

      cy.visit('http://localhost:4200/campaigns');
      cy.wait('@getCampaigns');
      
      // Virtual scrolling deve renderizar apenas items visíveis
      cy.get('.campaign-item').should('have.length.lessThan', 100);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="search-input"]').should('have.attr', 'aria-label');
      cy.get('[data-testid="filter-active"]').should('have.attr', 'aria-label');
    });

    it('should be keyboard navigable', () => {
      cy.visit('http://localhost:4200/campaigns');
      cy.get('[data-testid="search-input"]').focus().should('be.focused');
      cy.focused().tab();
      cy.focused().should('have.attr', 'data-testid', 'filter-active');
    });
  });
});

// Exemplo de teste com API mocking
describe('API Integration Tests', () => {
  it('should handle rate limiting', () => {
    cy.intercept('GET', '/api/campaigns', { statusCode: 429 }).as('rateLimited');
    cy.visit('http://localhost:4200/campaigns');
    cy.wait('@rateLimited');
    cy.get('[data-testid="rate-limit-warning"]').should('be.visible');
  });

  it('should refresh token on 401', () => {
    cy.intercept('GET', '/api/campaigns', { statusCode: 401 }).as('unauthorized');
    cy.intercept('POST', '/api/auth/refresh', { statusCode: 200, body: { token: 'new-token' } }).as('refresh');
    cy.intercept('GET', '/api/campaigns', { statusCode: 200, body: [] }).as('getCampaigns');
    
    cy.visit('http://localhost:4200/campaigns');
    cy.wait('@unauthorized');
    cy.wait('@refresh');
    cy.wait('@getCampaigns');
  });
});
