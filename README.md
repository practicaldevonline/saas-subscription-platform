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

For complete Stripe integration details, see our [Stripe Subscription Payment Guide](https://practicaldev.online/blog/node/stripe-subscription-payment-complete-guide).

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

## Related Tutorials & Guides

**Frontend & React:**

- [React Hook Form + Zod Validation](https://practicaldev.online/blog/reactjs/react-hook-form-zod-validation-guide) - Form validation best practices
- [TypeScript React Best Practices](https://practicaldev.online/blog/tools-services/typescript/typescript-react-best-practices) - Type-safe React development
- [Next.js Caching & Rendering Guide](https://practicaldev.online/blog/nextjs/nextjs-caching-rendering-complete-guide) - Optimize performance and SEO
- [TanStack Table React Implementation](https://practicaldev.online/blog/reactjs/tanstack-table-react-implementation) - Advanced data table solutions
- [Redux Toolkit & RTK Query](https://practicaldev.online/blog/reactjs/redux-toolkit-rtk-query-guide) - State management patterns
- [Next.js Server Actions](https://practicaldev.online/blog/nextjs/nextjs-server-actions-complete-guide) - Simplified server communication

**Backend & API:**

- [Express.js REST API Setup](https://practicaldev.online/blog/express/express-js-rest-api-setup) - API structure and best practices
- [JWT Authentication in Express](https://practicaldev.online/blog/express/jwt-authentication-express-nodejs) - Secure user authentication
- [Multer File Upload](https://practicaldev.online/blog/express/multer-file-upload-express) - Handle file uploads

**Database & ORM:**

- [Prisma ORM Complete Guide](https://practicaldev.online/blog/database/prisma-orm-complete-guide) - Database queries and migrations
- [Sequelize ORM MySQL Setup](https://practicaldev.online/blog/database/sequelize-orm-mysql-setup) - Alternative ORM patterns

**Authentication & Payments:**

- [Stripe Subscription Payment Guide](https://practicaldev.online/blog/node/stripe-subscription-payment-complete-guide) - Complete payment flow integration
- [Cloudinary Image Upload](https://practicaldev.online/blog/node/cloudinary-image-upload-nodejs) - Media file handling

## License

MIT
