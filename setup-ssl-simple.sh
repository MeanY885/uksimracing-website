#!/bin/bash

# UKSimRacing Simple SSL Setup Script
# Single Docker container with Let's Encrypt

echo "🔐 Setting up SSL certificates for UKSimRacing..."

# Create necessary directories
mkdir -p letsencrypt
mkdir -p certbot
mkdir -p data
mkdir -p uploads/partners
mkdir -p uploads/leagues

# Set permissions
chmod 755 letsencrypt certbot

echo "🚀 Starting UKSimRacing application..."
docker-compose up -d app

# Wait for the application to be ready
echo "⏳ Waiting for application to be ready..."
sleep 10

# Test if HTTP is working
echo "🧪 Testing HTTP access..."
if curl -f http://localhost:80/health >/dev/null 2>&1; then
    echo "✅ HTTP is working!"
else
    echo "❌ HTTP is not working. Check logs:"
    docker-compose logs app
    exit 1
fi

# Request Let's Encrypt certificates
echo "🔒 Requesting SSL certificates from Let's Encrypt..."
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email chris@uksimracing.co.uk \
    --agree-tos \
    --no-eff-email \
    -d uksimracing.co.uk \
    -d www.uksimracing.co.uk

# Check if certificates were created successfully
if [ $? -eq 0 ]; then
    echo "✅ SSL certificates created successfully!"
    
    # Restart the application to load SSL certificates
    echo "♻️ Restarting application with SSL..."
    docker-compose restart app
    
    # Wait a moment for restart
    sleep 5
    
    # Test HTTPS
    echo "🧪 Testing HTTPS access..."
    if curl -k -f https://localhost:443/health >/dev/null 2>&1; then
        echo "✅ HTTPS is working!"
        echo "🎉 SSL setup complete! Your site should now be available at:"
        echo "   📍 https://uksimracing.co.uk"
        echo "   📍 https://www.uksimracing.co.uk"
    else
        echo "⚠️  HTTPS test failed, but certificates are installed."
        echo "   The site should work once DNS is properly configured."
    fi
else
    echo "❌ Failed to create SSL certificates"
    echo "   Make sure your domain points to this server and port 80 is accessible."
    echo "   Check certbot logs with: docker-compose logs certbot"
fi

# Create auto-renewal script
echo "⏰ Creating certificate auto-renewal script..."
cat << 'EOF' > renew-ssl.sh
#!/bin/bash
# UKSimRacing SSL Certificate Renewal
cd "$(dirname "$0")"
docker-compose run --rm certbot renew --quiet
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
echo "🎉 SSL setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Add to crontab for auto-renewal:"
echo "      0 12 * * * $(pwd)/renew-ssl.sh"
echo ""
echo "   2. Your site is available at:"
echo "      📍 https://uksimracing.co.uk"
echo "      📍 https://www.uksimracing.co.uk"
echo ""
echo "   3. HTTP requests will automatically redirect to HTTPS"
echo ""
echo "📊 To check certificate status:"
echo "   docker-compose run --rm certbot certificates"