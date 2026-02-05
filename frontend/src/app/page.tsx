import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { CheckCircle, Zap, Shield, TrendingUp } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Build Your SaaS Product
            <br />
            <span className="text-primary-600">Faster Than Ever</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Production-grade subscription platform with authentication, payments, and billing built-in.
            Start building features, not infrastructure.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register" className="btn btn-primary text-lg px-8 py-3">
              Get Started Free
            </Link>
            <Link href="/pricing" className="btn btn-outline text-lg px-8 py-3">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Everything You Need to Launch
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Zap className="w-8 h-8 text-primary-600" />}
              title="Fast Setup"
              description="Get started in minutes with our pre-configured stack"
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-primary-600" />}
              title="Secure Auth"
              description="JWT-based authentication with Better Auth"
            />
            <FeatureCard
              icon={<CheckCircle className="w-8 h-8 text-primary-600" />}
              title="Stripe Integration"
              description="Full subscription management with automatic invoicing"
            />
            <FeatureCard
              icon={<TrendingUp className="w-8 h-8 text-primary-600" />}
              title="Production Ready"
              description="Battle-tested architecture for scale"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 text-primary-100">
            Join thousands of developers building amazing SaaS products
          </p>
          <Link href="/register" className="btn bg-white text-primary-600 hover:bg-gray-100 text-lg px-8 py-3">
            Start Your Free Trial
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

