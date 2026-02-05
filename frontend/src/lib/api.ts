import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear local session
      clearAuthToken();
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const sessionCookie = cookies.find((c) =>
    c.trim().startsWith('better-auth.session_token=')
  );

  if (sessionCookie) {
    return sessionCookie.split('=')[1];
  }

  return null;
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  document.cookie =
    'better-auth.session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}

// Plan types
export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  maxUsers: number | null;
  maxTeamMembers: number | null;
  isPopular: boolean;
  sortOrder: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
}

// Fetch all active plans
export async function getPlans(): Promise<Plan[]> {
  const response = await api.get('/api/plans');
  return response.data.plans;
}

// Create checkout session
export async function createCheckoutSession(
  planId: string,
  billingInterval: 'monthly' | 'yearly'
): Promise<string> {
  const response = await api.post('/api/stripe/create-checkout-session', {
    planId,
    billingInterval,
  });
  return response.data.url;
}

export default api;
