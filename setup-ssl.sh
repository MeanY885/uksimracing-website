#!/bin/bash

# UKSimRacing SSL Setup Script

echo "🔐 Setting up SSL certificates for UKSimRacing..."

# Create necessary directories
mkdir -p web-root
mkdir -p ssl

# Start the containers
echo "🚀 Starting containers..."
docker-compose -f docker-compose.prod.yml up -d nginx

# Wait for nginx to be ready
echo "⏳ Waiting for nginx to be ready..."
sleep 10

# Request staging certificates first (for testing)
echo "🧪 Requesting staging certificates..."
docker-compose -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path=/var/www/html --email chris@uksimracing.co.uk --agree-tos --no-eff-email --staging -d uksimracing.co.uk -d www.uksimracing.co.uk

# Check if staging certificates were created successfully
if [ $? -eq 0 ]; then
    echo "✅ Staging certificates created successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Point your DNS records to this server"
    echo "2. Run: docker-compose -f docker-compose.prod.yml run --rm certbot certonly --webroot --webroot-path=/var/www/html --email chris@uksimracing.co.uk --agree-tos --no-eff-email --force-renewal -d uksimracing.co.uk -d www.uksimracing.co.uk"
    echo "3. Remove --staging flag from the above command to get real certificates"
    echo "4. Restart nginx: docker-compose -f docker-compose.prod.yml restart nginx"
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