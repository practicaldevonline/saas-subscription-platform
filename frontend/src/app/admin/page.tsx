'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Users, CreditCard, DollarSign, TrendingUp, Settings, AlertCircle } from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  totalPlans: number;
  activePlans: number;
  totalRevenue: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/dashboard');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to load dashboard statistics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          icon={<Users className="w-6 h-6" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Active Subscriptions"
          value={stats?.activeSubscriptions || 0}
          icon={<CreditCard className="w-6 h-6" />}
          color="bg-green-500"
        />
        <StatCard
          title="Active Plans"
          value={stats?.activePlans || 0}
          icon={<TrendingUp className="w-6 h-6" />}
          color="bg-purple-500"
        />
        <StatCard
          title="Total Revenue"
          value={`$${(stats?.totalRevenue || 0).toFixed(2)}`}
          icon={<DollarSign className="w-6 h-6" />}
          color="bg-yellow-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/admin/settings/plans"
            className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <CreditCard className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-medium">Manage Plans</h3>
            <p className="text-sm text-gray-600">Create and edit subscription plans</p>
          </Link>
          <Link
            href="/admin/settings/users"
            className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-medium">Manage Users</h3>
            <p className="text-sm text-gray-600">View and manage user accounts</p>
          </Link>
          <Link
            href="/admin/settings"
            className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-medium">Settings</h3>
            <p className="text-sm text-gray-600">Configure application settings</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-600 text-sm">{title}</span>
        <div className={`${color} text-white p-2 rounded-lg`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
