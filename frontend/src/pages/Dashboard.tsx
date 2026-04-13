import { useEffect, useState } from "react";
import { getCampaigns, getMetrics, logout } from "../services/api";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

interface Campaign {
  id: number;
  name: string;
  status: string;
  budget: number;
  spent: number;
}

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [campaignsData, metricsData] = await Promise.all([
        getCampaigns(),
        getMetrics(),
      ]);

      // Handle array response
      if (Array.isArray(campaignsData)) {
        setCampaigns(campaignsData);
      } else if (campaignsData && campaignsData.data) {
        setCampaigns(campaignsData.data);
      }

      setMetrics(metricsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar dados"
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  if (loading) {
    return <div className="dashboard">Carregando...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>MetaIQ Dashboard</h1>
          <button className="logout-btn" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="dashboard-content">
        {/* Métricas Gerais */}
        {metrics && (
          <section className="metrics-summary">
            <div className="metric-card">
              <h3>Total de Campanhas</h3>
              <p className="metric-value">{campaigns.length}</p>
            </div>
            <div className="metric-card">
              <h3>Orçamento Total</h3>
              <p className="metric-value">
                R$ {campaigns.reduce((sum, c) => sum + (c.budget || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="metric-card">
              <h3>Gasto Total</h3>
              <p className="metric-value">
                R$ {campaigns.reduce((sum, c) => sum + (c.spent || 0), 0).toLocaleString()}
              </p>
            </div>
          </section>
        )}

        {/* Lista de Campanhas */}
        <section className="campaigns-section">
          <h2>Suas Campanhas</h2>

          {campaigns.length === 0 ? (
            <p className="no-campaigns">Nenhuma campanha criada ainda</p>
          ) : (
            <div className="campaigns-grid">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="campaign-card">
                  <h3>{campaign.name}</h3>
                  <div className="campaign-status">
                    <span className={`status ${campaign.status || "active"}`}>
                      {campaign.status || "Ativa"}
                    </span>
                  </div>
                  <div className="campaign-info">
                    <div>
                      <label>Orçamento:</label>
                      <p>R$ {(campaign.budget || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <label>Gasto:</label>
                      <p>R$ {(campaign.spent || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  {campaign.budget && campaign.budget > 0 && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(
                            (campaign.spent / campaign.budget) * 100,
                            100
                          )}%`,
                        }}
                      ></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
