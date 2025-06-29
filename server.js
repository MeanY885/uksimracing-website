// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs-extra');
const crypto = require('crypto');

// Twitch token storage file path
const TWITCH_TOKENS_FILE = path.join(__dirname, 'data', 'twitch-tokens.json');
const multer = require('multer');
const https = require('https');
const http = require('http');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const DOMAIN = process.env.DOMAIN || 'uksimracing.co.uk';

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'uksimracing-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine folder based on URL
    let folder = 'partners'; // default
    if (req.url.includes('/leagues')) {
      folder = 'leagues';
    } else if (req.url.includes('/news')) {
      folder = 'news';
    }
    
    const uploadDir = path.join(__dirname, 'public', 'uploads', folder);
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    let prefix = 'partner';
    if (req.url.includes('/leagues')) {
      prefix = 'league';
    } else if (req.url.includes('/news')) {
      prefix = 'news';
    }
    cb(null, prefix + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// Database setup
const db = new sqlite3.Database('./data/news.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    discord_message_id TEXT UNIQUE,
    image_url TEXT,
    local_image_path TEXT,
    sort_order INTEGER DEFAULT 0
  )`);
  
  // Create admin users table
  db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    last_login DATETIME
  )`);
  
  // Create videos table
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    youtube_id TEXT,
    thumbnail_url TEXT,
    duration INTEGER,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    created_by TEXT,
    sort_order INTEGER DEFAULT 0
  )`);
  
  // Create partners table
  db.run(`CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    logo_path TEXT,
    partner_type TEXT DEFAULT 'partner',
    benefits TEXT,
    instructions TEXT,
    is_featured BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  )`);
  
  // Add logo_path column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE partners ADD COLUMN logo_path TEXT`, (err) => {
    // This will error if column already exists, which is fine
  });
  
  // Create leagues table
  db.run(`CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image_path TEXT,
    information TEXT NOT NULL,
    handbook_url TEXT,
    standings_url TEXT,
    registration_status TEXT DEFAULT 'active',
    registration_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_archived BOOLEAN DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  )`);
  
  // Create Discord roles table
  db.run(`CREATE TABLE IF NOT EXISTS discord_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id TEXT UNIQUE NOT NULL,
    role_name TEXT NOT NULL,
    permissions TEXT NOT NULL, -- JSON string: ["admin_panel", "bot_mentions"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  )`);
  
  // Create Discord users table
  db.run(`CREATE TABLE IF NOT EXISTS discord_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    discriminator TEXT,
    avatar TEXT,
    access_token TEXT,
    refresh_token TEXT,
    roles TEXT, -- JSON string of role IDs
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Create Discord auth roles table (for OAuth2 authentication)
  db.run(`CREATE TABLE IF NOT EXISTS discord_auth_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id TEXT UNIQUE NOT NULL,
    role_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  )`);
  
  // Create Discord bot mentions table (for @UKSimRacingWebsite permissions)
  db.run(`CREATE TABLE IF NOT EXISTS discord_bot_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id TEXT UNIQUE NOT NULL,
    role_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
  )`);
  
  // Add sort_order column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE news ADD COLUMN sort_order INTEGER DEFAULT 0`, (err) => {
    // This will error if column already exists, which is fine
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: sort_order column may already exist');
    }
  });
  
  // Add published_at column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE videos ADD COLUMN published_at DATETIME`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: published_at column may already exist');
    }
  });
  
  // Create master admin if it doesn't exist
  const masterPassword = process.env.ADMIN_PASSWORD || 'admin123';
  db.get('SELECT * FROM admin_users WHERE username = ?', ['Chris Eddisford'], (err, row) => {
    if (!row) {
      db.run(
        'INSERT INTO admin_users (username, password, role, created_by) VALUES (?, ?, ?, ?)',
        ['Chris Eddisford', masterPassword, 'master', 'system'],
        (err) => {
          if (err) {
            console.error('Error creating master admin:', err.message);
          } else {
            console.log('✅ Master admin created with username: Chris Eddisford');
          }
        }
      );
    }
  });
  
  // Create default partners if they don't exist
  db.get('SELECT COUNT(*) as count FROM partners', (err, row) => {
    if (!err && row.count === 0) {
      // Add RaceAnywhere as featured partner
      db.run(`INSERT INTO partners (name, description, url, partner_type, benefits, instructions, is_featured, sort_order, created_by) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        'RaceAnywhere',
        'RaceAnywhere offers professional sim racing experiences and training programs. They provide expert coaching and high-quality racing setups that have been thoroughly tested by our community.',
        'https://www.raceanywhere.co.uk/iRUK',
        'Featured Partner',
        'Professional sim racing coaching\niRacing setup development\nPerformance analysis and improvement\nCustom training programs',
        'Click through our link below to visit RaceAnywhere and make any purchase.',
        1,
        1,
        'system'
      ]);
      
      // Add RWS iRacing Photography
      db.run(`INSERT INTO partners (name, description, url, partner_type, benefits, instructions, is_featured, sort_order, created_by) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        'RWS iRacing Photography',
        'RWS iRacing Photography specializes in stunning virtual motorsport photography, capturing the best moments from iRacing events with professional quality and artistic flair.',
        'https://ko-fi.com/rwsiracingphotography/gallery#galleryItemView',
        'Creative Partner',
        'Professional iRacing photography\nEvent coverage and documentation\nCustom racing artwork\nHigh-quality racing prints',
        'Visit their gallery and consider supporting their work through Ko-fi.',
        0,
        2,
        'system'
      ]);
      
      console.log('✅ Default partners created');
    }
  });
  
  // Also update old master user if it exists
  db.run('UPDATE admin_users SET username = ? WHERE username = ?', ['Chris Eddisford', 'master'], (err) => {
    if (!err) {
      console.log('✅ Updated master username to Chris Eddisford');
    }
  });
  
  // Remove any existing placeholder/sample videos
  db.run('DELETE FROM videos WHERE created_by != ?', ['youtube-sync'], (err) => {
    if (err) {
      console.error('Error cleaning placeholder videos:', err.message);
    } else {
      console.log('🧹 Cleaned any placeholder videos from database');
    }
  });
  
  // Create images directory if it doesn't exist
  const imagesDir = path.join(__dirname, 'public', 'images');
  fs.ensureDirSync(imagesDir);
  console.log('📁 Images directory ready:', imagesDir);
  
  // Add local_image_path column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE news ADD COLUMN local_image_path TEXT`, (err) => {
    // This will error if column already exists, which is fine
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: local_image_path column may already exist');
    }
  });
  
  // Start automatic YouTube sync on app startup
  console.log('🎬 Setting up automatic YouTube sync...');
  setupAutoYouTubeSync();
}

// Global variable to track which streams have already received messages
global.messagedStreams = new Set();

