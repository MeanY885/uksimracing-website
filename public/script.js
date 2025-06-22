// UKSimRacing Website JavaScript
console.log('🚀 UKSimRacing script loading...');

class NewsManager {
    constructor() {
        this.newsContainer = document.getElementById('newsContainer');
        this.loadMoreBtn = document.getElementById('loadMore');
        this.currentOffset = 0;
        this.limit = 6; // Load 6 cards
        this.maxCards = 6; // Maximum cards to display
        this.loading = false;
        
        this.init();
    }
    
    init() {
        this.loadNews();
        this.loadMoreBtn.addEventListener('click', () => this.loadMoreNews());
    }
    
    
    async loadNews() {
        if (this.loading) return;
        
        this.loading = true;
        this.showLoading();
        
        try {
            // Load the 6 most recent news items
            const response = await fetch(`/api/news?limit=6&offset=0`);
            const news = await response.json();
            
            // Render news
            this.newsContainer.innerHTML = '';
            if (news.length === 0) {
                this.showNoNews();
            } else {
                this.renderNews(news);
                // Hide load more button since we're showing 6 items
                this.loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading news:', error);
            this.showError();
        } finally {
            this.loading = false;
        }
    }
    
    async loadMoreNews() {
        await this.loadNews();
    }
    
    
    renderNews(newsItems) {
        newsItems.forEach(item => {
            const newsCard = this.createNewsCard(item);
            this.newsContainer.appendChild(newsCard);
        });
        
        // Re-add admin controls if in edit mode
        if (window.mainPageAdmin && window.mainPageAdmin.editMode) {
            setTimeout(() => {
                window.mainPageAdmin.addNewsCardEditControls();
                window.mainPageAdmin.enableDragAndDrop();
            }, 100);
        }
    }
    
    createNewsCard(item) {
        const card = document.createElement('div');
        card.className = 'news-card';
        
        const formattedDate = this.formatDate(item.timestamp);
        const excerpt = this.createExcerpt(item.content, 150);
        
        // Create image element with error handling - prefer local images
        let imageHTML = '';
        const imageSource = item.local_image_path || item.image_url;
        
        if (imageSource) {
            imageHTML = `<img src="${imageSource}" alt="${item.title}" class="news-image" onerror="this.style.display='none'; this.parentNode.querySelector('.news-image-placeholder').style.display='flex';">
                        <div class="news-image-placeholder" style="display: none;">📰</div>`;
        } else {
            imageHTML = `<div class="news-image-placeholder">📰</div>`;
        }
        
        card.innerHTML = `
            ${imageHTML}
            <div class="news-content">
                <h3 class="news-title">${item.title}</h3>
                <p class="news-excerpt">${excerpt}</p>
                <div class="news-meta">
                    <span class="news-author">By ${item.author}</span>
                    <span class="news-date">${formattedDate}</span>
                </div>
            </div>
        `;
        
        // Add click handler to expand the news article
        card.addEventListener('click', (e) => {
            console.log('News card clicked:', item.title);
            this.showNewsModal(item);
        });
        
        console.log('Added click handler to news card:', item.title);
        
        return card;
    }
    
    showNewsModal(item) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('newsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'newsModal';
            modal.className = 'news-modal';
            modal.innerHTML = `
                <div class="news-modal-content">
                    <span class="news-modal-close">&times;</span>
                    <div class="news-modal-body">
                        <div class="news-modal-image-container">
                            <div id="modalNewsImage"></div>
                        </div>
                        <div class="news-modal-text">
                            <h2 id="modalNewsTitle"></h2>
                            <div class="news-modal-meta">
                                <span id="modalNewsAuthor"></span>
                                <span id="modalNewsDate"></span>
                            </div>
                            <div id="modalNewsContent"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add close handlers
            modal.querySelector('.news-modal-close').addEventListener('click', () => {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
            
            // Close with Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'block') {
                    modal.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
        }
        
        // Populate modal with content
        const formattedDate = this.formatDate(item.timestamp);
        document.getElementById('modalNewsTitle').textContent = item.title;
        document.getElementById('modalNewsAuthor').textContent = `By ${item.author}`;
        document.getElementById('modalNewsDate').textContent = formattedDate;
        
        // Format content with proper paragraphs and line breaks
        document.getElementById('modalNewsContent').innerHTML = this.formatContentWithParagraphs(item.content);
        
        const imageContainer = document.getElementById('modalNewsImage');
        const modalImageSource = item.local_image_path || item.image_url;
        if (modalImageSource) {
            imageContainer.innerHTML = `<img src="${modalImageSource}" alt="${item.title}" class="news-modal-image">`;
        } else {
            // If no image, make text full width
            modal.querySelector('.news-modal-body').style.gridTemplateColumns = '1fr';
            imageContainer.style.display = 'none';
        }
        
        // Show modal and prevent body scroll
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    createExcerpt(content, maxLength) {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength).trim() + '...';
    }
    
    formatContentWithParagraphs(content) {
        if (!content) return '';
        
        // Clean up the content first
        let cleanContent = content.trim();
        
        // Split content by double line breaks OR single line breaks that create clear paragraph breaks
        // Handle both \n\n and cases where Discord sends single \n between paragraphs
        const paragraphs = cleanContent.split(/\n\n+|\n(?=\w)/);
        
        // Convert each paragraph
        const result = paragraphs
            .map(paragraph => {
                const trimmed = paragraph.trim();
                if (!trimmed) return '';
                
                // Replace remaining single line breaks with <br> for line breaks within paragraphs
                const formatted = trimmed.replace(/\n/g, '<br>');
                return `<p>${formatted}</p>`;
            })
            .filter(p => p) // Remove empty paragraphs
            .join('');
            
        return result || `<p>${cleanContent}</p>`;
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
            this.newsContainer.innerHTML = '<div class="loading">Loading latest news...</div>';
        }
    }
    
    showNoNews() {
        this.newsContainer.innerHTML = `
            <div class="loading">
                <h3>No news yet!</h3>
                <p>Check back soon for the latest updates from the UKSimRacing community.</p>
            </div>
        `;
    }
    
    showError() {
        this.newsContainer.innerHTML = `
            <div class="loading">
                <h3>Unable to load news</h3>
                <p>Please try refreshing the page or check back later.</p>
            </div>
        `;
    }
    
}

// Smooth scrolling for navigation links
class SmoothScroll {
    constructor() {
        this.init();
    }
    
    init() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = anchor.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                
                if (targetElement) {
                    const offsetTop = targetElement.offsetTop - 80; // Account for fixed header
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
}

// Navigation active state handler
class NavigationManager {
    constructor() {
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('section[id]');
        this.init();
    }
    
    init() {
        window.addEventListener('scroll', () => this.updateActiveNav());
    }
    
    updateActiveNav() {
        const scrollPos = window.scrollY + 100;
        
        this.sections.forEach(section => {
            const top = section.offsetTop;
            const bottom = top + section.offsetHeight;
            const id = section.getAttribute('id');
            
            if (scrollPos >= top && scrollPos <= bottom) {
                this.navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
}

// Animated counters for hero stats
class StatsAnimation {
    constructor() {
        this.stats = [
            { element: document.getElementById('memberCount'), target: 2200, suffix: '' },
            { element: document.getElementById('yearsCount'), target: 5, suffix: '' },
            { element: document.getElementById('prizesCount'), target: 7000, suffix: '+', prefix: '£' }
        ];
        this.init();
    }
    
    init() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Load live stats first, then animate
                    this.loadLiveStats().then(() => {
                        this.animateStats();
                    });
                    observer.unobserve(entry.target);
                }
            });
        });
        
        const newsSection = document.getElementById('news');
        if (newsSection) {
            observer.observe(newsSection);
        } else {
            // If no section found, load stats then trigger animation immediately
            this.loadLiveStats().then(() => {
                this.animateStats();
            });
        }
    }
    
    async loadLiveStats() {
        try {
            console.log('📊 Fetching live stats from /api/stats...');
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            console.log('📊 Received stats data:', data);
            
            if (data.memberCount) {
                // Update the target for member count animation and remove suffix
                const memberCountStat = this.stats.find(stat => stat.element && stat.element.id === 'memberCount');
                if (memberCountStat) {
                    console.log(`📊 Updating member count from ${memberCountStat.target} to ${data.memberCount}`);
                    memberCountStat.target = data.memberCount;
                    memberCountStat.suffix = ''; // Remove the + suffix for live data
                    console.log(`📊 Updated member count target to: ${data.memberCount}`);
                }
            } else {
                console.log('📊 No memberCount in response data');
            }
        } catch (error) {
            console.log('📊 Error loading stats:', error);
            console.log('📊 Using default member count (API not available)');
            // If API fails, show 2200+ as fallback
            const memberCountStat = this.stats.find(stat => stat.element && stat.element.id === 'memberCount');
            if (memberCountStat) {
                memberCountStat.suffix = '+';
            }
        }
    }
    
    animateStats() {
        this.stats.forEach(stat => {
            if (!stat.element) return;
            
            const duration = 2000;
            const increment = stat.target / (duration / 16);
            let current = 0;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= stat.target) {
                    current = stat.target;
                    clearInterval(timer);
                }
                const prefix = stat.prefix || '';
                stat.element.textContent = prefix + Math.floor(current) + stat.suffix;
            }, 16);
        });
    }
}

// Community Streams Manager
class CommunityStreamsManager {
    constructor() {
        this.streamsContainer = document.getElementById('communityStreamsContainer');
        this.streamsSection = document.getElementById('community-streams');
        this.loading = false;
        
        this.init();
    }
    
    init() {
        this.loadCommunityStreams();
        // Refresh streams every 5 minutes
        setInterval(() => {
            this.loadCommunityStreams();
        }, 5 * 60 * 1000);
    }
    
    async loadCommunityStreams() {
        if (this.loading) return;
        
        this.loading = true;
        
        try {
            const response = await fetch('/api/twitch/streams');
            const data = await response.json();
            
            if (data.streams && data.streams.length > 0) {
                // Show the section and render streams
                this.streamsSection.style.display = 'block';
                this.renderStreams(data.streams);
                console.log(`🟣 Loaded ${data.streams.length} community streams`);
            } else {
                // Hide the section when no streams
                this.streamsSection.style.display = 'none';
                console.log('🟣 No community streams found');
            }
        } catch (error) {
            console.error('Error loading community streams:', error);
            // Hide section on error
            this.streamsSection.style.display = 'none';
        } finally {
            this.loading = false;
        }
    }
    
    renderStreams(streams) {
        this.streamsContainer.innerHTML = '';
        
        streams.forEach(stream => {
            const streamCard = this.createStreamCard(stream);
            this.streamsContainer.appendChild(streamCard);
        });
    }
    
    createStreamCard(stream) {
        const card = document.createElement('div');
        card.className = 'stream-card';
        
        const viewerCount = this.formatViewerCount(stream.viewer_count);
        const startedTime = this.formatStreamTime(stream.started_at);
        
        card.innerHTML = `
            <div class="stream-thumbnail">
                <img src="${stream.thumbnail_url}" alt="${stream.title}" class="stream-image">
                <div class="stream-live-badge">LIVE</div>
                <div class="stream-viewer-count">${viewerCount} viewers</div>
            </div>
            <div class="stream-content">
                <div class="stream-streamer">
                    ${stream.profile_image_url ? `<img src="${stream.profile_image_url}" alt="${stream.user_name}" class="streamer-avatar">` : ''}
                    <div class="streamer-info">
                        <h4 class="streamer-name">${stream.user_name}</h4>
                        <span class="stream-game">iRacing</span>
                    </div>
                </div>
                <h3 class="stream-title">${stream.title}</h3>
                <div class="stream-meta">
                    <span class="stream-time">Started ${startedTime}</span>
                </div>
            </div>
        `;
        
        // Add click handler to open Twitch stream
        card.addEventListener('click', () => {
            window.open(stream.twitch_url, '_blank');
        });
        
        return card;
    }
    
    formatViewerCount(count) {
        if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
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



// Initialize all components when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM loaded, initializing components...');
    try {
        console.log('📰 Creating NewsManager...');
        window.newsManager = new NewsManager();
        console.log('📰 NewsManager created successfully');
        
        console.log('🔄 Creating SmoothScroll...');
        new SmoothScroll();
        
        console.log('🧭 Creating NavigationManager...');
        new NavigationManager();
        
        console.log('📊 Creating StatsAnimation...');
        new StatsAnimation();
        
        console.log('✅ All components initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing components:', error);
    }
});

// Handle responsive navigation
class ResponsiveNav {
    constructor() {
        this.createMobileMenu();
    }
    
    createMobileMenu() {
        // This would be implemented for mobile hamburger menu
        // For now, the CSS handles basic responsive behavior
    }
}

// Add some visual feedback for loading states
document.addEventListener('DOMContentLoaded', () => {
    // Add loading class to body initially
    document.body.classList.add('loading');
    
    // Remove loading class once everything is loaded
    window.addEventListener('load', () => {
        document.body.classList.remove('loading');
    });
});