# WAF (FortiAPPSec) Configuration

This application supports running behind a WAF (Web Application Firewall) like FortiAPPSec that automatically handles SSL certificate generation.

## Configuration Options

### Standard Mode (Default)
- Application runs on port 2000
- Uses nginx proxy with Let's Encrypt certificates
- Use: `docker-compose -f docker-compose.prod.yml up -d`

### WAF Mode 
- Application runs directly on port 80 
- No nginx proxy or SSL handling (managed by WAF)
- Use: `docker-compose -f docker-compose.waf.yml up -d`

## Environment Variables

Set `WAF_MODE=true` to enable WAF compatibility:
```bash
export WAF_MODE=true
```

Or add to your `.env` file:
```
WAF_MODE=true
```

## WAF Mode Features

When `WAF_MODE=true`:
- Server binds to port 80 (HTTP)
- No SSL/TLS handling (delegated to WAF)
- Simplified container setup
- FortiAPPSec automatic certificate generation compatibility

## Troubleshooting

If certificate retrieval fails, ensure:
1. HTTP service is running on port 80
2. WAF_MODE environment variable is set to 'true'
3. No conflicting services on port 80
4. Firewall allows inbound traffic on port 80

## Switching Between Modes

### To WAF Mode:
```bash
export WAF_MODE=true
docker-compose -f docker-compose.waf.yml up -d
```

### To Standard Mode:
```bash
unset WAF_MODE
docker-compose -f docker-compose.prod.yml up -d
```