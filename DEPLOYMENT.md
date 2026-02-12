# Deployment Guide for Render

This guide explains how to deploy your video player application to Render using local environment files.

## Environment Setup

The application uses environment-specific `.env` files:

- **`.env.local`** - Local development
- **`.env.staging`** - Staging environment
- **`.env.production`** - Production environment

### Environment Variables

Each environment file should contain:

```env
NODE_ENV=production
PORT=3001
VITE_API_URL=https://your-app.onrender.com
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

**Important**: Update the `VITE_API_URL` in `.env.production` with your actual Render URL after deployment.

## Deploying to Render

### Method 1: Using render.yaml (Recommended)

1. **Push your code to GitHub** (including environment files):
   ```bash
   git add .
   git commit -m "Add Render deployment configuration"
   git push origin master
   ```

2. **Connect to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" and select "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file

3. **Review and Deploy**:
   - Review the configuration
   - Click "Apply" to start deployment

### Method 2: Manual Setup

1. **Create a New Web Service**:
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure the Service**:
   - **Name**: `video-player`
   - **Region**: Choose your preferred region
   - **Branch**: `master`
   - **Build Command**: `npm install && npm run build:production`
   - **Start Command**: `npm run start:production`

3. **Environment Variables** (Optional - using local files instead):
   - Set `NODE_ENV=production` in Render's environment variables
   - Your local `.env.production` file will be used for other variables

4. **Deploy**:
   - Click "Create Web Service"
   - Wait for deployment to complete

## Post-Deployment

### 1. Update API URL

After your first deployment, update `.env.production`:

```env
VITE_API_URL=https://your-app.onrender.com
```

Replace `your-app.onrender.com` with your actual Render URL.

### 2. Redeploy

```bash
git add .env.production
git commit -m "Update production API URL"
git push origin master
```

### 3. Test Your Application

Visit your Render URL and test:
- Video playback
- Room creation and joining
- Socket.io real-time sync
- Google Maps integration

## Running Different Environments Locally

```bash
# Local development
npm run dev

# Test staging build
NODE_ENV=staging npm run build:staging
npm run start:staging

# Test production build
NODE_ENV=production npm run build:production
npm run start:production
```

## Troubleshooting

### Build Failures

If the build fails, check:
- All dependencies are in `dependencies` (not `devDependencies`)
- Build command is correct in render.yaml
- Environment variables are set correctly

### Connection Issues

If Socket.io doesn't connect:
- Verify `VITE_API_URL` matches your Render URL
- Check CORS configuration in [server/index.js:10](server/index.js#L10)
- Ensure WebSocket connections are allowed

### Static Files Not Serving

If the frontend doesn't load:
- Verify the build completed successfully
- Check that `dist` folder was created
- Confirm static file serving middleware in [server/index.js:19-27](server/index.js#L19-L27)

## Staging Environment (Optional)

To deploy a staging environment:

1. Create a new branch:
   ```bash
   git checkout -b staging
   ```

2. Update `.env.staging` with staging URLs

3. Deploy to a separate Render service pointing to the `staging` branch

4. Use build command: `npm run build:staging`

5. Use start command: `npm run start:staging`

## Environment File Security

Since you're tracking `.env.production` in git:

**Important Security Notes**:
- ✅ Keep API URLs and non-sensitive config in tracked env files
- ❌ **NEVER** commit sensitive secrets (database passwords, private API keys)
- For sensitive data, use Render's environment variables UI instead
- Consider using `.env.production.template` with placeholders for sensitive values

## Monitoring

Monitor your deployment:
- View logs in Render Dashboard → Your Service → Logs
- Set up alerts for downtime
- Monitor resource usage

## Custom Domain (Optional)

To add a custom domain:
1. Go to your service settings in Render
2. Click "Custom Domain"
3. Follow the instructions to configure DNS

---

Need help? Check the [Render Documentation](https://render.com/docs) or review [server configuration](server/index.js).
