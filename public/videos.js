// Videos Page JavaScript
console.log('🎥 Videos page loading...');

// Live Stream Manager
class LiveStreamManager {
    constructor() {
        this.liveStreamContainer = document.getElementById('liveStreamContainer');
        this.liveStreamSection = document.getElementById('live-stream');
        this.loading = false;
        
        this.init();
    }
    
    init() {
        this.loadLiveStream();
        // Refresh live stream status every 2 minutes
        setInterval(() => {
            this.loadLiveStream();
        }, 2 * 60 * 1000);
    }
    
    async loadLiveStream() {
        if (this.loading) return;
        
        this.loading = true;
        
        try {
            const response = await fetch('/api/livestream');
            const data = await response.json();
            
            if (data.liveStream && data.liveStream.isLive) {
                // Show the section and render live stream
                this.liveStreamSection.style.display = 'block';
                this.renderLiveStream(data.liveStream);
                console.log(`🔴 Live stream found: ${data.liveStream.title}`);
            } else {
                // Hide the section when no live stream
                this.liveStreamSection.style.display = 'none';
                console.log('📺 No live stream currently active');
            }
        } catch (error) {
            console.error('Error loading live stream:', error);
            // Hide section on error
            this.liveStreamSection.style.display = 'none';
        } finally {
            this.loading = false;
        }
    }
    
    renderLiveStream(stream) {
        this.liveStreamContainer.innerHTML = '';
        
        const streamCard = this.createLiveStreamCard(stream);
        this.liveStreamContainer.appendChild(streamCard);
    }
    
    createLiveStreamCard(stream) {
        const card = document.createElement('div');
        card.className = 'live-stream-embed';
        
        const platformIcon = stream.platform === 'youtube' ? '📺' : '🟣';
        const viewerText = stream.viewerCount ? ` • ${stream.viewerCount} viewers` : '';
        const startedTime = this.formatStreamTime(stream.startTime);
        
        card.innerHTML = `
            <div class="live-stream-player">
                <iframe 
                    src="${stream.embedUrl}" 
                    frameborder="0" 
                    allowfullscreen
                    allow="autoplay; fullscreen"
                    class="live-stream-iframe">
                </iframe>
            </div>
            <div class="live-stream-info">
                <div class="live-stream-header">
                    <h4 class="live-stream-title">${stream.title}</h4>
                    <a href="${stream.watchUrl}" target="_blank" class="live-stream-watch-btn">
                        ${platformIcon} Watch on ${stream.platform === 'youtube' ? 'YouTube' : 'Twitch'}
                    </a>
                </div>
                <div class="live-stream-meta">
                    <span class="live-stream-status">🔴 LIVE</span>
                    <span class="live-stream-time">Started streaming ${startedTime}${viewerText}</span>
                    ${stream.gameName ? `<span class="live-stream-game">Playing ${stream.gameName}</span>` : ''}
                </div>
            </div>
        `;
        
        return card;
    }
    
    formatStreamTime(startedAt) {
        const startTime = new Date(startedAt);
        const now = new Date();
        const diffMinutes = Math.floor((now - startTime) / (1000 * 60));
        
        if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        } else {
            const hours = Math.floor(diffMinutes / 60);
            return `${hours}h ago`;
        }
    }
}

class VideosManager {
    constructor() {
        this.videosContainer = document.getElementById('videosContainer');
        this.loadMoreBtn = document.getElementById('loadMoreVideos');
        this.currentOffset = 0;
        this.limit = 20;
        this.loading = false;
        this.init();
    }
    
    init() {
        this.loadVideos();
        this.loadMoreBtn.addEventListener('click', () => this.loadMoreVideos());
    }
    