// Discord OAuth2 Configuration
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.NODE_ENV === 'production' 
    ? `https://${DOMAIN}/auth/discord/callback`
    : `http://localhost:${HTTP_PORT}/auth/discord/callback`,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Discord OAuth2 strategy called for user:', profile.username);
    
    // Get user's roles in the UKSimRacing server using bot token
    const guildId = process.env.DISCORD_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    let userRoles = [];
    
    if (guildId && botToken) {
      try {
        console.log('Fetching user roles from Discord API...');
        const response = await axios.get(`https://discord.com/api/guilds/${guildId}/members/${profile.id}`, {
          headers: { Authorization: `Bot ${botToken}` }
        });
        userRoles = response.data.roles || [];
        console.log(`Successfully fetched ${userRoles.length} roles for user ${profile.username}:`, userRoles);
      } catch (error) {
        console.error('Could not fetch user roles:', error.response?.status, error.response?.data || error.message);
        
        // Try alternative method: check if user is in guild using user token
        try {
          console.log('Trying alternative method with user guilds...');
          const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          
          const isInGuild = guildsResponse.data.some(guild => guild.id === guildId);
          console.log('User is in target guild:', isInGuild);
          
          if (!isInGuild) {
            console.log('User is not in the target Discord server');
          }
        } catch (guildError) {
          console.error('Could not check user guilds:', guildError.response?.status, guildError.response?.data || guildError.message);
        }
      }
    } else {
      console.log('Missing Discord Guild ID or Bot Token configuration');
    }
    
    // Save or update user in database
    const userData = {
      discord_id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar,
      access_token: accessToken,
      refresh_token: refreshToken,
      roles: JSON.stringify(userRoles)
    };
    
    db.get('SELECT * FROM discord_users WHERE discord_id = ?', [profile.id], (err, existingUser) => {
      if (existingUser) {
        // Update existing user
        db.run(`UPDATE discord_users SET username = ?, discriminator = ?, avatar = ?, 
                access_token = ?, refresh_token = ?, roles = ?, last_login = CURRENT_TIMESTAMP 
                WHERE discord_id = ?`, 
                [userData.username, userData.discriminator, userData.avatar, 
                 userData.access_token, userData.refresh_token, userData.roles, userData.discord_id]);
      } else {
        // Create new user
        db.run(`INSERT INTO discord_users (discord_id, username, discriminator, avatar, 
                access_token, refresh_token, roles) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userData.discord_id, userData.username, userData.discriminator, 
                 userData.avatar, userData.access_token, userData.refresh_token, userData.roles]);
      }
    });
    
    return done(null, { ...profile, roles: userRoles, accessToken });
  } catch (error) {
    console.error('Discord OAuth2 strategy error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    db.get('SELECT * FROM discord_users WHERE discord_id = ?', [id], (err, user) => {
      if (err) return done(err, null);
      if (user) {
        user.roles = JSON.parse(user.roles || '[]');
      }
      done(null, user);
    });
  } catch (error) {
    done(error, null);
  }
});

// Discord bot setup for mention checking
const discordBot = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ] 
});

discordBot.on('ready', () => {
  console.log('🤖 Discord bot ready for role checking');
});

// Helper function to check if user has required permissions
async function hasPermission(userId, permission, userRoles = null) {
  return new Promise((resolve) => {
    // If roles are provided directly, use them
    if (userRoles) {
      checkRolePermissions(userRoles, permission, resolve);
      return;
    }
    
    // Otherwise, get roles from database
    db.get('SELECT roles FROM discord_users WHERE discord_id = ?', [userId], (err, user) => {
      if (err || !user) {
        console.log(`User ${userId} not found in database for permission check`);
        return resolve(false);
      }
      
      const storedUserRoles = JSON.parse(user.roles || '[]');
      checkRolePermissions(storedUserRoles, permission, resolve);
    });
  });
}

// Helper function to check role permissions against database
function checkRolePermissions(userRoles, permission, resolve) {
  if (!userRoles || userRoles.length === 0) {
    console.log('User has no roles');
    return resolve(false);
  }
  
  // Check specific permission types
  let tableName;
  if (permission === 'admin_panel') {
    tableName = 'discord_auth_roles';
  } else if (permission === 'bot_mentions') {
    tableName = 'discord_bot_mentions';
  } else {
    console.log(`Unknown permission type: ${permission}`);
    return resolve(false);
  }
  
  console.log(`Checking ${permission} permission for roles:`, userRoles);
  
  // Check if any of the user's roles have the required permission
  db.all(`SELECT role_id FROM ${tableName} WHERE role_id IN (` + 
         userRoles.map(() => '?').join(',') + ')', userRoles, (err, authorizedRoles) => {
    if (err) {
      console.error('Database error checking permissions:', err);
      return resolve(false);
    }
    
    console.log(`Found ${authorizedRoles.length} authorized roles for ${permission}:`, authorizedRoles);
    resolve(authorizedRoles.length > 0);
  });
}

// Discord bot mention handler
discordBot.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Check if the bot was mentioned
  if (message.mentions.users.has(discordBot.user.id)) {
    const userHasPermission = await hasPermission(message.author.id, 'bot_mentions');
    
    if (!userHasPermission) {
      // React with X emoji if user doesn't have permission
      try {
        await message.react('❌');
      } catch (error) {
        console.log('Could not react to message:', error.message);
      }
      return;
    }
    
    // User has permission, process the mention normally
    // (existing bot functionality would go here)
  }
});

// Start Discord bot
if (process.env.DISCORD_BOT_TOKEN) {
  discordBot.login(process.env.DISCORD_BOT_TOKEN);
}

// Image download function
async function downloadAndSaveImage(imageUrl, messageId) {
  try {
    if (!imageUrl) return null;
    
    console.log('📥 Downloading image from:', imageUrl);
    
    // Generate a unique filename
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(messageId + timestamp).digest('hex');
    const extension = path.extname(new URL(imageUrl).pathname) || '.png';
    const filename = `news_${hash}${extension}`;
    const filepath = path.join(__dirname, 'public', 'images', filename);
    
    // Download the image
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'UKSimRacing-Bot/1.0'
      }
    });
    
    // Save the image
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const localPath = `/images/${filename}`;
        console.log('✅ Image saved successfully:', localPath);
        resolve(localPath);
      });
      writer.on('error', reject);
    });
    
  } catch (error) {
    console.error('❌ Error downloading image:', error.message);
    return null;
  }
}

// Automatic YouTube synchronization function
async function syncYouTubeVideos() {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCPM4Lq8AQpX-74XZJmeuv6Q';
  
  if (!youtubeApiKey) {
    console.log('⚠️ YouTube API key not configured - skipping auto sync');
    return;
  }
  
  try {
    console.log('🎥 Auto-syncing videos from YouTube...');
    const videos = await fetchYouTubeVideos(channelId, youtubeApiKey);
    console.log(`📹 Found ${videos.length} videos from YouTube`);
    
    if (videos.length === 0) {
      console.log('📺 No videos found on YouTube channel');
      return;
    }
    
    // Clear existing auto-synced videos
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM videos WHERE created_by = ?', ['youtube-sync'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    let addedCount = 0;
    
    // Add videos to database
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      let thumbnailUrl = video.thumbnail_url;
      
      // Generate YouTube thumbnail URL if not provided
      if (!thumbnailUrl && video.youtube_id) {
        thumbnailUrl = `https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`;
      }
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO videos (title, description, youtube_id, thumbnail_url, duration, created_by, sort_order, view_count, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [video.title, video.description, video.youtube_id, thumbnailUrl, video.duration, 'youtube-sync', videos.length - i, video.view_count || 0, video.published_at],
          function(err) {
            if (err) {
              console.error('Error creating video:', err.message);
              reject(err);
            } else {
              addedCount++;
              resolve();
            }
          }
        );
      });
    }
    
    console.log(`✅ Auto-sync completed: ${addedCount} videos updated from YouTube`);
    
  } catch (error) {
    console.error('❌ Auto YouTube sync failed:', error.message);
  }
}

// Setup automatic YouTube sync every hour
function setupAutoYouTubeSync() {
  // Run initial sync after 30 seconds to allow database to initialize
  setTimeout(() => {
    console.log('🚀 Running initial YouTube sync...');
    syncYouTubeVideos();
    checkLiveStreams();
    checkTwitchStreams();
  }, 30000);
  
  // Schedule automatic sync every hour (0 minutes of every hour)
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Hourly YouTube sync triggered');
    syncYouTubeVideos();
  }, {
    timezone: "Europe/London" // UK timezone for UKSimRacing
  });
  
  // Check for live streams every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    console.log('📺 Live stream check triggered');
    checkLiveStreams();
    checkTwitchStreams();
  }, {
    timezone: "Europe/London" // UK timezone for UKSimRacing
  });
  
  console.log('⏰ Automatic YouTube sync scheduled - runs every hour');
  console.log('📺 Live stream check scheduled - runs every 10 minutes');
}

// Check for live streams function
async function checkLiveStreams() {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCPM4Lq8AQpX-74XZJmeuv6Q';
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  
  let liveStreamFound = false;
  
  // Check YouTube live streams
  if (youtubeApiKey) {
    try {
      console.log('📺 Checking for YouTube live streams...');
      
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${youtubeApiKey}`
      );
      const searchData = await searchResponse.json();
      
      if (searchData.items && searchData.items.length > 0) {
        const liveStream = searchData.items[0];
        
        // Get actual start time from video details
        let actualStartTime = liveStream.snippet.publishedAt; // fallback
        try {
          const videoDetailsResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${liveStream.id.videoId}&key=${youtubeApiKey}`
          );
          const videoDetails = await videoDetailsResponse.json();
          
          if (videoDetails.items && videoDetails.items.length > 0) {
            const streamingDetails = videoDetails.items[0].liveStreamingDetails;
            if (streamingDetails && streamingDetails.actualStartTime) {
              actualStartTime = streamingDetails.actualStartTime;
              console.log(`📺 Using actual start time: ${actualStartTime} instead of published time: ${liveStream.snippet.publishedAt}`);
            }
          }
        } catch (detailsError) {
          console.log('⚠️ Could not fetch video details for actual start time, using published time');
        }
        
        const liveStreamData = {
          id: liveStream.id.videoId,
          title: liveStream.snippet.title,
          description: liveStream.snippet.description,
          thumbnail: liveStream.snippet.thumbnails.maxres?.url || liveStream.snippet.thumbnails.high?.url || liveStream.snippet.thumbnails.medium?.url,
          startTime: actualStartTime,
          isLive: true,
          platform: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${liveStream.id.videoId}`,
          watchUrl: `https://www.youtube.com/watch?v=${liveStream.id.videoId}`
        };
        
        global.liveStreamData = liveStreamData;
        console.log(`🔴 YouTube live stream detected: ${liveStreamData.title}`);
        liveStreamFound = true;
      }
    } catch (error) {
      console.error('❌ YouTube live stream check failed:', error.message);
    }
  } else {
    console.log('⚠️ YouTube API key not configured - skipping YouTube live stream check');
  }
  
  // Check Twitch live streams for UKSimRacing channel
  if (!liveStreamFound && twitchClientId && twitchClientSecret) {
    try {
      console.log('🟣 Checking for UKSimRacing Twitch live stream...');
      
      // Get Twitch OAuth token
      const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        grant_type: 'client_credentials'
      });
      
      if (tokenResponse.data.access_token) {
        const accessToken = tokenResponse.data.access_token;
        
        // Get user ID for uksimracing
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
          headers: {
            'Client-ID': twitchClientId,
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            login: 'uksimracing'
          }
        });
        
        if (userResponse.data.data && userResponse.data.data.length > 0) {
          const userId = userResponse.data.data[0].id;
          
          // Check if the channel is live
          const streamResponse = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: {
              'Client-ID': twitchClientId,
              'Authorization': `Bearer ${accessToken}`
            },
            params: {
              user_id: userId
            }
          });
          
          if (streamResponse.data.data && streamResponse.data.data.length > 0) {
            const stream = streamResponse.data.data[0];
            const liveStreamData = {
              id: stream.id,
              title: stream.title,
              description: stream.title,
              thumbnail: stream.thumbnail_url.replace('{width}', '1920').replace('{height}', '1080'),
              startTime: stream.started_at,
              isLive: true,
              platform: 'twitch',
              embedUrl: `https://player.twitch.tv/?channel=uksimracing&parent=${process.env.DOMAIN || 'localhost'}`,
              watchUrl: 'https://www.twitch.tv/uksimracing',
              viewerCount: stream.viewer_count,
              gameName: stream.game_name
            };
            
            global.liveStreamData = liveStreamData;
            console.log(`🟣 Twitch live stream detected: ${liveStreamData.title} (${liveStreamData.viewerCount} viewers)`);
            liveStreamFound = true;
          }
        }
      }
    } catch (error) {
      console.error('❌ Twitch live stream check failed:', error.message);
    }
  } else if (!liveStreamFound) {
    console.log('⚠️ Twitch API credentials not configured - skipping Twitch live stream check');
  }
  
  if (!liveStreamFound) {
    global.liveStreamData = null;
    console.log('📺 No live streams currently active');
  }
}

