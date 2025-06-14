# UKSimRacing Website

A modern, responsive website for the UKSimRacing community with Discord integration for automated news posting.

## Features

- **Responsive Design**: Mobile-first design that works on all devices
- **Discord Integration**: Automatically posts news from Discord messages tagged with @UKSimRacingWebsite
- **SQLite Database**: Lightweight database for storing news posts
- **Docker Support**: Fully containerized for easy deployment
- **Modern UI**: Clean, professional design matching UKSimRacing branding

## Quick Start

1. Clone the repository
2. Update the `DISCORD_WEBHOOK_SECRET` in `docker-compose.yml`
3. Run the application:

```bash
docker-compose up -d
```

The website will be available at `http://localhost:2000`

## Discord Integration Setup

### Step 1: Configure Discord Webhook

1. In your Discord server, go to Server Settings > Integrations > Webhooks
2. Create a new webhook or use an existing one
3. Copy the webhook URL
4. Set up a bot or integration that sends POST requests to your website when messages are tagged with @UKSimRacingWebsite

### Step 2: Webhook Payload Format

Your Discord integration should send POST requests to `/webhook/discord` with this format:

```json
{
  "content": "Race Results: Championship Round 5\\n\\nAmazing racing tonight with close battles throughout the field...",
  "author": "RaceDirector",
  "message_id": "1234567890123456789",
  "attachments": [
    {
      "url": "https://cdn.discordapp.com/attachments/..."
    }
  ]
}
```

### Step 3: Security

Set the `DISCORD_WEBHOOK_SECRET` environment variable in your `docker-compose.yml`:

```yaml
environment:
  - DISCORD_WEBHOOK_SECRET=your-secure-secret-here
```

Include this secret in the `X-Webhook-Secret` header when sending requests.

## DNS Configuration

Once your Docker container is running and tested:

1. Point your domain `uksimracing.co.uk` to your server's IP address
2. If using a reverse proxy (recommended), configure it to forward traffic to port 2000
3. Consider setting up SSL/TLS certificates (Let's Encrypt recommended)

### Example Nginx Configuration

```nginx
server {
    listen 80;
    server_name uksimracing.co.uk www.uksimracing.co.uk;
    
    location / {
        proxy_pass http://localhost:2000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## API Endpoints

- `GET /` - Main website
- `GET /api/news` - Get news posts (supports `limit` and `offset` query parameters)
- `POST /webhook/discord` - Discord webhook endpoint (requires authentication)
- `GET /health` - Health check endpoint

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Project Structure

```
uksimracing-website/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # CSS styles
│   └── script.js       # JavaScript functionality
├── data/
│   └── news.db         # SQLite database (created automatically)
├── server.js           # Express server
├── package.json        # Node.js dependencies
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose configuration
└── README.md          # This file
```

## Environment Variables

- `PORT` - Server port (default: 2000)
- `NODE_ENV` - Environment (production/development)
- `DISCORD_WEBHOOK_SECRET` - Secret for Discord webhook authentication

## Database Schema

The SQLite database contains a single `news` table:

```sql
CREATE TABLE news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    discord_message_id TEXT UNIQUE,
    image_url TEXT
);
```

## Customization

### Branding Colors

The website uses CSS custom properties for easy color customization. Update these in `public/styles.css`:

```css
:root {
    --primary-bg: #1a1a1a;
    --secondary-bg: #2a2a2a;
    --accent-color: #00b4d8;
    --accent-light: #0077b6;
    --text-primary: #ffffff;
    --text-secondary: #b0b0b0;
}
```

### Content Updates

- Update hero section content in `public/index.html`
- Modify about section text
- Add social media links in the footer

## Support

For issues or questions, check the server logs:

```bash
docker-compose logs -f web
```

## License

MIT License - see LICENSE file for details