    async loadVideos() {
        if (this.loading) return;
        
        this.loading = true;
        this.showLoading();
        
        try {
            console.log(`🎥 Fetching videos from /api/videos?limit=${this.limit}&offset=${this.currentOffset}`);
            const response = await fetch(`/api/videos?limit=${this.limit}&offset=${this.currentOffset}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const videos = await response.json();
            console.log(`🎥 Received ${videos.length} videos from API`);
            
            if (this.currentOffset === 0) {
                this.videosContainer.innerHTML = '';
            }
            
            if (videos.length === 0 && this.currentOffset === 0) {
                console.log('🎥 No videos found, showing no videos message');
                this.showNoVideos();
            } else if (videos.length > 0) {
                console.log('🎥 Rendering videos');
                this.renderVideos(videos);
                this.currentOffset += videos.length;
                
                // Show load more button if we got full limit (more videos might exist)
                if (videos.length === this.limit) {
                    this.loadMoreBtn.style.display = 'block';
                } else {
                    this.loadMoreBtn.style.display = 'none';
                }
            } else {
                // No more videos to load
                this.loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('🎥 Error loading videos:', error);
            this.showError();
        } finally {
            this.loading = false;
        }
    }
    
    async loadMoreVideos() {
        await this.loadVideos();
    }
    
    renderVideos(videos) {
        videos.forEach(video => {
            const videoCard = this.createVideoCard(video);
            this.videosContainer.appendChild(videoCard);
        });
        
        // Video edit functionality is only available in the full admin panel
    }
    
    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.id = video.id;
        
        const formattedDate = this.formatDate(video.published_at || video.created_at);
        const duration = this.formatDuration(video.duration);
        
        card.innerHTML = `
            <div class="video-thumbnail">
                <img src="${video.thumbnail_url}" alt="${video.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjM2EzYTNhIi8+Cjx0ZXh0IHg9IjE2MCIgeT0iOTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzgwODA4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIFRodW1ibmFpbDwvdGV4dD4KPC9zdmc+'">
                <div class="video-duration">${duration}</div>
                <div class="video-play-overlay"></div>
            </div>
            <div class="video-info">
                <h3 class="video-title">${video.title}</h3>
                <p class="video-description">${video.description || ''}</p>
                <div class="video-meta">
                    <span class="video-views">${video.view_count || '0'} views</span>
                    <span class="video-date">${formattedDate}</span>
                </div>
            </div>
        `;
        
        // Add click handler to play video
        card.addEventListener('click', (e) => {
            this.playVideo(video);
        });
        
        return card;
    }
    
    playVideo(video) {
        console.log('Playing video:', video.title);
        this.showVideoModal(video);
    }
    
    showVideoModal(video) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('videoModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'videoModal';
            modal.className = 'video-modal';
            modal.innerHTML = `
                <div class="video-modal-content">
                    <span class="video-modal-close">&times;</span>
                    <iframe id="videoPlayer" class="video-modal-player" frameborder="0" allowfullscreen></iframe>
                    <div class="video-modal-info">
                        <h2 id="modalVideoTitle"></h2>
                        <p id="modalVideoDescription"></p>
                        <div class="video-modal-meta">
                            <span id="modalVideoViews"></span>
                            <span id="modalVideoDate"></span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add close handlers
            modal.querySelector('.video-modal-close').addEventListener('click', () => {
                this.closeVideoModal();
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeVideoModal();
                }
            });
            
            // Close with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'block') {
                    this.closeVideoModal();
                }
            });
        }
        
        // Populate modal with content
        const formattedDate = this.formatDate(video.published_at || video.created_at);
        document.getElementById('modalVideoTitle').textContent = video.title;
        document.getElementById('modalVideoDescription').textContent = video.description || '';
        document.getElementById('modalVideoViews').textContent = `${video.view_count || '0'} views`;
        document.getElementById('modalVideoDate').textContent = formattedDate;
        
        // Set video source
        const player = document.getElementById('videoPlayer');
        if (video.youtube_id) {
            player.src = `https://www.youtube.com/embed/${video.youtube_id}?autoplay=1`;
        } else if (video.video_url) {
            player.src = video.video_url;
        }
        
        // Show modal and prevent body scroll
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const player = document.getElementById('videoPlayer');
        
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        player.src = ''; // Stop video playback
    }
    
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        }
    }
    
    showLoading() {
        if (this.currentOffset === 0) {
            this.videosContainer.innerHTML = '<div class="loading">Loading videos...</div>';
        }
    }
    
    showNoVideos() {
        this.videosContainer.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
                <h3>No videos yet!</h3>
                <p>Check back soon for the latest racing content from the UKSimRacing community.</p>
            </div>
        `;
    }
    
    showError() {
        this.videosContainer.innerHTML = `
            <div class="loading" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
                <h3>Unable to load videos</h3>
                <p>Please try refreshing the page or check back later.</p>
            </div>
        `;
    }
}

// Initialize videos page components when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎥 Videos page initializing...');
    try {
        // Initialize live stream manager
        if (document.getElementById('liveStreamContainer')) {
            console.log('🔴 Creating LiveStreamManager...');
            window.liveStreamManager = new LiveStreamManager();
        }
        
        console.log('🎬 Creating VideosManager...');
        window.videosManager = new VideosManager();
        
        console.log('✅ Videos page initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing videos page:', error);
    }
});