// Check for community Twitch streams
async function checkTwitchStreams() {
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  
  if (!twitchClientId || !twitchClientSecret) {
    console.log('⚠️ Twitch API credentials not configured - skipping community stream check');
    global.twitchCommunityStreams = [];
    return;
  }
  
  try {
    console.log('🟣 Checking for community Twitch streams...');
    
    // Get Twitch OAuth token
    console.log('🟣 Requesting Twitch OAuth token...');
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      grant_type: 'client_credentials'
    });
    
    if (!tokenResponse.data.access_token) {
      throw new Error('Failed to get Twitch access token');
    }
    
    console.log('🟣 Successfully obtained Twitch access token');
    const accessToken = tokenResponse.data.access_token;
    
    // Get up to 1000 streams playing iRacing using pagination (10 pages of 100 each)
    console.log('🟣 Fetching iRacing streams with pagination...');
    let allStreams = [];
    let cursor = null;
    const maxPages = 10;
    
    for (let page = 0; page < maxPages; page++) {
      console.log(`🟣 Fetching page ${page + 1}/${maxPages}...`);
      
      const streamsResponse = await axios.get(`https://api.twitch.tv/helix/streams`, {
        headers: {
          'Client-ID': twitchClientId,
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          game_id: '19554',  // iRacing's game ID on Twitch
          first: 100,
          ...(cursor && { after: cursor })
        }
      });
      
      if (streamsResponse.data.data && streamsResponse.data.data.length > 0) {
        allStreams = allStreams.concat(streamsResponse.data.data);
        console.log(`🟣 Page ${page + 1}: Found ${streamsResponse.data.data.length} streams (total: ${allStreams.length})`);
      }
      
      // Get pagination cursor for next page
      cursor = streamsResponse.data.pagination?.cursor;
      if (!cursor) {
        console.log(`🟣 No more pages available after page ${page + 1}`);
        break;
      }
      
      // Small delay to avoid rate limiting
      if (page < maxPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`🟣 Found ${allStreams.length} total iRacing streams across all pages`);
    
    let communityStreams = [];
    
    if (allStreams.length > 0) {
      // Debug: Log first 20 stream titles to verify data
      console.log('🟣 Sample stream titles (first 20):');
      allStreams.slice(0, 20).forEach((stream, index) => {
        console.log(`  ${index + 1}. "${stream.title}" by ${stream.user_name}`);
      });
      
      // Filter streams that have UKSR or UKSimRacing in title (case insensitive)
      const searchTerms = ['UKSR', 'UKSimRacing'];
      console.log(`🟣 Searching for terms: ${searchTerms.join(', ')}`);
      
      communityStreams = allStreams.filter(stream => {
        const title = stream.title.toLowerCase();
        const hasMatchingTerm = searchTerms.some(term => {
          const match = title.includes(term.toLowerCase());
          return match;
        });
        
        return hasMatchingTerm;
      });
      
      console.log(`🟣 Filtered to ${communityStreams.length} community streams out of ${allStreams.length} total`);
      
      // Show the matched streams for debugging
      if (communityStreams.length > 0) {
        console.log('🟣 Matched UKSR/UKSimRacing streams:');
        communityStreams.forEach((stream, index) => {
          console.log(`  ${index + 1}. "${stream.title}" by ${stream.user_name} (${stream.viewer_count} viewers)`);
        });
      } else {
        console.log('🟣 No streams found matching UKSR or UKSimRacing terms');
        // Show a few random stream titles to verify the search is working
        const sampleStreams = allStreams.slice(0, 5);
        console.log('🟣 Sample of available stream titles (for comparison):');
        sampleStreams.forEach((stream, index) => {
          console.log(`  ${index + 1}. "${stream.title}" by ${stream.user_name}`);
        });
      }
    }
    
    // Remove duplicates based on user_id
    const uniqueStreams = communityStreams.filter((stream, index, self) =>
      index === self.findIndex(s => s.user_id === stream.user_id)
    );
    
    // Get user details for the streams
    if (uniqueStreams.length > 0) {
      const userIds = uniqueStreams.map(stream => stream.user_id);
      const usersResponse = await axios.get(`https://api.twitch.tv/helix/users`, {
        headers: {
          'Client-ID': twitchClientId,
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          id: userIds
        }
      });
      
      // Combine stream data with user data
      const streamsWithUserData = uniqueStreams.map(stream => {
        const user = usersResponse.data.data.find(u => u.id === stream.user_id);
        return {
          id: stream.id,
          user_id: stream.user_id,
          user_login: stream.user_login,
          user_name: stream.user_name,
          title: stream.title,
          viewer_count: stream.viewer_count,
          started_at: stream.started_at,
          thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
          profile_image_url: user ? user.profile_image_url : null,
          twitch_url: `https://www.twitch.tv/${stream.user_login}`
        };
      });
      
      // Check for new streams and send welcome messages
      const newStreams = streamsWithUserData.filter(stream => 
        !global.messagedStreams.has(stream.user_id)
      );
      
      if (newStreams.length > 0) {
        console.log(`💬 Found ${newStreams.length} new streams to message`);
        
        // Send welcome message to new streams
        for (const stream of newStreams) {
          const welcomeMessage = "Automated Message: Your stream has been detected and is being featured on https://uksimracing.co.uk, good luck and happy racing!";
          
          const messageSent = await sendTwitchChatMessage(stream.user_id, welcomeMessage);
          
          if (messageSent) {
            // Mark this stream as messaged
            global.messagedStreams.add(stream.user_id);
            console.log(`💬 Sent welcome message to ${stream.user_name} (${stream.user_login})`);
          } else {
            console.log(`❌ Failed to send message to ${stream.user_name} (${stream.user_login})`);
          }
          
          // Add a small delay between messages to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      global.twitchCommunityStreams = streamsWithUserData;
      console.log(`🟣 Found ${streamsWithUserData.length} community streams on Twitch playing iRacing`);
    } else {
      global.twitchCommunityStreams = [];
      console.log('🟣 No community streams found on Twitch');
    }
    
    // Clean up messaged streams for streams that are no longer live
    if (global.twitchCommunityStreams && global.twitchCommunityStreams.length > 0) {
      const currentStreamIds = new Set(global.twitchCommunityStreams.map(stream => stream.user_id));
      const messagedStreamIds = Array.from(global.messagedStreams);
      
      // Remove streams from messaged list if they're no longer live
      messagedStreamIds.forEach(userId => {
        if (!currentStreamIds.has(userId)) {
          global.messagedStreams.delete(userId);
          console.log(`🧹 Cleaned up messaging record for offline stream: ${userId}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Twitch community stream check failed:', error.message);
    global.twitchCommunityStreams = [];
  }
}

// Twitch token storage functions
async function loadTwitchTokens() {
  try {
    if (!fs.existsSync(TWITCH_TOKENS_FILE)) {
      return null;
    }
    const data = await fs.readFile(TWITCH_TOKENS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading Twitch tokens:', error);
    return null;
  }
}

async function saveTwitchTokens(tokens) {
  try {
    await fs.ensureDir(path.dirname(TWITCH_TOKENS_FILE));
    await fs.writeFile(TWITCH_TOKENS_FILE, JSON.stringify(tokens, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving Twitch tokens:', error);
    return false;
  }
}

async function refreshTwitchUserToken() {
  const tokens = await loadTwitchTokens();
  if (!tokens || !tokens.refresh_token) {
    console.error('No refresh token available for Twitch bot');
    return null;
  }

  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;

  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    });

    const newTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000),
      scopes: response.data.scope
    };

    await saveTwitchTokens(newTokens);
    return newTokens.access_token;
  } catch (error) {
    console.error('Error refreshing Twitch token:', error);
    return null;
  }
}

async function getTwitchUserToken() {
  const tokens = await loadTwitchTokens();
  
  if (!tokens) {
    console.error('No Twitch tokens found. Bot needs to be authorized first.');
    return null;
  }

  // Check if token is still valid (with 5 minute buffer)
  if (tokens.expires_at && Date.now() < (tokens.expires_at - 300000)) {
    return tokens.access_token;
  }

  // Token expired, try to refresh
  return await refreshTwitchUserToken();
}

// Send chat message to Twitch stream
async function sendTwitchChatMessage(broadcasterUserId, message) {
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchBotUserId = process.env.TWITCH_BOT_USER_ID;
  
  if (!twitchClientId || !twitchClientSecret) {
    console.log('⚠️ Twitch API credentials not configured - skipping chat message');
    return false;
  }
  
  if (!twitchBotUserId) {
    console.log('⚠️ Twitch bot user ID not configured - skipping chat message');
    return false;
  }
  
  try {
    console.log(`💬 Attempting to send chat message to broadcaster ${broadcasterUserId}...`);
    
    // Get user access token for chat messaging
    const accessToken = await getTwitchUserToken();
    
    if (!accessToken) {
      throw new Error('Failed to get Twitch user access token for chat. Bot needs to be authorized first.');
    }
    
    // Send chat message using Twitch Helix API
    // Using the configured bot account to send messages
    const chatResponse = await axios.post('https://api.twitch.tv/helix/chat/messages', {
      broadcaster_id: broadcasterUserId,
      sender_id: twitchBotUserId, // Bot account sends the message
      message: message
    }, {
      headers: {
        'Client-ID': twitchClientId,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log(`✅ Successfully sent chat message to broadcaster ${broadcasterUserId}`);
    return true;
    
  } catch (error) {
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 401) {
        console.error(`❌ Authentication failed for broadcaster ${broadcasterUserId}: Invalid credentials or insufficient permissions`);
      } else if (status === 403) {
        console.error(`❌ Access forbidden for broadcaster ${broadcasterUserId}: Bot may not have permission to send messages to this channel`);
      } else if (status === 429) {
        console.error(`❌ Rate limit exceeded for broadcaster ${broadcasterUserId}: Too many requests`);
      } else if (status === 400) {
        console.error(`❌ Bad request for broadcaster ${broadcasterUserId}:`, errorData?.message || 'Invalid request format');
      } else {
        console.error(`❌ Failed to send chat message to broadcaster ${broadcasterUserId} (Status: ${status}):`, errorData || error.message);
      }
    } else if (error.code === 'ECONNABORTED') {
      console.error(`❌ Timeout sending chat message to broadcaster ${broadcasterUserId}: Request timed out`);
    } else {
      console.error(`❌ Network error sending chat message to broadcaster ${broadcasterUserId}:`, error.message);
    }
    
    return false;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Secret admin panel route
app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

// Videos page route
app.get('/videos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'videos.html'));
});

// Partners page route
app.get('/partners', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'partners.html'));
});

// Leagues page route
app.get('/leagues', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leagues.html'));
});

// Twitch OAuth callback endpoint
app.get('/auth/twitch/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchRedirectUri = process.env.TWITCH_REDIRECT_URI;

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', {
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: twitchRedirectUri
    });

    const tokens = {
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token,
      expires_at: Date.now() + (tokenResponse.data.expires_in * 1000),
      scopes: tokenResponse.data.scope
    };

    // Save tokens
    const saved = await saveTwitchTokens(tokens);
    if (saved) {
      res.send(`
        <html>
          <body>
            <h2>✅ Twitch Bot Authorization Successful!</h2>
            <p>The bot has been authorized and can now send chat messages.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      console.log('✅ Twitch bot authorization completed successfully');
    } else {
      throw new Error('Failed to save tokens');
    }
  } catch (error) {
    console.error('Error in Twitch OAuth callback:', error);
    res.status(500).send(`
      <html>
        <body>
          <h2>❌ Authorization Failed</h2>
          <p>Error: ${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Generate Twitch authorization URL for bot setup
app.get('/admin/twitch/authorize', (req, res) => {
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchRedirectUri = process.env.TWITCH_REDIRECT_URI;
  const state = crypto.randomBytes(16).toString('hex');
  
  const authUrl = `https://id.twitch.tv/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${twitchClientId}&` +
    `redirect_uri=${encodeURIComponent(twitchRedirectUri)}&` +
    `scope=user:write:chat&` +
    `state=${state}`;

  res.send(`
    <html>
      <body>
        <h2>Twitch Bot Authorization</h2>
        <p>Click the link below to authorize the bot for chat messaging:</p>
        <p><a href="${authUrl}" target="_blank">Authorize Twitch Bot</a></p>
        <p><strong>Important:</strong> You must be logged in as the bot user (ID: ${process.env.TWITCH_BOT_USER_ID}) on Twitch.</p>
      </body>
    </html>
  `);
});

// Function to get next image from rotation
const getNextRotationImage = () => {
  const images = [
    '2025-01-13_19-56-00_0.png',
    '2025-03-11_19-46-24_0.png',
    '2025-04-15_14-19-09_0.png',
    '2025-04-15_14-30-06_0.png',
    '2025-04-15_14-35-54_0.png',
    '2025-04-15_15-04-34_0.png',
    '2025-05-13_14-47-04_0.png',
    '2025-05-13_15-10-43_0.png',
    '2025-05-19_15-29-07_0.png',
    '2025-05-26_21-44-50_0.png',
    '2025-05-27_14-57-52_0.png',
    '2025-05-27_15-10-05_0.png',
    '2025-06-03_15-04-33_0.png',
    '2025-06-03_15-08-01_0.png',
    '2025-06-03_15-17-54_0.png'
  ];
  
  // Get next image based on current count of news articles
  return new Promise((resolve) => {
    db.get('SELECT COUNT(*) as count FROM news', (err, row) => {
      if (err) {
        console.error('Error getting news count for image rotation:', err);
        resolve(images[0]); // Default to first image
        return;
      }
      const index = (row.count || 0) % images.length;
      resolve(images[index]);
    });
  });
};

// Discord webhook endpoint
app.post('/webhook/discord', async (req, res) => {
  console.log('🔗 Discord webhook received from:', req.ip, req.get('host'));
  console.log('Headers:', req.headers);
  console.log('Body preview:', req.body?.content?.substring(0, 100) + '...');
  
  const webhookSecret = process.env.DISCORD_WEBHOOK_SECRET || 'default-secret';
  const providedSecret = req.headers['x-webhook-secret'];
  
  console.log('Expected secret:', webhookSecret);
  console.log('Provided secret:', providedSecret);
  
  if (providedSecret !== webhookSecret) {
    console.log('❌ Unauthorized - secret mismatch');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { content, author, message_id, attachments, channel } = req.body;
  
  if (!content || !author) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Parse title and content from Discord message
  function parseDiscordMessage(content) {
    if (!content || !content.trim()) {
      return { title: 'Untitled Post', body: '' };
    }
    
    // Clean up content
    const cleanContent = content.trim();
    
    // Try to split on double newlines first (proper paragraph separation)
    let paragraphs = cleanContent.split('\n\n').filter(p => p.trim());
    
    // If no double newlines, try single newlines but be smarter about it
    if (paragraphs.length <= 1) {
      const lines = cleanContent.split('\n').filter(l => l.trim());
      
      // Find a good break point - look for first empty line or after a substantial first line
      let titleEndIndex = 0;
      
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        
        // If first line is substantial (> 20 chars), use it as title
        if (firstLine.length > 20) {
          titleEndIndex = 1;
        } else {
          // Look for first substantial line or first 2-3 lines combined
          let combinedTitle = firstLine;
          for (let i = 1; i < Math.min(3, lines.length); i++) {
            const nextLine = lines[i].trim();
            if (nextLine.length === 0) break; // Empty line, stop here
            combinedTitle += ' ' + nextLine;
            titleEndIndex = i + 1;
            
            // Stop if we have a good title length
            if (combinedTitle.length > 30) break;
          }
        }
        
        paragraphs = [
          lines.slice(0, titleEndIndex).join(' ').trim(),
          lines.slice(titleEndIndex).join('\n').trim()
        ].filter(p => p);
      }
    }
    
    // Extract title and body
    const title = paragraphs[0] ? paragraphs[0].trim() : 'Untitled Post';
    const body = paragraphs.length > 1 ? paragraphs.slice(1).join('\n\n').trim() : '';
    
    return { title, body };
  }
  
  // Process hyperlinks in content
  function processHyperlinks(text) {
    if (!text) return text;
    
    // Convert bare URLs to clickable links
    text = text.replace(
      /(https?:\/\/[^\s]+)/g, 
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Handle Discord markdown links [text](url)
    text = text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    return text;
  }
  
  const { title, body } = parseDiscordMessage(content);
  const processedBody = processHyperlinks(body);
  
  // Get image URL from attachments if available
  const imageUrl = attachments && attachments[0] ? attachments[0].url : null;
  
  // Download and save image locally if present, or use rotation image
  let localImagePath = null;
  if (imageUrl) {
    localImagePath = await downloadAndSaveImage(imageUrl, message_id);
  } else {
    // No image provided, use rotation image
    const rotationImage = await getNextRotationImage();
    localImagePath = `/uploads/Images/${rotationImage}`;
  }
  
  console.log(`📝 Parsed Discord message:`);
  console.log(`   Title: "${title}"`);
  console.log(`   Body length: ${processedBody.length} chars`);
  console.log(`   Body preview: "${processedBody.substring(0, 100)}${processedBody.length > 100 ? '...' : ''}"`);
  console.log(`   Has hyperlinks: ${processedBody.includes('<a href=')}`);
  
  // Additional validation
  if (title.length > 200) {
    console.log(`⚠️ Warning: Title is very long (${title.length} chars), consider reviewing parsing logic`);
  }
  
  db.run(
    'INSERT INTO news (title, content, author, discord_message_id, image_url, local_image_path) VALUES (?, ?, ?, ?, ?, ?)',
    [title, processedBody, author, message_id, imageUrl, localImagePath],
    function(err) {
      if (err) {
        console.error('Error inserting news:', err.message);
        res.status(500).json({ error: 'Failed to save news' });
        return;
      }
      console.log(`✅ News saved with ${localImagePath ? 'local' : 'no'} image: ${title}`);
      res.json({ success: true, id: this.lastID });
    }
  );
});

// API endpoint to update stats from Discord bot
app.post('/api/stats', (req, res) => {
  const webhookSecret = process.env.DISCORD_WEBHOOK_SECRET || 'default-secret';
  const providedSecret = req.headers['x-webhook-secret'];
  
  if (providedSecret !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { memberCount } = req.body;
  
  if (!memberCount) {
    return res.status(400).json({ error: 'Missing member count' });
  }
  
  // Store member count in a simple way (you could use a database here)
  global.discordStats = {
    memberCount: memberCount,
    lastUpdated: new Date().toISOString()
  };
  
  console.log(`📊 Updated Discord member count: ${memberCount}`);
  res.json({ success: true, memberCount });
});

// API endpoint to get current stats
app.get('/api/stats', (req, res) => {
  const stats = global.discordStats || { memberCount: 2200, lastUpdated: null };
  res.json(stats);
});

// API endpoint to get live stream status
app.get('/api/livestream', (req, res) => {
  const liveStream = global.liveStreamData || null;
  res.json({ liveStream });
});

// API endpoint to get community Twitch streams
app.get('/api/twitch/streams', (req, res) => {
  const streams = global.twitchCommunityStreams || [];
  res.json({ streams });
});

// Admin authentication endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // If no username provided, try legacy login for backwards compatibility
  if (!username) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password === adminPassword) {
      // Update last login for master user
      db.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE username = ?', ['Chris Eddisford']);
      res.json({ success: true, token: 'master-authenticated', role: 'master', username: 'Chris Eddisford' });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
    return;
  }
  
  // Check database for user
  db.get('SELECT * FROM admin_users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) {
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
      return;
    }
    
    if (user) {
      // Update last login
      db.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      
      const token = `${user.role}-authenticated-${user.id}`;
      res.json({ 
        success: true, 
        token: token, 
        role: user.role, 
        username: user.username,
        id: user.id 
      });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  });
});

// Helper function to validate admin token
function validateAdminToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }
  
  const token = authHeader.split(' ')[1];
  
  // Legacy token support
  if (token === 'admin-authenticated' || token === 'master-authenticated') {
    return { valid: true, role: 'master', legacy: true };
  }
  
  // Discord token format: discord-<base64>
  if (token.startsWith('discord-')) {
    try {
      const tokenData = JSON.parse(Buffer.from(token.substring(8), 'base64').toString());
      return { 
        valid: true, 
        role: tokenData.role, 
        userId: tokenData.discordId,
        username: tokenData.username,
        isDiscord: true 
      };
    } catch (error) {
      return { valid: false, error: 'Invalid Discord token' };
    }
  }
  
  // New token format: role-authenticated-id
  const tokenParts = token.split('-');
  if (tokenParts.length >= 3) {
    const role = tokenParts[0];
    const userId = tokenParts[tokenParts.length - 1];
    return { valid: true, role: role, userId: userId };
  }
  
  return { valid: false, error: 'Invalid token format' };
}

// Change password endpoint (master admin only)
app.post('/api/admin/change-password', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  const { currentPassword, newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  // For legacy token, check current password against environment
  if (authValidation.legacy) {
    const masterPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (currentPassword !== masterPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Update master user password in database
    db.run('UPDATE admin_users SET password = ? WHERE username = ?', [newPassword, 'master'], (err) => {
      if (err) {
        console.error('Error updating master password:', err.message);
        res.status(500).json({ error: 'Failed to update password' });
        return;
      }
      res.json({ success: true });
    });
  } else {
    // For new tokens, verify current password from database
    db.get('SELECT * FROM admin_users WHERE id = ?', [authValidation.userId], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (user.password !== currentPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      
      db.run('UPDATE admin_users SET password = ? WHERE id = ?', [newPassword, authValidation.userId], (err) => {
        if (err) {
          console.error('Error updating password:', err.message);
          res.status(500).json({ error: 'Failed to update password' });
          return;
        }
        res.json({ success: true });
      });
    });
  }
});

// Create sub-admin endpoint (master admin only)
app.post('/api/admin/create-user', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (!['admin', 'moderator'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or moderator' });
  }
  
  const createdBy = authValidation.legacy ? 'master' : authValidation.userId;
  
  db.run(
    'INSERT INTO admin_users (username, password, role, created_by) VALUES (?, ?, ?, ?)',
    [username, password, role, createdBy],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.status(400).json({ error: 'Username already exists' });
        } else {
          console.error('Error creating user:', err.message);
          res.status(500).json({ error: 'Failed to create user' });
        }
        return;
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Get all admin users (master admin only)
app.get('/api/admin/users', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  db.all(
    'SELECT id, username, role, created_at, created_by, last_login FROM admin_users ORDER BY created_at DESC',
    [],
    (err, users) => {
      if (err) {
        console.error('Error fetching users:', err.message);
        res.status(500).json({ error: 'Failed to fetch users' });
        return;
      }
      res.json(users);
    }
  );
});

// Delete admin user (master admin only, cannot delete master)
app.delete('/api/admin/users/:id', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  const { id } = req.params;
  
  // Check if trying to delete master user
  db.get('SELECT * FROM admin_users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.role === 'master') {
      return res.status(400).json({ error: 'Cannot delete master admin' });
    }
    
    db.run('DELETE FROM admin_users WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting user:', err.message);
        res.status(500).json({ error: 'Failed to delete user' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'User not found' });
      } else {
        res.json({ success: true, deletedId: id });
      }
    });
  });
});

