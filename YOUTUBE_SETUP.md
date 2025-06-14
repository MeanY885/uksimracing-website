# YouTube Integration Setup

## Overview
The UKSimRacing website includes YouTube integration to automatically sync videos from the UKSimRacing YouTube channel.

## Current Status
✅ **Basic video system implemented** - Videos On Demand page with admin controls  
✅ **Sample data working** - 8 sample Multiclass League videos loaded  
✅ **YouTube API framework ready** - Full YouTube Data API v3 integration code  
⚠️ **API key needed** - Real YouTube data requires API configuration  

## How It Works

### Without YouTube API Key (Current)
- Uses sample data based on Multiclass League Season 3 videos
- Admin can manually add videos through the "Add Video" button
- "Sync YouTube" button loads sample data for testing

### With YouTube API Key (Future)
- Automatically fetches real videos from `https://www.youtube.com/@UKSimRacing/videos`
- Pulls video titles, descriptions, thumbnails, durations, and view counts
- Updates existing videos with latest data
- "Sync YouTube" button fetches live data from YouTube

## Setup Instructions

### 1. Get YouTube API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable "YouTube Data API v3"
4. Create credentials (API Key)
5. Restrict the key to YouTube Data API v3 for security

### 2. Find UKSimRacing Channel ID
1. Go to the UKSimRacing YouTube channel
2. View page source and search for "channel_id" or use YouTube tools
3. Update the `channelId` in `server.js` (currently placeholder)

### 3. Configure Environment Variables
Update the `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env

# Edit the .env file and add your API key
YOUTUBE_API_KEY=your_actual_api_key_here
YOUTUBE_CHANNEL_ID=your_channel_id_here
```

**Security Note:** The `.env` file is already included in `.gitignore` to prevent committing sensitive API keys to version control.

### 4. Test Integration
1. Restart the application
2. Go to `/videos` page as admin
3. Click "Sync YouTube" button
4. Should see real YouTube data instead of sample data

## API Endpoints

- `GET /api/videos` - Fetch all videos
- `POST /api/videos` - Add new video (admin)
- `PUT /api/videos/:id` - Update video (admin)  
- `DELETE /api/videos/:id` - Delete video (admin)
- `POST /api/sync-youtube` - Sync from YouTube (admin)

## Database Schema

```sql
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  youtube_id TEXT,
  thumbnail_url TEXT,
  duration INTEGER,
  view_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  sort_order INTEGER DEFAULT 0
);
```

## Features

### Admin Controls
- **Enable Edit Mode** - Show drag handles and edit controls
- **Add Video** - Manual video addition with YouTube URL detection
- **Sync YouTube** - Pull latest videos from YouTube channel
- **Full Admin Panel** - Access complete admin interface

### Video Display
- YouTube-style grid layout with hover effects
- Auto-generated thumbnails from YouTube
- Duration formatting (hours:minutes:seconds)
- View count display
- Responsive design for all devices

### Video Playback  
- Full-screen modal with embedded YouTube player
- Auto-play when clicked
- Proper video stopping when modal closes

## File Structure

- `/public/videos.html` - Videos page template
- `/public/videos.js` - Video functionality and admin controls
- `/public/styles.css` - Video styling (lines 1310-1652)
- `/server.js` - API endpoints and YouTube integration (lines 754-960)

## Next Steps

1. Obtain YouTube API key from Google Cloud Console
2. Find the actual UKSimRacing YouTube channel ID
3. Update environment variables with API key
4. Test real YouTube data integration
5. Set up automated sync (cron job or scheduled task)

The system is fully ready for YouTube integration - just needs the API key configuration!