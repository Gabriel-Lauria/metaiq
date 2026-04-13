const API_URL = "http://localhost:3000";

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error("Falha ao fazer login");
  }

  return res.json();
}

export async function getCampaigns() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/campaigns`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Falha ao buscar campanhas");
  }

  return res.json();
}

export async function getMetrics() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/metrics`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Falha ao buscar métricas");
  }

  return res.json();
}

export async function logout() {
  localStorage.removeItem("token");
}
