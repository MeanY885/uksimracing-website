# UKSimRacing Website Deployment Guide

## Quick Setup

### 1. Clone the repository
```bash
git clone https://github.com/MeanY885/uksimracing-website.git
cd uksimracing-website
```

### 2. Create environment file
```bash
cp .env.example .env
nano .env
```

Fill in your actual values:
```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_actual_discord_bot_token_here
DISCORD_WEBHOOK_SECRET=your_webhook_secret_here
WEBHOOK_SECRET=your_webhook_secret_here

# YouTube API Configuration  
YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_CHANNEL_ID=your_youtube_channel_id_here

# Admin Authentication
ADMIN_PASSWORD=your_secure_admin_password_here
```

### 3. For development (HTTP only)
```bash
docker compose up -d
```
Access at: http://your-server-ip:2000

### 4. For production with SSL
```bash
./setup-ssl.sh
```
This will:
- Set up nginx on port 80
- Get SSL certificates from Let's Encrypt
- Configure HTTPS
- Access at: https://uksimracing.co.uk

## Manual SSL Setup

If the automatic script doesn't work:

1. **Start HTTP first:**
```bash
cp nginx-http.conf nginx.conf
docker compose -f docker-compose.prod.yml up -d
```

2. **Test HTTP works:**
```bash
curl http://localhost:80
```

3. **Get SSL certificates:**
```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path=/var/www/certbot --email your@email.com --agree-tos --no-eff-email -d uksimracing.co.uk -d www.uksimracing.co.uk
```

4. **Switch to SSL config:**
```bash
cp nginx.conf.ssl-backup nginx.conf  # or git checkout nginx.conf
docker compose -f docker-compose.prod.yml restart nginx
```

## Troubleshooting

### App not accessible externally
- Check firewall: `ufw allow 80 && ufw allow 443`
- Check DNS: `dig uksimracing.co.uk` should show your server IP
- Check containers: `docker ps`

### SSL certificate errors
- Make sure domain points to your server
- Check Let's Encrypt logs: `docker compose -f docker-compose.prod.yml logs certbot`
- Verify HTTP works first before trying SSL

### Admin panel access
- Default login: `admin` / password from .env file
- Access at: `/admin-panel`
- Create new users in User Management tab

## Features

- ✅ News management with drag & drop ordering
- ✅ Video sync from YouTube
- ✅ Discord bot integration for member counts
- ✅ SSL/HTTPS support
- ✅ Admin authentication system
- ✅ Automatic content ordering (newest first)