# UKSimRacing - Simple Single Docker Deployment with SSL

This deployment method uses a single Docker container with built-in HTTPS and Let's Encrypt SSL certificate management.

## Quick Start

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd uksimracing-website
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (Discord tokens, etc.)
   ```

3. **Run SSL Setup Script**
   ```bash
   ./setup-ssl-simple.sh
   ```

That's it! Your site will be available at https://uksimracing.co.uk

## What the Setup Does

1. **Creates necessary directories** for data persistence
2. **Starts the application** in HTTP mode first
3. **Requests SSL certificates** from Let's Encrypt using certbot
4. **Restarts with HTTPS** once certificates are obtained
5. **Sets up auto-renewal** for certificates

## Manual Commands

If you prefer manual control:

### Start without SSL
```bash
docker-compose up -d app
```

### Get SSL certificates
```bash
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@domain.com \
    --agree-tos \
    --no-eff-email \
    -d uksimracing.co.uk \
    -d www.uksimracing.co.uk
```

### Restart with SSL
```bash
docker-compose restart app
```

## Certificate Management

### Check certificate status
```bash
docker-compose run --rm certbot certificates
```

### Renew certificates
```bash
./renew-ssl.sh
```

### Auto-renewal (add to crontab)
```bash
crontab -e
# Add this line:
0 12 * * * /path/to/uksimracing-website/renew-ssl.sh
```

## Architecture

- **Single Container**: Node.js app handles both HTTP and HTTPS
- **Built-in SSL**: Direct certificate management without nginx
- **Let's Encrypt**: Automatic SSL certificate provisioning
- **Persistent Data**: Database and uploads survive container restarts
- **Auto-redirect**: HTTP requests redirect to HTTPS automatically

## Ports

- **Port 80**: HTTP (redirects to HTTPS in production)
- **Port 443**: HTTPS (main site)

## Volumes

- `./data` → `/app/data` (Database)
- `./uploads` → `/app/public/uploads` (User uploads)
- `./letsencrypt` → `/etc/letsencrypt` (SSL certificates)
- `./certbot` → `/var/www/certbot` (Let's Encrypt challenges)

## Troubleshooting

### Site not loading
```bash
docker-compose logs app
```

### SSL issues
```bash
docker-compose logs certbot
```

### Check if certificates exist
```bash
ls -la letsencrypt/live/uksimracing.co.uk/
```

### Force certificate renewal
```bash
docker-compose run --rm certbot renew --force-renewal
docker-compose restart app
```