// Delete news endpoint
app.delete('/api/news/:id', (req, res) => {
  const { id } = req.params;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  db.run('DELETE FROM news WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting news:', err.message);
      res.status(500).json({ error: 'Failed to delete news' });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'News not found' });
    } else {
      res.json({ success: true, deletedId: id });
    }
  });
});

// Update news endpoint
app.put('/api/news/:id', (req, res) => {
  const { id } = req.params;
  const { title, content, author, image_url } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  db.run(
    'UPDATE news SET title = ?, content = ?, author = ?, image_url = ? WHERE id = ?',
    [title, content, author, image_url, id],
    function(err) {
      if (err) {
        console.error('Error updating news:', err.message);
        res.status(500).json({ error: 'Failed to update news' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'News not found' });
      } else {
        res.json({ success: true, updatedId: id });
      }
    }
  );
});

// Create news endpoint
app.post('/api/news', async (req, res) => {
  const { title, content, author, image_url } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!content || !author) {
    return res.status(400).json({ error: 'Content and author are required' });
  }
  
  // Parse content: first paragraph as title, rest as body
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  const parsedTitle = title || (paragraphs[0] ? paragraphs[0].trim().substring(0, 100) : 'Untitled');
  const parsedContent = title ? content : (paragraphs.length > 1 ? paragraphs.slice(1).join('\n\n') : '');
  
  const timestamp = new Date().toISOString();
  
  // If no image provided, get rotation image
  let finalImageUrl = image_url;
  let localImagePath = null;
  
  if (!image_url) {
    const rotationImage = await getNextRotationImage();
    localImagePath = `/uploads/Images/${rotationImage}`;
  }
  
  // Get the lowest sort_order and subtract 1 to put new post at the top
  db.get('SELECT MIN(sort_order) as min_order FROM news', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const sortOrder = (row.min_order || 1) - 1;
    
    db.run(
      'INSERT INTO news (title, content, author, image_url, local_image_path, timestamp, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [parsedTitle, parsedContent, author, finalImageUrl || null, localImagePath, timestamp, sortOrder],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        res.json({ 
          success: true, 
          newsId: this.lastID,
          message: 'News article created successfully'
        });
      }
    );
  });
});

