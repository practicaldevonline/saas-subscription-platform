'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Navbar } from '@/components/Navbar';
import api from '@/lib/api';
import Link from 'next/link';
import { Download, ExternalLink, CreditCard, AlertTriangle, RefreshCw } from 'lucide-react';

interface Subscription {
  id: string;
  status: string;
  billingInterval: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface Invoice {
  id: string;
  stripeInvoiceId: string;
  amountPaid: number;
  currency: string;
  status: string;
  invoicePdfUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

export default function BillingPage() {
  return (
    <ProtectedRoute>
      <BillingContent />
    </ProtectedRoute>
  );
}

function BillingContent() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingPortal, setIsCreatingPortal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subResponse, invoicesResponse] = await Promise.all([
        api.get('/api/subscription/status'),
        api.get('/api/billing/invoices'),
      ]);
      setSubscription(subResponse.data.subscription);
      setInvoices(invoicesResponse.data.invoices || []);
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
      setError('Failed to load billing information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsCreatingPortal(true);
    setError(null);
    try {
      const response = await api.post('/api/stripe/create-portal-session');
      window.location.href = response.data.url;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to open billing portal');
      setIsCreatingPortal(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return;
    }

    setIsCanceling(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.post('/api/subscription/cancel');
      setSuccessMessage('Your subscription will be canceled at the end of the billing period.');
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to cancel subscription');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setIsReactivating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.post('/api/subscription/reactivate');
      setSuccessMessage('Your subscription has been reactivated.');
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to reactivate subscription');
    } finally {
      setIsReactivating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'trialing':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'canceled':
      case 'void':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '-';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <div className="flex-grow py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Billing & Invoices</h1>
            <p className="text-gray-600 mt-2">Manage your subscription and view invoice history</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-lg">
              {successMessage}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : (
            <>
              {/* Current Plan */}
              <div className="card mb-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Current Plan</h2>
                    {subscription ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold">
                            {subscription.plan?.name || 'Unknown Plan'}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}
                          >
                            {subscription.status}
                          </span>
                        </div>
                        <p className="text-gray-600">
                          Billing: <span className="capitalize">{subscription.billingInterval || 'monthly'}</span> | Next billing date:{' '}
                          {formatDate(subscription.currentPeriodEnd)}
                        </p>
                        {subscription.cancelAtPeriodEnd && (
                          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mt-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium">Subscription Canceling</p>
                              <p className="text-sm mt-1">
                                Your subscription will be canceled on{' '}
                                {formatDate(subscription.currentPeriodEnd)}. You will retain access until then.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-600">No active subscription</p>
                    )}
                  </div>
                  <CreditCard className="w-12 h-12 text-primary-600" />
                </div>

                {subscription && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleManageBilling}
                      disabled={isCreatingPortal}
                      className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreatingPortal ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Opening Portal...
                        </>
                      ) : (
                        <>
                          Manage Payment Method
                          <ExternalLink className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    {subscription.cancelAtPeriodEnd ? (
                      <button
                        onClick={handleReactivateSubscription}
                        disabled={isReactivating}
                        className="btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isReactivating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Reactivating...
                          </>
                        ) : (
                          'Reactivate Subscription'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={handleCancelSubscription}
                        disabled={isCanceling}
                        className="btn btn-outline text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
                      </button>
                    )}

                    <Link href="/pricing" className="btn btn-outline">
                      Change Plan
                    </Link>
                  </div>
                )}

                {!subscription && (
                  <Link href="/pricing" className="btn btn-primary">
                    View Plans
                  </Link>
                )}
              </div>

              {/* Invoice History */}
              <div className="card">
                <h2 className="text-xl font-semibold mb-6">Invoice History</h2>

                {invoices.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No invoices yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            Period
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                            Invoice
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 text-sm">
                              {formatDate(invoice.createdAt)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {invoice.periodStart && invoice.periodEnd ? (
                                <>
                                  {formatDate(invoice.periodStart)} -{' '}
                                  {formatDate(invoice.periodEnd)}
                                </>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm font-medium">
                              {formatCurrency(invoice.amountPaid, invoice.currency)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}
                              >
                                {invoice.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm">
                              {invoice.invoicePdfUrl ? (
                                <a
                                  href={invoice.invoicePdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                  <Download className="w-4 h-4" />
                                  PDF
                                </a>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
