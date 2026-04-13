const API_URL = 'http://localhost:3000/api';

// Mock Data
const mockCampaigns = [
  {
    id: 'camp_001',
    name: 'Conversão — Ecommerce Principal',
    status: 'active',
    ctr: 3.21,
    cpa: 32,
    roas: 4.2,
    score: 88
  },
  {
    id: 'camp_002',
    name: 'Leads — Formulário B2B',
    status: 'active',
    ctr: 1.87,
    cpa: 67,
    roas: 1.8,
    score: 42
  },
  {
    id: 'camp_003',
    name: 'Remarketing — Carrinho',
    status: 'active',
    ctr: 4.5,
    cpa: 18,
    roas: 6.1,
    score: 95
  },
  {
    id: 'camp_004',
    name: 'Brand Awareness Q1',
    status: 'paused',
    ctr: 0.92,
    cpa: 0,
    roas: 0,
    score: 29
  },
  {
    id: 'camp_005',
    name: 'Catálogo Dinâmico',
    status: 'active',
    ctr: 2.33,
    cpa: 44,
    roas: 3.4,
    score: 71
  }
];

const mockInsights = [
  {
    type: 'danger',
    label: 'alerta',
    message: 'CPA alto em "Leads B2B" — R$67, acima do limite de R$50.'
  },
  {
    type: 'success',
    label: 'destaque',
    message: 'Remarketing com ROAS 6.1× — melhor performance do período.'
  },
  {
    type: 'warning',
    label: 'atenção',
    message: '"Brand Awareness" pausada há 7 dias sem conversões.'
  },
  {
    type: 'info',
    label: 'info',
    message: 'Sincronização de 5 campanhas realizada com sucesso.'
  },
  {
    type: 'success',
    label: 'destaque',
    message: 'ROAS médio da conta acima de 3.0 — performance positiva.'
  }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  initializeCharts();
});

