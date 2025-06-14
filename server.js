// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 2000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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
    created_by TEXT,
    sort_order INTEGER DEFAULT 0
  )`);
  
  // Add sort_order column if it doesn't exist (for existing databases)
  db.run(`ALTER TABLE news ADD COLUMN sort_order INTEGER DEFAULT 0`, (err) => {
    // This will error if column already exists, which is fine
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: sort_order column may already exist');
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
  
  // Start automatic YouTube sync on app startup
  console.log('🎬 Setting up automatic YouTube sync...');
  setupAutoYouTubeSync();
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
          'INSERT INTO videos (title, description, youtube_id, thumbnail_url, duration, created_by, sort_order, view_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [video.title, video.description, video.youtube_id, thumbnailUrl, video.duration, 'youtube-sync', videos.length - i, video.view_count || 0],
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
  }, 30000);
  
  // Schedule automatic sync every hour (0 minutes of every hour)
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Hourly YouTube sync triggered');
    syncYouTubeVideos();
  }, {
    timezone: "Europe/London" // UK timezone for UKSimRacing
  });
  
  // Check for live streams every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    console.log('📺 Live stream check triggered');
    checkLiveStreams();
  }, {
    timezone: "Europe/London" // UK timezone for UKSimRacing
  });
  
  console.log('⏰ Automatic YouTube sync scheduled - runs every hour');
  console.log('📺 Live stream check scheduled - runs every 15 minutes');
}

// Check for live streams function
async function checkLiveStreams() {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCPM4Lq8AQpX-74XZJmeuv6Q';
  
  if (!youtubeApiKey) {
    console.log('⚠️ YouTube API key not configured - skipping live stream check');
    return;
  }
  
  try {
    console.log('📺 Checking for live streams...');
    
    // Search for live broadcasts
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${youtubeApiKey}`
    );
    const searchData = await searchResponse.json();
    
    if (searchData.items && searchData.items.length > 0) {
      const liveStream = searchData.items[0];
      const liveStreamData = {
        id: liveStream.id.videoId,
        title: liveStream.snippet.title,
        description: liveStream.snippet.description,
        thumbnail: liveStream.snippet.thumbnails.maxres?.url || liveStream.snippet.thumbnails.high?.url || liveStream.snippet.thumbnails.medium?.url,
        startTime: liveStream.snippet.publishedAt,
        isLive: true
      };
      
      // Store live stream data globally
      global.liveStreamData = liveStreamData;
      console.log(`🔴 Live stream detected: ${liveStreamData.title}`);
    } else {
      // No live streams
      global.liveStreamData = null;
      console.log('📺 No live streams currently active');
    }
    
  } catch (error) {
    console.error('❌ Live stream check failed:', error.message);
    global.liveStreamData = null;
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


// Discord webhook endpoint
app.post('/webhook/discord', (req, res) => {
  console.log('🔗 Webhook received');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
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
  
  // Extract title from first line of content
  const lines = content.split('\n');
  const title = lines[0].substring(0, 100); // First line as title, max 100 chars
  const body = lines.slice(1).join('\n') || content;
  
  // Get image URL from attachments if available
  const imageUrl = attachments && attachments[0] ? attachments[0].url : null;
  
  db.run(
    'INSERT INTO news (title, content, author, discord_message_id, image_url) VALUES (?, ?, ?, ?, ?)',
    [title, body, author, message_id, imageUrl],
    function(err) {
      if (err) {
        console.error('Error inserting news:', err.message);
        res.status(500).json({ error: 'Failed to save news' });
        return;
      }
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
app.post('/api/news', (req, res) => {
  const { title, content, author, image_url } = req.body;
  const authValidation = validateAdminToken(req.headers.authorization);
  
  if (!authValidation.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!title || !content || !author) {
    return res.status(400).json({ error: 'Title, content, and author are required' });
  }
  
  const timestamp = new Date().toISOString();
  
  // Get the lowest sort_order and subtract 1 to put new post at the top
  db.get('SELECT MIN(sort_order) as min_order FROM news', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const sortOrder = (row.min_order || 1) - 1;
    
    db.run(
      'INSERT INTO news (title, content, author, image_url, timestamp, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, author, image_url || null, timestamp, sortOrder],
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
    'SELECT * FROM videos WHERE created_by = ? ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?',
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
    'INSERT INTO videos (title, description, video_url, youtube_id, thumbnail_url, duration, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description, video_url, youtubeId, thumbnailUrl, duration, createdBy],
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
        'INSERT INTO videos (title, description, youtube_id, thumbnail_url, duration, created_by, sort_order, view_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [video.title, video.description, video.youtube_id, thumbnailUrl, video.duration, 'youtube-sync', videos.length - i, video.view_count || 0],
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`UKSimRacing website running on port ${PORT}`);
});

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