// News image upload endpoint
app.post('/api/news/upload-image', upload.single('image'), (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  
  // Return the relative path that can be used in the frontend
  const imagePath = `/uploads/news/${req.file.filename}`;
  
  res.json({ 
    success: true, 
    imagePath: imagePath,
    filename: req.file.filename 
  });
});

// Reorder news endpoint
app.post('/api/news/reorder', (req, res) => {
  const { newsIds } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!Array.isArray(newsIds)) {
    return res.status(400).json({ error: 'Invalid news IDs array' });
  }
  
  // Update each news item with its new sort order
  const updatePromises = newsIds.map((id, index) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE news SET sort_order = ? WHERE id = ?', [index, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  Promise.all(updatePromises)
    .then(() => {
      res.json({ success: true });
    })
    .catch((err) => {
      console.error('Error reordering news:', err.message);
      res.status(500).json({ error: 'Failed to reorder news' });
    });
});

// Update the news query to use sort_order
app.get('/api/news', (req, res) => {
  const limit = req.query.limit || 10;
  const offset = req.query.offset || 0;
  
  db.all(
    'SELECT * FROM news ORDER BY sort_order ASC, timestamp DESC LIMIT ? OFFSET ?',
    [limit, offset],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Videos API endpoints

// Helper function to extract YouTube ID from URL
function extractYouTubeId(url) {
  if (!url) return null;
  
  // If it's already just an ID
  if (url.length === 11 && !url.includes('/') && !url.includes('=')) {
    return url;
  }
  
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Get videos endpoint - only return YouTube synced videos
app.get('/api/videos', (req, res) => {
  const limit = req.query.limit || 20;
  const offset = req.query.offset || 0;
  
  db.all(
    'SELECT * FROM videos WHERE created_by = ? ORDER BY sort_order DESC, COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?',
    ['youtube-sync', limit, offset],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Add video endpoint
app.post('/api/videos', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { title, description, video_url, duration } = req.body;
  
  if (!title || !video_url) {
    return res.status(400).json({ error: 'Title and video URL are required' });
  }
  
  // Extract YouTube ID if it's a YouTube URL
  const youtubeId = extractYouTubeId(video_url);
  let thumbnailUrl = '';
  
  if (youtubeId) {
    thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
  }
  
  const createdBy = authValidation.legacy ? 'master' : authValidation.userId;
  
  db.run(
    'INSERT INTO videos (title, description, video_url, youtube_id, thumbnail_url, duration, created_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, description, video_url, youtubeId, thumbnailUrl, duration, createdBy, new Date().toISOString()],
    function(err) {
      if (err) {
        console.error('Error creating video:', err.message);
        res.status(500).json({ error: 'Failed to create video' });
        return;
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Update video endpoint
app.put('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, duration } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // For YouTube-synced videos, we only allow editing title, description, and duration
  // We don't change the YouTube ID or thumbnail URL
  db.run(
    'UPDATE videos SET title = ?, description = ?, duration = ? WHERE id = ?',
    [title, description, duration, id],
    function(err) {
      if (err) {
        console.error('Error updating video:', err.message);
        res.status(500).json({ error: 'Failed to update video' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Video not found' });
      } else {
        console.log(`✅ Updated video ${id}: "${title}"`);
        res.json({ success: true, updatedId: id });
      }
    }
  );
});

// Delete video endpoint
app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // First get video details for logging
  db.get('SELECT title FROM videos WHERE id = ?', [id], (err, video) => {
    if (err) {
      console.error('Error fetching video for deletion:', err.message);
      return res.status(500).json({ error: 'Failed to delete video' });
    }
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Now delete the video
    db.run('DELETE FROM videos WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting video:', err.message);
        res.status(500).json({ error: 'Failed to delete video' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Video not found' });
      } else {
        console.log(`🗑️ Deleted video ${id}: "${video.title}"`);
        res.json({ success: true, deletedId: id });
      }
    });
  });
});

// Reorder videos endpoint
app.post('/api/videos/reorder', (req, res) => {
  const { videoIds } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!Array.isArray(videoIds)) {
    return res.status(400).json({ error: 'Invalid video IDs array' });
  }
  
  // Update each video with its new sort order
  const updatePromises = videoIds.map((id, index) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE videos SET sort_order = ? WHERE id = ?', [index, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  Promise.all(updatePromises)
    .then(() => {
      res.json({ success: true });
    })
    .catch((err) => {
      console.error('Error reordering videos:', err.message);
      res.status(500).json({ error: 'Failed to reorder videos' });
    });
});

// Partners API endpoints

// Get partners endpoint
app.get('/api/partners', (req, res) => {
  db.all(
    'SELECT * FROM partners WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC',
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Add partner endpoint
app.post('/api/partners', upload.single('logo'), (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { name, url } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }
  
  const logoPath = req.file ? `/uploads/partners/${req.file.filename}` : null;
  
  db.run(
    `INSERT INTO partners (name, url, logo_path, description, partner_type, created_by) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, url, logoPath, `Partner: ${name}`, 'Partner', authValidation.username],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({ 
        id: this.lastID,
        name,
        url,
        logo_path: logoPath
      });
    }
  );
});

// Update partner endpoint
app.put('/api/partners/:id', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const partnerId = req.params.id;
  const { name, description, url, partner_type, benefits, instructions, is_featured, is_active } = req.body;
  
  db.run(
    `UPDATE partners SET name = ?, description = ?, url = ?, partner_type = ?, benefits = ?, instructions = ?, is_featured = ?, is_active = ?
     WHERE id = ?`,
    [name, description, url, partner_type, benefits, instructions, is_featured ? 1 : 0, is_active !== false ? 1 : 0, partnerId],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      
      res.json({ success: true, changes: this.changes });
    }
  );
});

// Delete partner endpoint
app.delete('/api/partners/:id', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const partnerId = req.params.id;
  
  db.run('DELETE FROM partners WHERE id = ?', [partnerId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    
    res.json({ success: true, changes: this.changes });
  });
});

// Reorder partners endpoint
app.put('/api/partners/reorder', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { partnerIds } = req.body;
  
  if (!Array.isArray(partnerIds)) {
    return res.status(400).json({ error: 'partnerIds must be an array' });
  }
  
  // Update each partner with its new sort order
  const updatePromises = partnerIds.map((id, index) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE partners SET sort_order = ? WHERE id = ?', [index, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  Promise.all(updatePromises)
    .then(() => {
      res.json({ success: true });
    })
    .catch((err) => {
      console.error('Error reordering partners:', err.message);
      res.status(500).json({ error: 'Failed to reorder partners' });
    });
});

// Leagues API endpoints

// Get leagues endpoint
app.get('/api/leagues', (req, res) => {
  db.all(
    `SELECT * FROM leagues WHERE is_active = 1 AND is_archived = 0 
     ORDER BY 
       CASE registration_status 
         WHEN 'closed' THEN 3
         WHEN 'reserve' THEN 2
         WHEN 'active' THEN 1
         ELSE 4
       END,
       created_at DESC`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Add league endpoint
app.post('/api/leagues', upload.single('image'), (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const { name, information, handbook_url, standings_url, registration_status, registration_url } = req.body;
  
  if (!name || !information) {
    return res.status(400).json({ error: 'Name and information are required' });
  }
  
  const imagePath = req.file ? `/uploads/leagues/${req.file.filename}` : null;
  
  // Update multer config to handle leagues folder
  if (req.file) {
    const leaguesDir = path.join(__dirname, 'public', 'uploads', 'leagues');
    fs.ensureDirSync(leaguesDir);
  }
  
  db.run(
    `INSERT INTO leagues (name, information, image_path, handbook_url, standings_url, registration_status, registration_url, created_by) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, information, imagePath, handbook_url, standings_url, registration_status || 'active', registration_url, authValidation.username],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({ 
        id: this.lastID,
        name,
        information,
        image_path: imagePath
      });
    }
  );
});

// Update league endpoint
app.put('/api/leagues/:id', upload.single('image'), (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const leagueId = req.params.id;
  const { name, information, handbook_url, standings_url, registration_status, registration_url, is_active } = req.body;
  
  let query = `UPDATE leagues SET name = ?, information = ?, handbook_url = ?, standings_url = ?, registration_status = ?, registration_url = ?, is_active = ?`;
  let params = [name, information, handbook_url, standings_url, registration_status, registration_url, is_active === 'true' ? 1 : 0];
  
  if (req.file) {
    const imagePath = `/uploads/leagues/${req.file.filename}`;
    query += `, image_path = ?`;
    params.push(imagePath);
  }
  
  query += ` WHERE id = ?`;
  params.push(leagueId);
  
  db.run(query, params, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    
    res.json({ success: true, changes: this.changes });
  });
});

// Archive/unarchive league endpoint
app.put('/api/leagues/:id/archive', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const leagueId = req.params.id;
  
  // Toggle archive status
  db.get('SELECT is_archived FROM leagues WHERE id = ?', [leagueId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    
    const newArchivedStatus = row.is_archived ? 0 : 1;
    
    db.run('UPDATE leagues SET is_archived = ? WHERE id = ?', [newArchivedStatus, leagueId], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({ success: true, archived: newArchivedStatus });
    });
  });
});

// Delete league endpoint
app.delete('/api/leagues/:id', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const leagueId = req.params.id;
  
  db.run('DELETE FROM leagues WHERE id = ?', [leagueId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'League not found' });
      return;
    }
    
    res.json({ success: true, changes: this.changes });
  });
});

// YouTube integration endpoints

// Function to fetch videos from YouTube Data API
async function fetchYouTubeVideos(channelId, apiKey) {
  if (!apiKey) {
    throw new Error('YouTube API key not configured');
  }
  
  try {
    // Fetch channel uploads playlist
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    );
    const channelData = await channelResponse.json();
    
    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('Channel not found');
    }
    
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    
    // Fetch videos from uploads playlist
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}`
    );
    const videosData = await videosResponse.json();
    
    if (!videosData.items) {
      throw new Error('No videos found');
    }
    
    // Get video details for duration and view count
    const videoIds = videosData.items.map(item => item.snippet.resourceId.videoId).join(',');
    const detailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`
    );
    const detailsData = await detailsResponse.json();
    
    // Combine video info with details
    const videos = videosData.items.map(item => {
      const details = detailsData.items.find(d => d.id === item.snippet.resourceId.videoId);
      return {
        title: item.snippet.title,
        description: item.snippet.description,
        youtube_id: item.snippet.resourceId.videoId,
        thumbnail_url: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        duration: details ? parseDuration(details.contentDetails.duration) : null,
        view_count: details ? parseInt(details.statistics.viewCount) : 0,
        published_at: item.snippet.publishedAt
      };
    });
    
    return videos;
  } catch (error) {
    console.error('YouTube API error:', error);
    throw error;
  }
}

