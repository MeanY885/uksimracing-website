# UKSimRacing Discord Bot

This Discord bot monitors your server for messages tagged with @UKSimRacingWebsite and automatically posts them to your website.

## Setup Instructions

### Step 1: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it "UKSimRacingWebsite"
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this later)
5. Under "Privileged Gateway Intents", enable:
   - ✅ Message Content Intent
   - ✅ Server Members Intent (optional)

### Step 2: Add Bot to Your Server

1. In Discord Developer Portal, go to "OAuth2" > "URL Generator"
2. Select scopes: `bot`
3. Select bot permissions:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Add Reactions
   - ✅ Read Message History
4. Copy the generated URL and open it to add the bot to your server

### Step 3: Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values:
   ```bash
   DISCORD_BOT_TOKEN=your_actual_bot_token_here
   WEBSITE_URL=http://localhost:2000
   WEBHOOK_SECRET=match_this_with_docker_compose_yml
   TRIGGER_MENTION=UKSimRacingWebsite
   ```

### Step 4: Run the Bot

**Option A: Local Development**
```bash
npm install
npm start
```

**Option B: Docker (Recommended)**
```bash
docker build -t uksimracing-discord-bot .
docker run -d --env-file .env uksimracing-discord-bot
```

## How It Works

The bot monitors for messages containing:
- `@UKSimRacingWebsite` (mention)
- `#news` (hashtag)
- `#website` (hashtag)

When triggered, it:
1. ✅ Cleans the message content
2. 📤 Sends it to your website via webhook
3. ✅ Reacts to the original message with ✅ (success) or ❌ (error)

## Message Format

The bot will extract:
- **Title**: First line of the message
- **Content**: Remaining message content
- **Author**: Discord username
- **Images**: Any attached images
- **Metadata**: Message ID, channel, timestamp

## Example Usage

In Discord, post:
```
@UKSimRacingWebsite Championship Results - Round 5

Amazing racing tonight! Close battles throughout the field with some fantastic overtakes. 

Final Results:
1. Driver1 - 25 points
2. Driver2 - 18 points  
3. Driver3 - 15 points

Next race: Silverstone GP - Sunday 8PM
```

This becomes a news post on your website automatically!

## Troubleshooting

**Bot not responding?**
- Check the bot token is correct
- Ensure bot has permissions in the channel
- Verify Message Content Intent is enabled

**Website not receiving posts?**
- Check WEBSITE_URL is correct
- Ensure WEBHOOK_SECRET matches between bot and website
- Verify website is running on port 2000

**Check logs:**
```bash
docker logs <container_name>
```

## Security Notes

- Keep your bot token secure and never share it
- Use a strong webhook secret
- The bot only reads messages and posts to your website
- No sensitive data is stored by the bot