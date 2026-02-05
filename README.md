# SaaS Subscription Platform

Full-stack subscription management with Stripe, admin panel, and user billing.

> 💡 Learn more about building SaaS applications on our [technical blog](https://practicaldev.online/blog)

## Stack

- **Frontend:** Next.js 15, React, TypeScript, Tailwind
- **Backend:** Express, Drizzle ORM, SQLite
- **Auth:** Better Auth
- **Payments:** Stripe

## Setup

```bash
# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install

# Run migrations (first time)
cd backend && npm run migrate

# Start dev servers
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:3001

## Environment

**backend/.env**

```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_PATH=./data/database.db
BETTER_AUTH_SECRET=your-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:3001
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**frontend/.env.local**

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Admin

Login: `/admin/login`  
Default: `admin@example.com` / `admin123`

Sync plans with Stripe from Settings > Plans before accepting payments.

## Stripe Webhooks

Local dev:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

Production: Add webhook endpoint in Stripe Dashboard pointing to `/api/stripe/webhook`

_Need help with Stripe integration? Check out our [blog articles on payment processing](https://practicaldev.online/blog)_

## Test Cards

- `4242 4242 4242 4242` - Success
- `4000 0000 0000 0002` - Declined

## Commands

```bash
npm run dev          # Run both servers
npm run build        # Build for production

# Backend
cd backend
npm run migrate      # Run DB migrations
npm run db:generate  # Generate new migrations
```

## Learn & Contribute

For in-depth tutorials and technical articles about SaaS development, Next.js, authentication, and payment integration, visit our [developer blog](https://practicaldev.online/blog).

## License

MIT