// Helper function to parse YouTube duration format (PT4M13S) to seconds
function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  
  return hours * 3600 + minutes * 60 + seconds;
}

// Manual trigger to sync videos from YouTube (for testing)
app.post('/api/sync-youtube', async (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCvTNBGGgx0a9N0s6lF36R8A'; // UKSimRacing channel ID
    
    let videos = [];
    
    // Only fetch real YouTube data - no placeholders
    if (!youtubeApiKey) {
      return res.status(400).json({ error: 'YouTube API key not configured. Cannot sync videos.' });
    }
    
    try {
      console.log('🎥 Fetching videos from YouTube API...');
      videos = await fetchYouTubeVideos(channelId, youtubeApiKey);
      console.log(`📹 Found ${videos.length} videos from YouTube`);
      
      if (videos.length === 0) {
        return res.status(404).json({ error: 'No videos found on YouTube channel' });
      }
    } catch (error) {
      console.log('❌ YouTube API failed:', error.message);
      return res.status(500).json({ error: `YouTube API error: ${error.message}` });
    }
  
  // Clear existing videos from sync
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM videos WHERE created_by = ?', ['youtube-sync'], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  let addedCount = 0;
  
  // Add videos to database
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    let thumbnailUrl = video.thumbnail_url;
    
    // Generate YouTube thumbnail URL if not provided
    if (!thumbnailUrl && video.youtube_id) {
      thumbnailUrl = `https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`;
    }
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO videos (title, description, youtube_id, thumbnail_url, duration, created_by, sort_order, view_count, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [video.title, video.description, video.youtube_id, thumbnailUrl, video.duration, 'youtube-sync', videos.length - i, video.view_count || 0, video.published_at],
        function(err) {
          if (err) {
            console.error('Error creating video:', err.message);
            reject(err);
          } else {
            addedCount++;
            resolve();
          }
        }
      );
    });
  }
  
  const apiSource = youtubeApiKey ? 'YouTube API' : 'sample data';
  res.json({ success: true, message: `Added ${addedCount} videos from ${apiSource}` });
    
  } catch (error) {
    console.error('Error syncing YouTube videos:', error);
    res.status(500).json({ error: 'Failed to sync YouTube videos' });
  }
});

