# Vercel Deployment Guide

## 🚀 Deploy to Vercel (Both Frontend & Backend)

### Prerequisites
- Vercel account
- GitHub repository
- PostgreSQL database (Supabase, PlanetScale, or Neon recommended)

### 1. Backend Deployment

#### Step 1: Push to GitHub
```bash
git add .
git commit -m "Add Vercel deployment config"
git push origin main
```

#### Step 2: Deploy Backend to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. **Root Directory**: Leave as `.` (root)
5. **Framework Preset**: Other
6. **Build Command**: `npm install`
7. **Output Directory**: Leave empty
8. Click "Deploy"

#### Step 3: Set Environment Variables
In Vercel Dashboard → Project → Settings → Environment Variables, add:

```
DATABASE_URL=your-production-database-url
JWT_SECRET=your-super-secure-jwt-secret-32-chars-min
JWT_EXPIRE=7d
JWT_COOKIE_EXPIRE=7
CORS_ORIGIN=https://your-frontend-domain.vercel.app
NODE_ENV=production
DRM_SECRET_KEY=your-drm-secret-key-32-chars
ENCRYPTION_KEY=your-32-character-encryption-key-here
SESSION_SECRET=your-session-secret-32-chars-min
```

### 2. Frontend Deployment

#### Step 1: Update API URL
In `client/.env.production`, update:
```
REACT_APP_API_URL=https://your-backend-deployment.vercel.app/api/v1
```

#### Step 2: Deploy Frontend
1. In Vercel Dashboard, click "New Project"
2. Import the same GitHub repository
3. **Root Directory**: `client`
4. **Framework Preset**: Create React App
5. **Build Command**: `npm run build`
6. **Output Directory**: `build`
7. Click "Deploy"

### 3. Database Setup

#### Option A: Supabase (Recommended)
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → Database
4. Copy connection string
5. Update `DATABASE_URL` in Vercel environment variables

#### Option B: PlanetScale
1. Go to [planetscale.com](https://planetscale.com)
2. Create new database
3. Create branch and get connection string
4. Update `DATABASE_URL` in Vercel environment variables

### 4. Run Database Migrations

#### Option 1: Local Migration (Recommended)
```bash
# Set production database URL locally
export DATABASE_URL="your-production-database-url"

# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

#### Option 2: Prisma Studio
```bash
npx prisma studio --browser none
```

### 5. Post-Deployment Setup

#### Update CORS Origins
After both deployments, update backend environment variables:
```
CORS_ORIGIN=https://your-frontend-domain.vercel.app,https://your-backend-domain.vercel.app
```

#### Test Deployment
1. Visit your frontend URL
2. Try registering a new account
3. Upload an audio file (if admin)
4. Test audio playback

### 6. Domain Configuration (Optional)

#### Custom Domain for Frontend
1. Vercel Dashboard → Project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

#### Custom Domain for Backend
1. Add custom domain to backend project
2. Update `REACT_APP_API_URL` in frontend
3. Update `CORS_ORIGIN` in backend

### 7. Troubleshooting

#### Common Issues:

**Build Failures:**
- Check Node.js version compatibility
- Ensure all dependencies are in `package.json`
- Check build logs in Vercel dashboard

**Database Connection:**
- Verify `DATABASE_URL` format
- Ensure database accepts connections from Vercel IPs
- Check if migrations are applied

**CORS Errors:**
- Verify `CORS_ORIGIN` includes frontend domain
- Check if credentials are properly configured

**File Upload Issues:**
- Vercel has 50MB limit for serverless functions
- Consider using external storage (AWS S3, Cloudinary)

### 8. Environment Variables Checklist

**Backend (.env.production):**
- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET`
- [ ] `CORS_ORIGIN`
- [ ] `DRM_SECRET_KEY`
- [ ] `ENCRYPTION_KEY`
- [ ] `SESSION_SECRET`
- [ ] `NODE_ENV=production`

**Frontend (client/.env.production):**
- [ ] `REACT_APP_API_URL`
- [ ] `GENERATE_SOURCEMAP=false`

### 9. Monitoring & Maintenance

#### Vercel Analytics
- Enable Web Analytics in project settings
- Monitor performance and usage

#### Error Tracking
- Consider adding Sentry for error monitoring
- Monitor Vercel function logs

#### Database Monitoring
- Set up database monitoring alerts
- Regular backup strategy

---

## 📝 Quick Deploy Commands

```bash
# 1. Prepare for deployment
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main

# 2. Set up database (run locally with production DB URL)
export DATABASE_URL="your-production-database-url"
npx prisma migrate deploy
npx prisma generate

# 3. Deploy via Vercel CLI (optional)
npm i -g vercel
vercel --prod
```

## 🔗 Useful Links
- [Vercel Documentation](https://vercel.com/docs)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
