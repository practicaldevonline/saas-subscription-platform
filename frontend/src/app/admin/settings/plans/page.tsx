'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, Edit, Trash2, RefreshCw, Check, X, AlertCircle, Zap } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  maxUsers: number | null;
  maxTeamMembers: number | null;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
}

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string;
  maxUsers: string;
  maxTeamMembers: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

const defaultFormData: PlanFormData = {
  name: '',
  slug: '',
  description: '',
  monthlyPrice: 0,
  yearlyPrice: 0,
  features: '',
  maxUsers: '',
  maxTeamMembers: '',
  isActive: true,
  isPopular: false,
  sortOrder: 0,
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/api/admin/plans');
      setPlans(response.data.plans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      setMessage({ type: 'error', text: 'Failed to load plans' });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData(defaultFormData);
    setShowModal(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      monthlyPrice: plan.monthlyPrice / 100,
      yearlyPrice: plan.yearlyPrice / 100,
      features: plan.features.join('\n'),
      maxUsers: plan.maxUsers?.toString() || '',
      maxTeamMembers: plan.maxTeamMembers?.toString() || '',
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        monthlyPrice: Math.round(formData.monthlyPrice * 100),
        yearlyPrice: Math.round(formData.yearlyPrice * 100),
        features: formData.features.split('\n').filter((f) => f.trim()),
        maxUsers: formData.maxUsers ? parseInt(formData.maxUsers) : null,
        maxTeamMembers: formData.maxTeamMembers ? parseInt(formData.maxTeamMembers) : null,
        isActive: formData.isActive,
        isPopular: formData.isPopular,
        sortOrder: formData.sortOrder,
      };

      if (editingPlan) {
        await api.put(`/api/admin/plans/${editingPlan.id}`, payload);
        setMessage({ type: 'success', text: 'Plan updated successfully' });
      } else {
        await api.post('/api/admin/plans', payload);
        setMessage({ type: 'success', text: 'Plan created successfully' });
      }

      setShowModal(false);
      fetchPlans();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save plan' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Are you sure you want to delete "${plan.name}"?`)) return;

    setMessage(null);
    try {
      await api.delete(`/api/admin/plans/${plan.id}`);
      setMessage({ type: 'success', text: 'Plan deleted successfully' });
      fetchPlans();
    } catch (error) {
      console.error('Failed to delete plan:', error);
      setMessage({ type: 'error', text: 'Failed to delete plan' });
    }
  };

  const handleSyncStripe = async (plan: Plan) => {
    setSyncingPlanId(plan.id);
    setMessage(null);
    try {
      await api.post(`/api/admin/plans/${plan.id}/sync-stripe`);
      setMessage({ type: 'success', text: `${plan.name} synced with Stripe successfully!` });
      fetchPlans();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to sync with Stripe' });
    } finally {
      setSyncingPlanId(null);
    }
  };

  const handleSyncAllPlans = async () => {
    setSyncingAll(true);
    setMessage(null);
    try {
      const response = await api.post('/api/admin/plans/sync-all');
      setMessage({ type: 'success', text: response.data.message });
      fetchPlans();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to sync plans' });
    } finally {
      setSyncingAll(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const unsyncedCount = plans.filter((p) => !p.stripePriceIdMonthly || !p.stripePriceIdYearly).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Plans Management</h1>
        <div className="flex items-center gap-3">
          {unsyncedCount > 0 && (
            <button
              onClick={handleSyncAllPlans}
              disabled={syncingAll}
              className="btn btn-outline flex items-center gap-2"
            >
              <Zap className={`w-4 h-4 ${syncingAll ? 'animate-pulse' : ''}`} />
              {syncingAll ? 'Syncing...' : `Sync All (${unsyncedCount})`}
            </button>
          )}
          <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Plan
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 px-6 py-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <p>{message.text}</p>
        </div>
      )}

      {/* Stripe Setup Notice */}
      {unsyncedCount > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Stripe Setup Required</p>
              <p className="text-sm mt-1">
                {unsyncedCount} plan(s) need to be synced with Stripe before they can be purchased.
                Click &quot;Sync All&quot; or sync individual plans using the sync button.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Plan</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Monthly</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Yearly</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Stripe</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-sm text-gray-500">{plan.slug}</div>
                    </div>
                    {plan.isPopular && (
                      <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full">
                        Popular
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 font-medium">{formatPrice(plan.monthlyPrice)}/mo</td>
                <td className="px-6 py-4 font-medium">{formatPrice(plan.yearlyPrice)}/yr</td>
                <td className="px-6 py-4">
                  {plan.isActive ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1 w-fit">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full flex items-center gap-1 w-fit">
                      <X className="w-3 h-3" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {plan.stripePriceIdMonthly && plan.stripePriceIdYearly ? (
                    <span className="text-green-600 text-sm flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      Synced
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSyncStripe(plan)}
                      disabled={syncingPlanId === plan.id}
                      className="text-primary-600 text-sm hover:underline flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${syncingPlanId === plan.id ? 'animate-spin' : ''}`}
                      />
                      {syncingPlanId === plan.id ? 'Syncing...' : 'Sync Now'}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditModal(plan)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(plan)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {plans.length === 0 && (
          <div className="text-center py-12 text-gray-500">No plans found</div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingPlan ? 'Edit Plan' : 'Create Plan'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Slug *</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value.toLowerCase() })
                    }
                    className="input"
                    pattern="[a-z0-9-]+"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Monthly Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.monthlyPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Yearly Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.yearlyPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, yearlyPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Features (one per line)</label>
                <textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  className="input min-h-[100px]"
                  placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Users</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxUsers}
                    onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value })}
                    className="input"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Team Members</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxTeamMembers}
                    onChange={(e) => setFormData({ ...formData, maxTeamMembers: e.target.value })}
                    className="input"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) =>
                      setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })
                    }
                    className="input"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPopular}
                    onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Mark as Popular</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="btn btn-primary">
                  {isSaving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