// Utility endpoint to download existing images
app.post('/api/download-existing-images', async (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Get all news items that have image_url but no local_image_path
    const newsItems = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, discord_message_id, image_url FROM news WHERE image_url IS NOT NULL AND (local_image_path IS NULL OR local_image_path = "")',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log(`📥 Found ${newsItems.length} images to download`);
    let downloadedCount = 0;
    let failedCount = 0;
    
    for (const item of newsItems) {
      const localPath = await downloadAndSaveImage(item.image_url, item.discord_message_id);
      
      if (localPath) {
        // Update the database with the local path
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE news SET local_image_path = ? WHERE id = ?',
            [localPath, item.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        downloadedCount++;
      } else {
        failedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      total: newsItems.length,
      downloaded: downloadedCount,
      failed: failedCount,
      message: `Downloaded ${downloadedCount} images, ${failedCount} failed` 
    });
    
  } catch (error) {
    console.error('Error downloading existing images:', error);
    res.status(500).json({ error: 'Failed to download images' });
  }
});

// Helper function to generate a simple token for Discord users
function generateDiscordToken(userData) {
  const tokenData = {
    userId: userData.userId,
    role: userData.role,
    username: userData.username,
    discordId: userData.discordId,
    timestamp: Date.now()
  };
  return `discord-${Buffer.from(JSON.stringify(tokenData)).toString('base64')}`;
}

// Discord OAuth2 Routes
app.get('/auth/discord', passport.authenticate('discord'));

// Discord admin login route (for main login)
app.get('/auth/discord/admin', passport.authenticate('discord', { 
  state: 'admin_login'
}));