function initializeApp() {
  // Set current date
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('pt-BR');

  // Load campaigns
  renderCampaignTable();
  renderCampaignsList();
  renderInsights();
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      navigateToView(href);
    });
  });

  // Tab switching
  document.querySelectorAll('.tab').forEach((tab, i) => {
    if (i === 0) tab.classList.add('active');
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

function navigateToView(viewId) {
  // Hide all views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  // Remove active from nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Show selected view
  const viewSelector = viewId.replace('#', '') + '-view';
  const view = document.getElementById(viewSelector);
  if (view) {
    view.classList.add('active');
  }

  // Activate nav item
  const navItem = document.querySelector(`.nav-item[href="${viewId}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }

  // Update charts if dashboard
  if (viewId === '#dashboard') {
    setTimeout(() => {
      updateCharts();
    }, 100);
  }
}

function renderCampaignTable() {
  const tbody = document.querySelector('.campaign-table tbody');
  if (!tbody) {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>Campanha</th>
      <th>Status</th>
      <th>CTR</th>
      <th>CPA</th>
      <th>ROAS</th>
      <th>Score</th>
    `;
    thead.appendChild(headerRow);
    document.querySelector('.campaign-table').appendChild(thead);
    
    const newTbody = document.createElement('tbody');
    document.querySelector('.campaign-table').appendChild(newTbody);
  }

  const table = document.querySelector('.campaign-table tbody');
  table.innerHTML = mockCampaigns
    .map(
      campaign => `
      <tr>
        <td>
          <div class="campaign-name">${campaign.name}</div>
          <div class="campaign-id">#${campaign.id}</div>
        </td>
        <td>
          <span class="status-pill ${campaign.status}">
            ${campaign.status === 'active' ? 'Ativa' : 'Pausada'}
          </span>
        </td>
        <td class="mono">${campaign.ctr.toFixed(2)}%</td>
        <td class="mono">${campaign.cpa > 0 ? 'R$' + campaign.cpa : '—'}</td>
        <td class="mono">${campaign.roas > 0 ? campaign.roas.toFixed(1) + '×' : '—'}</td>
        <td>
          <div class="score-bar-wrap">
            <div class="score-bar">
              <div class="score-fill" style="width: ${campaign.score}%; background: ${getScoreColor(campaign.score)}"></div>
            </div>
            <span class="score-num" style="color: ${getScoreColor(campaign.score)}">${campaign.score}</span>
          </div>
        </td>
      </tr>
    `
    )
    .join('');
}

function renderCampaignsList() {
  const list = document.getElementById('campaignsList');
  list.innerHTML = mockCampaigns
    .map(
      campaign => `
      <div class="campaign-row">
        <div class="campaign-summary" style="display: flex; align-items: center; padding: 16px; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div>
              <div class="campaign-name">${campaign.name}</div>
              <div class="campaign-id">#${campaign.id}</div>
            </div>
          </div>
          <div style="display: flex; gap: 24px; align-items: center;">
            <div style="text-align: center;">
              <div style="font-size: 10px; color: #4a5568; text-transform: uppercase;">CTR</div>
              <div style="font-size: 13px; font-weight: 600; font-family: 'Space Mono';">${campaign.ctr.toFixed(2)}%</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 10px; color: #4a5568; text-transform: uppercase;">ROAS</div>
              <div style="font-size: 13px; font-weight: 600; font-family: 'Space Mono';">${campaign.roas.toFixed(1)}×</div>
            </div>
            <span class="status-pill ${campaign.status}" style="margin: 0;">
              ${campaign.status === 'active' ? 'Ativa' : 'Pausada'}
            </span>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

function renderInsights() {
  const list = document.getElementById('insightsList');
  list.innerHTML = mockInsights
    .map(
      insight => `
      <div class="insight-item ${insight.type}">
        <div class="insight-icon">${getInsightIcon(insight.type)}</div>
        <div>
          <div class="insight-type">${insight.label}</div>
          <div class="insight-msg">${insight.message}</div>
        </div>
      </div>
    `
    )
    .join('');
}

function getScoreColor(score) {
  if (score >= 80) return '#34d399';
  if (score >= 55) return '#fbbf24';
  return '#fc8181';
}

function getInsightIcon(type) {
  const icons = {
    success: '✓',
    warning: '~',
    danger: '!',
    info: 'i'
  };
  return icons[type] || '•';
}

// Charts
let spendChart, roasChart;

function initializeCharts() {
  createSpendChart();
  createRoasChart();
}

function createSpendChart() {
  const ctx = document.getElementById('spendChart');
  if (!ctx) return;

  const labels = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(2026, 2, 12 + i);
    return d.getDate() + '/' + (d.getMonth() + 1);
  });

  const spendData = Array.from({ length: 30 }, () => Math.round(1200 + Math.random() * 800));
  const convData = Array.from({ length: 30 }, () => Math.round(20 + Math.random() * 40));

  spendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Gasto (R$)',
          data: spendData,
          borderColor: '#6ee7f7',
          backgroundColor: 'rgba(110,231,247,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Conversões',
          data: convData,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52,211,153,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [4, 3],
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2035',
          borderColor: '#2d3a50',
          borderWidth: 1,
          titleColor: '#c8d3e8',
          bodyColor: '#7a8aa0'
        }
      },
      scales: {
        x: {
          ticks: { color: '#4a5568', font: { size: 10 }, maxTicksLimit: 8 },
          grid: { color: '#131929' }
        },
        y: {
          position: 'left',
          ticks: { color: '#6ee7f7', font: { size: 10 }, callback: v => 'R$' + v },
          grid: { color: '#131929' }
        },
        y1: {
          position: 'right',
          ticks: { color: '#34d399', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function createRoasChart() {
  const ctx = document.getElementById('roasChart');
  if (!ctx) return;

  const campNames = mockCampaigns.map(c => c.name.split('—')[0].trim().substring(0, 12));
  const roasValues = mockCampaigns.map(c => c.roas);
  const roasColors = mockCampaigns.map(c =>
    c.roas >= 3 ? 'rgba(52,211,153,0.7)' : c.roas > 0 ? 'rgba(251,191,36,0.7)' : 'rgba(74,85,104,0.5)'
  );

  roasChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: campNames,
      datasets: [
        {
          label: 'ROAS',
          data: roasValues,
          backgroundColor: roasColors,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2035',
          borderColor: '#2d3a50',
          borderWidth: 1,
          titleColor: '#c8d3e8',
          bodyColor: '#7a8aa0',
          callbacks: {
            label: ctx => 'ROAS: ' + ctx.raw.toFixed(1) + '×'
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#4a5568', font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#4a5568', font: { size: 10 }, callback: v => v + '×' },
          grid: { color: '#131929' }
        }
      }
    }
  });
}

function updateCharts() {
  if (spendChart) spendChart.resize();
  if (roasChart) roasChart.resize();
}

function logout() {
  localStorage.removeItem('accessToken');
  window.location.href = '/auth.html';
}
