#!/bin/bash

# UKSimRacing Automatic SSL Setup Script
# Single Docker container with automatic Let's Encrypt

echo "🔐 Setting up UKSimRacing with automatic SSL..."

# Create necessary directories
mkdir -p letsencrypt
mkdir -p certbot
mkdir -p data
mkdir -p uploads/partners
mkdir -p uploads/leagues

# Set permissions
chmod 755 letsencrypt certbot

echo "🚀 Starting UKSimRacing application..."
echo "   The app will automatically request SSL certificates on first run!"

# Start the application - it will handle SSL automatically
docker-compose up -d app

# Wait for the application to be ready
echo "⏳ Waiting for application to start and request certificates..."
sleep 15

# Check logs to see what happened
echo "📋 Application startup logs:"
docker-compose logs --tail=20 app

# Test if HTTPS is working
echo ""
echo "🧪 Testing HTTPS access..."
if curl -k -f https://localhost:443/health >/dev/null 2>&1; then
    echo "✅ HTTPS is working!"
    echo "🎉 Setup complete! Your site is available at:"
    echo "   📍 https://uksimracing.co.uk"
    echo "   📍 https://www.uksimracing.co.uk"
elif curl -f http://localhost:80/health >/dev/null 2>&1; then
    echo "⚠️  HTTP is working, but HTTPS is not yet available."
    echo "   This is normal if:"
    echo "   - Domain doesn't point to this server yet"
    echo "   - Port 80 is not accessible from internet"
    echo "   - Let's Encrypt rate limits are hit"
    echo ""
    echo "   The app will automatically get SSL certificates when conditions are met."
else
    echo "❌ Application is not responding. Check logs:"
    docker-compose logs app
fi

# Create auto-renewal script
echo ""
echo "⏰ Creating certificate auto-renewal script..."
cat << 'EOF' > renew-ssl.sh
#!/bin/bash
# UKSimRacing SSL Certificate Renewal
cd "$(dirname "$0")"
docker-compose exec app certbot renew --quiet --webroot --webroot-path=/var/www/certbot
if [ $? -eq 0 ]; then
    echo "✅ Certificates renewed successfully"
    docker-compose restart app
    echo "♻️ Application restarted with new certificates"
else
    echo "❌ Certificate renewal failed"
fi
EOF

chmod +x renew-ssl.sh

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 How it works:"
echo "   - App automatically requests SSL certificates on startup"
echo "   - HTTP requests redirect to HTTPS when certificates are available"
echo "   - Port 443 is the main external port for HTTPS"
echo "   - Port 80 is used for Let's Encrypt challenges only"
echo ""
echo "📋 Commands:"
echo "   Check status:        docker-compose logs app"
echo "   Restart:            docker-compose restart app"
echo "   Check certificates:  docker-compose exec app certbot certificates"
echo ""
echo "⏰ Auto-renewal:"
echo "   Add to crontab: 0 12 * * * $(pwd)/renew-ssl.sh"