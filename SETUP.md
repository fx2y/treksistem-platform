# Treksistem Authentication Setup Guide

This guide will help you set up the complete Google OAuth 2.0 authentication system for the Treksistem platform.

## Prerequisites

- Node.js ≥18.0.0
- PNPM ≥9.0.0
- Cloudflare account
- Google Cloud Platform account

## 1. Google OAuth Setup

### Create Google OAuth 2.0 Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API and Google Identity API
4. Navigate to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure the OAuth consent screen:
   - Application name: "Treksistem"
   - User support email: your-email@domain.com
   - Authorized domains: your-domain.com
6. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:3000` (development)
     - `https://your-domain.com` (production)
   - Authorized redirect URIs:
     - `http://localhost:3000` (development)
     - `https://your-domain.com` (production)

7. Copy the Client ID - you'll need it for configuration

## 2. Database Setup

### Create D1 Databases

```bash
# Development database
wrangler d1 create treksistem-db-mvp

# Staging database (optional)
wrangler d1 create treksistem-db-staging

# Production database
wrangler d1 create treksistem-db-production
```

### Update wrangler.toml

Replace the database IDs in `apps/api/wrangler.toml` with the actual IDs from the commands above.

### Run Database Migrations

```bash
# Development
cd packages/db
pnpm exec drizzle-kit push

# Production (when ready)
wrangler d1 migrations apply treksistem-db-production --env production
```

## 3. Environment Configuration

### Backend (API) Secrets

Set the required secrets for the Cloudflare Worker:

```bash
# Generate a strong JWT secret (32+ characters)
openssl rand -hex 32

# Set secrets for development
wrangler secret put JWT_SECRET
# Paste the generated JWT secret

wrangler secret put GOOGLE_CLIENT_ID
# Paste your Google OAuth Client ID

wrangler secret put CSRF_SECRET
# Paste a strong random string for CSRF protection

# For production environment
wrangler secret put JWT_SECRET --env production
wrangler secret put GOOGLE_CLIENT_ID --env production
wrangler secret put CSRF_SECRET --env production
```

### Frontend Environment Variables

1. Copy the example environment file:
   ```bash
   cd apps/web
   cp .env.example .env.local
   ```

2. Update `.env.local` with your values:
   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:8787
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   ```

## 4. Installation and Development

### Install Dependencies

```bash
# From root directory
pnpm install
```

### Start Development Servers

Open two terminal windows:

**Terminal 1 - Backend API:**
```bash
cd apps/api
pnpm dev
# API will be available at http://localhost:8787
```

**Terminal 2 - Frontend Web:**
```bash
cd apps/web
pnpm dev
# Web app will be available at http://localhost:3000
```

## 5. Testing the Authentication

1. Navigate to `http://localhost:3000`
2. You should see the Treksistem dashboard with authentication status
3. Click "Sign in with Google" to test the OAuth flow
4. After successful authentication, you should see your user profile

## 6. Security Features Implemented

### Backend Security

- ✅ **JWT Authentication**: Secure token-based authentication with 4-hour expiry
- ✅ **Token Revocation**: JTI-based token blacklisting
- ✅ **Rate Limiting**: IP and email-based rate limiting
- ✅ **CSRF Protection**: Cross-site request forgery protection
- ✅ **Security Headers**: Comprehensive security headers
- ✅ **Request Validation**: Zod-based request validation
- ✅ **Audit Logging**: Complete authentication event logging
- ✅ **Session Management**: Session ID tracking and concurrent session management

### Frontend Security

- ✅ **Secure Token Storage**: HttpOnly cookies with secure flags
- ✅ **Device Fingerprinting**: Advanced device identification for security
- ✅ **CSRF Token Management**: Automatic CSRF token handling
- ✅ **XSS Protection**: Content Security Policy and input sanitization
- ✅ **Secure API Client**: Automatic token attachment and error handling
- ✅ **Session Persistence**: Automatic token refresh and session management

### Database Security

- ✅ **User Role Management**: RBAC with MASTER_ADMIN, PARTNER_ADMIN, DRIVER roles
- ✅ **Context-based Permissions**: Partner-scoped role assignments
- ✅ **Audit Trail**: Complete audit logging for all authentication events
- ✅ **Data Encryption**: Secure storage of sensitive user data

## 7. Production Deployment

### Backend Deployment

```bash
cd apps/api

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Frontend Deployment

The frontend can be deployed to any static hosting service:

```bash
cd apps/web

# Build for production
pnpm build

# Deploy to your preferred platform (Vercel, Netlify, Cloudflare Pages, etc.)
```

## 8. Monitoring and Maintenance

### Health Checks

- Backend API: `GET /api/v1/ping`
- Database: `GET /api/v1/db-health`
- Auth system: `GET /api/v1/auth/health`

### System Maintenance

- **Token Cleanup**: Run `POST /api/v1/protected/system/cleanup` periodically to clean expired tokens
- **Database Monitoring**: Monitor database performance via `GET /api/v1/protected/system/health`
- **Security Monitoring**: Review audit logs for suspicious activity

### Performance Monitoring

The system includes built-in performance monitoring:
- Response time tracking
- Error rate monitoring
- Security event logging
- System health checks

## 9. Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure your frontend URL is added to the CORS origins in the API
2. **Google OAuth Errors**: Verify your Google Client ID and authorized domains
3. **Database Errors**: Check D1 database IDs and migrations
4. **Secret Errors**: Ensure all required secrets are set in Cloudflare

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your environment.

## 10. Security Best Practices

- **Rotate JWT secrets** every 90 days
- **Monitor authentication logs** for suspicious activity
- **Keep dependencies updated** for security patches
- **Use HTTPS in production** always
- **Review and audit** user permissions regularly
- **Backup your databases** regularly
- **Test your disaster recovery** procedures

## Support

For issues or questions:
1. Check the logs in the Cloudflare dashboard
2. Review the audit logs in the database
3. Use the built-in health check endpoints
4. Consult the API documentation for endpoint details