'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Check, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getPlans, createCheckoutSession, type Plan } from '@/lib/api';

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const fetchedPlans = await getPlans();
      setPlans(fetchedPlans);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      setError('Failed to load pricing plans. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = async (plan: Plan) => {
    if (!isAuthenticated) {
      router.push('/register');
      return;
    }

    setError(null);
    setProcessingPlanId(plan.id);

    try {
      const checkoutUrl = await createCheckoutSession(plan.id, billingInterval);
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = error.response?.data?.error || error.message || 'Failed to start checkout';
      
      // Check if it's a Stripe configuration issue
      if (errorMessage.includes('not configured') || errorMessage.includes('sync')) {
        setError('Payment system is being configured. Please try again later or contact support.');
      } else {
        setError(errorMessage);
      }
      setProcessingPlanId(null);
    }
  };

  const formatPrice = (priceInCents: number) => {
    return (priceInCents / 100).toFixed(0);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <section className="py-20 px-4 flex-grow">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
            <p className="text-xl text-gray-600 mb-8">Choose the plan that works for you</p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <span className={billingInterval === 'monthly' ? 'font-semibold' : 'text-gray-600'}>
                Monthly
              </span>
              <button
                onClick={() =>
                  setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')
                }
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  billingInterval === 'yearly' ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    billingInterval === 'yearly' ? 'translate-x-6' : ''
                  }`}
                />
              </button>
              <span className={billingInterval === 'yearly' ? 'font-semibold' : 'text-gray-600'}>
                Yearly
                <span className="ml-2 text-sm text-primary-600 font-semibold">Save 20%</span>
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No plans available at the moment.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {plans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  billingInterval={billingInterval}
                  isAuthenticated={isAuthenticated}
                  isProcessing={processingPlanId === plan.id}
                  onSelect={() => handleSelectPlan(plan)}
                  formatPrice={formatPrice}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

interface PricingCardProps {
  plan: Plan;
  billingInterval: 'monthly' | 'yearly';
  isAuthenticated: boolean;
  isProcessing: boolean;
  onSelect: () => void;
  formatPrice: (price: number) => string;
}

function PricingCard({
  plan,
  billingInterval,
  isAuthenticated,
  isProcessing,
  onSelect,
  formatPrice,
}: PricingCardProps) {
  const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  const interval = billingInterval === 'monthly' ? 'mo' : 'yr';

  return (
    <div className={`card relative ${plan.isPopular ? 'border-2 border-primary-600 shadow-lg' : ''}`}>
      {plan.isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
          Most Popular
        </div>
      )}
      <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
      {plan.description && <p className="text-gray-600 text-sm mb-4">{plan.description}</p>}
      <div className="mb-6">
        <span className="text-4xl font-bold">${formatPrice(price)}</span>
        <span className="text-gray-600">/{interval}</span>
      </div>
      <ul className="space-y-3 mb-8">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <Check className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        disabled={isProcessing}
        className={`btn w-full ${plan.isPopular ? 'btn-primary' : 'btn-outline'} disabled:opacity-50`}
      >
        {isProcessing ? 'Processing...' : isAuthenticated ? 'Select Plan' : 'Get Started'}
      </button>
    </div>
  );
}