app.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/admin-panel?error=discord_auth_failed' }),
  async (req, res) => {
    try {
      console.log('Discord callback received for user:', req.user.username);
      console.log('User Discord roles:', req.user.roles);
      
      // Check if user has admin panel access based on their Discord roles
      // Pass roles directly to avoid database timing issues
      const hasAccess = await hasPermission(req.user.id, 'admin_panel', req.user.roles);
      console.log('User has admin panel access:', hasAccess);
      
      if (hasAccess) {
        // Generate admin token for Discord user
        const authToken = generateDiscordToken({ 
          userId: req.user.id, 
          role: 'discord_admin',
          username: req.user.username,
          discordId: req.user.id
        });
        
        // Set session data
        req.session.discordUser = {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.avatar,
          roles: req.user.roles
        };
        
        console.log('Redirecting to admin panel with success');
        res.redirect(`/admin-panel?discord_login=success&token=${authToken}&role=discord_admin&username=${encodeURIComponent(req.user.username)}`);
      } else {
        console.log('User lacks sufficient permissions - no authorized roles found');
        res.redirect('/admin-panel?error=insufficient_discord_permissions');
      }
    } catch (error) {
      console.error('Discord callback error:', error);
      res.redirect('/admin-panel?error=discord_auth_failed');
    }
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});

// Discord API endpoints for admin panel
app.get('/api/discord/user', (req, res) => {
  if (req.session.discordUser) {
    res.json(req.session.discordUser);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Debug endpoint to check Discord auth roles configuration
app.get('/api/discord/debug-auth', async (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  try {
    // Get all configured auth roles
    const authRoles = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM discord_auth_roles ORDER BY role_name', (err, roles) => {
        if (err) reject(err);
        else resolve(roles);
      });
    });
    
    res.json({
      configuredAuthRoles: authRoles,
      count: authRoles.length,
      message: authRoles.length === 0 ? 'No Discord auth roles configured' : `${authRoles.length} auth roles configured`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Discord roles from the server
app.get('/api/discord/server-roles', async (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Admin access required' });
  }
  
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return res.status(500).json({ error: 'Discord Guild ID not configured' });
    }
    
    const response = await axios.get(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
    });
    
    const roles = response.data.filter(role => role.name !== '@everyone');
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Discord roles' });
  }
});

// Manage Discord role permissions
app.get('/api/discord/role-permissions', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  db.all('SELECT * FROM discord_roles ORDER BY role_name', (err, roles) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const rolesWithPermissions = roles.map(role => ({
      ...role,
      permissions: JSON.parse(role.permissions || '[]')
    }));
    
    res.json(rolesWithPermissions);
  });
});

app.post('/api/discord/role-permissions', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  const { role_id, role_name, permissions } = req.body;
  
  if (!role_id || !role_name || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  db.run(`INSERT OR REPLACE INTO discord_roles (role_id, role_name, permissions, created_by) 
          VALUES (?, ?, ?, ?)`,
          [role_id, role_name, JSON.stringify(permissions), authValidation.userId || 'admin'],
          (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.delete('/api/discord/role-permissions/:roleId', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  db.run('DELETE FROM discord_roles WHERE role_id = ?', [req.params.roleId], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// New Discord Auth Roles endpoints
app.get('/api/discord/auth-roles', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  db.all('SELECT * FROM discord_auth_roles ORDER BY role_name', (err, roles) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(roles);
  });
});

app.post('/api/discord/auth-roles', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid || authValidation.role !== 'master') {
    return res.status(401).json({ error: 'Master admin access required' });
  }
  
  const { authorizedRoles } = req.body;
  
  if (!Array.isArray(authorizedRoles)) {
    return res.status(400).json({ error: 'authorizedRoles must be an array' });
  }
  
  // Clear existing auth roles and insert new ones
  db.run('DELETE FROM discord_auth_roles', (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (authorizedRoles.length === 0) {
      return res.json({ success: true });
    }
    
    const stmt = db.prepare('INSERT INTO discord_auth_roles (role_id, role_name, created_by) VALUES (?, ?, ?)');
    authorizedRoles.forEach(role => {
      stmt.run(role.role_id, role.role_name, authValidation.userId || 'admin');
    });
    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  });
});

// New Bot Mention Permissions endpoints
app.get('/api/discord/bot-mention-permissions', (req, res) => {
  // Check webhook secret for Discord bot access first
  const webhookSecret = process.env.DISCORD_WEBHOOK_SECRET || 'default-secret';
  const providedSecret = req.headers['x-webhook-secret'];
  
  if (providedSecret === webhookSecret) {
    // Discord bot access - return minimal data needed
    db.all('SELECT role_id, role_name FROM discord_bot_mentions ORDER BY role_name', (err, permissions) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(permissions);
    });
  } else {
    // Admin access required for admin panel
    const authValidation = validateAdminToken(req.headers.authorization);
    
    if (!authValidation.valid) {
      return res.status(401).json({ error: 'Admin access required' });
    }
    
    db.all('SELECT * FROM discord_bot_mentions ORDER BY role_name', (err, permissions) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(permissions);
    });
  }
});

app.post('/api/discord/bot-mention-permissions', (req, res) => {
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Admin access required' });
  }
  
  const { allowedRoles } = req.body;
  
  if (!Array.isArray(allowedRoles)) {
    return res.status(400).json({ error: 'allowedRoles must be an array' });
  }
  
  // Clear existing bot mention permissions and insert new ones
  db.run('DELETE FROM discord_bot_mentions', (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (allowedRoles.length === 0) {
      return res.json({ success: true });
    }
    
    const stmt = db.prepare('INSERT INTO discord_bot_mentions (role_id, role_name, created_by) VALUES (?, ?, ?)');
    allowedRoles.forEach(role => {
      stmt.run(role.role_id, role.role_name, authValidation.userId || 'admin');
    });
    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  });
});

// Let's Encrypt challenge route
app.use('/.well-known/acme-challenge', express.static('/var/www/certbot/.well-known/acme-challenge'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// HTTPS redirect middleware (only for non-API routes and external requests)
app.use((req, res, next) => {
  // Skip HTTPS redirect for internal Docker requests, webhooks, API endpoints, and health checks
  const isInternalRequest = req.get('host') === 'app:80';
  const isApiOrWebhook = req.path.startsWith('/api/') || req.path.startsWith('/webhook/') || req.path === '/health';
  const isLetsEncrypt = req.path.startsWith('/.well-known/');
  
  if (!req.secure && req.get('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    // Allow internal requests, webhooks, API calls, and Let's Encrypt to use HTTP
    if (isInternalRequest || isApiOrWebhook || isLetsEncrypt) {
      return next();
    }
    // Only redirect user-facing pages to HTTPS
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
});


// SSL certificate management
async function requestSSLCertificate() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);
  
  console.log('🔒 Requesting SSL certificate from Let\'s Encrypt...');
  
  try {
    const command = `certbot certonly --webroot --webroot-path=/var/www/certbot --email chris@uksimracing.co.uk --agree-tos --no-eff-email --non-interactive -d ${DOMAIN} -d www.${DOMAIN}`;
    await execAsync(command);
    console.log('✅ SSL certificate obtained successfully!');
    return true;
  } catch (error) {
    console.log('❌ Failed to obtain SSL certificate:', error.message);
    return false;
  }
}

function getSSLCredentials() {
  const certPath = `/etc/letsencrypt/live/${DOMAIN}`;
  try {
    if (fs.existsSync(`${certPath}/fullchain.pem`) && fs.existsSync(`${certPath}/privkey.pem`)) {
      return {
        key: fs.readFileSync(`${certPath}/privkey.pem`),
        cert: fs.readFileSync(`${certPath}/fullchain.pem`)
      };
    }
  } catch (error) {
    console.log('SSL certificates not found');
  }
  return null;
}

// Start servers
async function startServer() {
  let credentials = getSSLCredentials();
  
  // Always start HTTP server (for Let's Encrypt challenges and internal requests)
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP Server running on 0.0.0.0:${HTTP_PORT} for internal services`);
  });

  // If no SSL certificates, try to get them
  if (!credentials && process.env.NODE_ENV === 'production') {
    console.log('🔍 No SSL certificates found, attempting to obtain them...');
    
    // Wait a bit for HTTP server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const success = await requestSSLCertificate();
    if (success) {
      credentials = getSSLCredentials();
    }
  }

  // Start HTTPS server if certificates are available
  if (credentials) {
    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 HTTPS Server running on 0.0.0.0:${HTTPS_PORT}`);
      console.log(`🎉 UKSimRacing website available at https://${DOMAIN}`);
    });
  } else {
    console.log('⚠️  Running in HTTP-only mode. SSL certificates not available.');
    console.log(`🌐 UKSimRacing website available at http://${DOMAIN}`);
    console.log('💡 To get SSL certificates, ensure domain points to this server and run:');
    console.log(`   certbot certonly --webroot --webroot-path=/var/www/certbot -d ${DOMAIN} -d www.${DOMAIN}`);
  }
}

// Start the server
startServer().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});