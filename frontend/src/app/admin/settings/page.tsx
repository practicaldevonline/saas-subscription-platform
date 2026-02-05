'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, Trash2, Save, UserPlus } from 'lucide-react';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  isPublic: boolean;
}

interface NewAdminForm {
  name: string;
  email: string;
  password: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  // Admin creation form
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState<NewAdminForm>({
    name: '',
    email: '',
    password: '',
  });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/api/admin/settings');
      setSettings(response.data.settings);
      const values: Record<string, string> = {};
      response.data.settings.forEach((s: Setting) => {
        values[s.key] = s.value;
      });
      setEditingValues(values);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;

    try {
      await api.put(`/api/admin/settings/${newKey}`, {
        value: newValue,
        description: newDescription || null,
        isPublic: newIsPublic,
      });
      setNewKey('');
      setNewValue('');
      setNewDescription('');
      setNewIsPublic(false);
      fetchSettings();
    } catch (error) {
      console.error('Failed to add setting:', error);
      alert('Failed to add setting');
    }
  };

  const handleUpdateSetting = async (key: string) => {
    try {
      await api.put(`/api/admin/settings/${key}`, {
        value: editingValues[key],
      });
      alert('Setting updated');
    } catch (error) {
      console.error('Failed to update setting:', error);
      alert('Failed to update setting');
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm(`Delete setting "${key}"?`)) return;

    try {
      await api.delete(`/api/admin/settings/${key}`);
      fetchSettings();
    } catch (error) {
      console.error('Failed to delete setting:', error);
      alert('Failed to delete setting');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAdmin(true);

    try {
      await api.post('/api/admin/users/create-admin', adminForm);
      alert('Admin user created successfully!');
      setAdminForm({ name: '', email: '', password: '' });
      setShowAdminForm(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || 'Failed to create admin user');
    } finally {
      setCreatingAdmin(false);
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">General Settings</h1>

      {/* Create Admin User Section */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Admin Users</h2>
          <button
            onClick={() => setShowAdminForm(!showAdminForm)}
            className="btn btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Create Admin
          </button>
        </div>

        {showAdminForm && (
          <form onSubmit={handleCreateAdmin} className="space-y-4 border-t pt-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  className="input"
                  placeholder="Admin Name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="input"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="input"
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdminForm(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button type="submit" disabled={creatingAdmin} className="btn btn-primary">
                {creatingAdmin ? 'Creating...' : 'Create Admin User'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Add new setting */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add New Setting</h2>
        <form onSubmit={handleAddSetting} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Key</label>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="input"
                placeholder="setting_key"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="input"
                placeholder="value"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsPublic}
                onChange={(e) => setNewIsPublic(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Public (accessible without auth)</span>
            </label>
            <button type="submit" className="btn btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Setting
            </button>
          </div>
        </form>
      </div>

      {/* Settings list */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Configuration Settings</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Key</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Value</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                Description
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Public</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {settings.map((setting) => (
              <tr key={setting.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">{setting.key}</code>
                </td>
                <td className="px-6 py-4">
                  <input
                    type="text"
                    value={editingValues[setting.key] || ''}
                    onChange={(e) =>
                      setEditingValues({ ...editingValues, [setting.key]: e.target.value })
                    }
                    className="input text-sm"
                  />
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {setting.description || '-'}
                </td>
                <td className="px-6 py-4">
                  {setting.isPublic ? (
                    <span className="text-green-600 text-sm">Yes</span>
                  ) : (
                    <span className="text-gray-400 text-sm">No</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleUpdateSetting(setting.key)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                      title="Save"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSetting(setting.key)}
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

        {settings.length === 0 && (
          <div className="text-center py-12 text-gray-500">No settings configured yet</div>
        )}
      </div>
    </div>
  );
}
