#!/bin/bash

# UKSimRacing SSL Setup Script

echo "🔐 Setting up SSL certificates for UKSimRacing..."

# Create necessary directories
mkdir -p web-root
mkdir -p ssl

# First, use HTTP-only nginx config
echo "🌐 Setting up HTTP-only nginx first..."
cp nginx.conf nginx.conf.ssl-backup
cp nginx-http.conf nginx.conf

# Start the containers
echo "🚀 Starting containers..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for nginx to be ready
echo "⏳ Waiting for nginx to be ready..."
sleep 15

# Test if HTTP is working
echo "🧪 Testing HTTP access..."
if curl -f http://localhost:80 >/dev/null 2>&1; then
    echo "✅ HTTP is working!"
else
    echo "❌ HTTP is not working. Check logs:"
    docker-compose -f docker-compose.prod.yml logs nginx
    exit 1
fi

# Request staging certificates first (for testing)
echo "🧪 Requesting staging certificates..."
docker-compose -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path=/var/www/html --email chris@uksimracing.co.uk --agree-tos --no-eff-email --staging -d uksimracing.co.uk -d www.uksimracing.co.uk

# Check if staging certificates were created successfully
if [ $? -eq 0 ]; then
    echo "✅ Staging certificates created successfully!"
    
    # Get real certificates
    echo "🔒 Now requesting real certificates..."
    docker-compose -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path=/var/www/certbot --email chris@uksimracing.co.uk --agree-tos --no-eff-email --force-renewal -d uksimracing.co.uk -d www.uksimracing.co.uk
    
    if [ $? -eq 0 ]; then
        echo "✅ Real certificates created successfully!"
        
        # Switch back to SSL config
        echo "🔄 Switching to SSL configuration..."
        cp nginx.conf.ssl-backup nginx.conf
        
        # Restart nginx with SSL
        echo "♻️ Restarting nginx with SSL..."
        docker-compose -f docker-compose.prod.yml restart nginx
        
        echo "🎉 SSL setup complete! Your site should now be available at https://uksimracing.co.uk"
    else
        echo "❌ Failed to create real certificates"
    fi
else
    echo "❌ Failed to create staging certificates"
    echo "Check the logs with: docker-compose -f docker-compose.prod.yml logs certbot"
fi

# Set up auto-renewal cron job
echo "⏰ Setting up certificate auto-renewal..."
cat << 'EOF' > renew-ssl.sh
#!/bin/bash
docker-compose -f /path/to/your/project/docker-compose.prod.yml run --rm certbot renew --quiet && docker-compose -f /path/to/your/project/docker-compose.prod.yml restart nginx
EOF

chmod +x renew-ssl.sh

echo ""
echo "🎉 SSL setup complete!"
echo "📝 Remember to:"
echo "   - Update the path in renew-ssl.sh"
echo "   - Add to crontab: 0 12 * * * /path/to/renew-ssl.sh"