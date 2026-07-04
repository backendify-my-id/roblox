export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7000';

export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
  }

  return response;
};

export const trackFeatureUsage = async (featureName, actionType = 'view') => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    await fetchWithAuth('/api/telemetry/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_name: featureName, action_type: actionType })
    });
  } catch (err) {
    console.error('Failed to track feature usage:', err);
  }
};
