# UKSimRacing Production Deployment Guide

## Pre-Deployment Checklist

### 1. Domain Setup
- [ ] Point DNS A record for `uksimracing.co.uk` to your server IP
- [ ] Point DNS A record for `www.uksimracing.co.uk` to your server IP
- [ ] Wait for DNS propagation (can take up to 24 hours)

### 2. Server Requirements
- [ ] Docker and Docker Compose installed
- [ ] Ports 80 and 443 available and open in firewall
- [ ] At least 2GB RAM recommended
- [ ] At least 10GB disk space

### 3. Environment Configuration
- [ ] Update `.env` file with production secrets
- [ ] Change `ADMIN_PASSWORD` from default
- [ ] Change `DISCORD_WEBHOOK_SECRET` from default
- [ ] Verify `YOUTUBE_API_KEY` is valid

## Deployment Steps

### 1. Deploy the Application
```bash
# Clone or upload the project to your server
cd /path/to/uksimracing-website

# Make the SSL setup script executable
chmod +x setup-ssl.sh

# Start the application with SSL setup
./setup-ssl.sh
```

### 2. SSL Certificate Setup

#### Stage 1: Staging Certificates (for testing)
The script will first request staging certificates to test the setup.

#### Stage 2: Production Certificates
Once staging works, run:
```bash
# Request real SSL certificates
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/html \
  --email chris@uksimracing.co.uk \
  --agree-tos --no-eff-email \
  --force-renewal \
  -d uksimracing.co.uk -d www.uksimracing.co.uk

# Restart nginx to use new certificates
docker-compose -f docker-compose.prod.yml restart nginx
```

### 3. Auto-Renewal Setup
Add to crontab for automatic certificate renewal:
```bash
# Edit crontab
crontab -e

# Add this line (update path to your project):
0 12 * * * cd /path/to/uksimracing-website && docker-compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker-compose -f docker-compose.prod.yml restart nginx
```

### 4. Verify Deployment
- [ ] Visit https://uksimracing.co.uk - should load with SSL
- [ ] Check admin panel at https://uksimracing.co.uk/admin-panel
- [ ] Test live stream detection (if streaming)
- [ ] Verify Discord integration works
- [ ] Check YouTube video sync

## Security Features

### 1. SSL/TLS
- ✅ Let's Encrypt SSL certificates
- ✅ Automatic HTTP to HTTPS redirect
- ✅ HSTS headers for security
- ✅ TLS 1.2/1.3 only

### 2. Rate Limiting
- ✅ API endpoints: 10 requests/second
- ✅ General pages: 30 requests/second
- ✅ Burst protection enabled

### 3. Security Headers
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection: enabled
- ✅ Referrer-Policy: strict-origin-when-cross-origin

### 4. Access Control
- ✅ Admin panel behind secret URL `/admin-panel`
- ✅ Role-based permissions (master/admin/moderator)
- ✅ Strong password requirements
- ✅ Secure session tokens

## Monitoring Commands

### Check Application Status
```bash
# View all container status
docker-compose -f docker-compose.prod.yml ps

# View application logs
docker-compose -f docker-compose.prod.yml logs app

# View nginx logs
docker-compose -f docker-compose.prod.yml logs nginx

# Check SSL certificate status
docker-compose -f docker-compose.prod.yml run --rm certbot certificates
```

### YouTube Integration
The application automatically:
- ✅ Syncs YouTube videos every hour
- ✅ Checks for live streams every 15 minutes
- ✅ Displays live streams prominently when active
- ✅ Falls back gracefully when YouTube API is unavailable

### Discord Integration
- ✅ Receives webhook notifications for new posts
- ✅ Updates member count automatically
- ✅ Processes Discord nicknames and timestamps

## Backup Recommendations

### Database Backup
```bash
# Create backup directory
mkdir -p backups

# Backup SQLite database
cp data/news.db backups/news-$(date +%Y%m%d-%H%M%S).db
```

### Full Application Backup
```bash
# Backup entire application
tar -czf uksimracing-backup-$(date +%Y%m%d).tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  .
```

## Troubleshooting

### SSL Issues
```bash
# Check nginx configuration
docker-compose -f docker-compose.prod.yml exec nginx nginx -t

# View SSL certificate details
openssl x509 -in /path/to/fullchain.pem -text -noout
```

### Application Issues
```bash
# Restart application only
docker-compose -f docker-compose.prod.yml restart app

# View detailed logs
docker-compose -f docker-compose.prod.yml logs -f app
```

### YouTube API Issues
- Check API quota in Google Cloud Console
- Verify API key permissions
- Check application logs for specific error messages

## Performance Tuning

### For High Traffic
Consider these optimizations:
- Enable Cloudflare or similar CDN
- Increase nginx worker processes
- Add Redis for session storage
- Implement database connection pooling

### Resource Monitoring
```bash
# Monitor resource usage
docker stats

# Check disk usage
df -h

# Monitor logs
tail -f /var/log/nginx/access.log
```

---

**Important**: Always test changes in a staging environment before deploying to production!

For support, contact Chris Eddisford or check the GitHub repository for updates.