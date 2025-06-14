// UKSimRacing Website JavaScript
console.log('🚀 UKSimRacing script loading...');

class NewsManager {
    constructor() {
        this.newsContainer = document.getElementById('newsContainer');
        this.loadMoreBtn = document.getElementById('loadMore');
        this.heroNewsCard = document.getElementById('heroNewsCard');
        this.heroIndicators = document.getElementById('heroIndicators');
        this.currentOffset = 0;
        this.limit = 10; // Load up to 10 cards total
        this.maxCards = 10; // Maximum cards to display
        this.loading = false;
        this.heroNews = [];
        this.currentHeroIndex = 0;
        this.heroInterval = null;
        
        this.init();
    }
    
    init() {
        this.loadNews();
        this.loadMoreBtn.addEventListener('click', () => this.loadMoreNews());
        this.bindHeroControls();
    }
    
    bindHeroControls() {
        const prevBtn = document.getElementById('heroPrevBtn');
        const nextBtn = document.getElementById('heroNextBtn');
        
        prevBtn.addEventListener('click', () => this.previousHero());
        nextBtn.addEventListener('click', () => this.nextHero());
        
        // Pause auto-rotation on hover
        this.heroNewsCard.addEventListener('mouseenter', () => this.pauseHeroRotation());
        this.heroNewsCard.addEventListener('mouseleave', () => this.startHeroRotation());
    }
    
    async loadNews() {
        if (this.loading) return;
        
        this.loading = true;
        this.showLoading();
        
        try {
            // Check for live streams first
            const liveStreamData = await this.checkLiveStream();
            
            // Load all news items up to the maximum
            const response = await fetch(`/api/news?limit=${this.maxCards}&offset=0`);
            const news = await response.json();
            
            // If there's a live stream, it takes priority in hero section
            if (liveStreamData) {
                this.heroNews = [liveStreamData, ...news.slice(0, Math.min(2, news.length))];
            } else {
                // Hero shows the first 3 items for rotation
                this.heroNews = news.slice(0, Math.min(3, news.length));
            }
            
            // More Stories shows up to 6 cards from the remaining news
            const regularNewsStart = liveStreamData ? 2 : 3;
            const regularNews = news.slice(regularNewsStart, regularNewsStart + 6);
            
            // Render hero section
            if (this.heroNews.length > 0) {
                this.renderHeroNews();
                this.startHeroRotation();
            }
            
            // Render regular news
            this.newsContainer.innerHTML = '';
            if (news.length === 0) {
                this.showNoNews();
            } else if (regularNews.length > 0) {
                this.renderNews(regularNews);
                // Hide load more button since we're showing all available news
                this.loadMoreBtn.style.display = 'none';
            } else {
                // If we have hero news but no regular news, show a message
                this.newsContainer.innerHTML = '<div class="loading">More news coming soon...</div>';
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
    
    async checkLiveStream() {
        try {
            const response = await fetch('/api/livestream');
            const data = await response.json();
            
            if (data.liveStream) {
                console.log('🔴 Live stream detected:', data.liveStream.title);
                return {
                    id: `livestream-${data.liveStream.id}`,
                    title: `🔴 LIVE: ${data.liveStream.title}`,
                    content: data.liveStream.description || 'Live streaming now on YouTube!',
                    author: 'UKSimRacing',
                    timestamp: data.liveStream.startTime || new Date().toISOString(),
                    image_url: data.liveStream.thumbnail,
                    isLiveStream: true,
                    youtubeId: data.liveStream.id
                };
            }
            return null;
        } catch (error) {
            console.log('📺 No live stream data available');
            return null;
        }
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
        
        card.innerHTML = `
            ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}" class="news-image">` : ''}
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
        const formattedContent = item.content
            .replace(/\n\s*\n/g, '</p><p>') // Double line breaks become new paragraphs
            .replace(/\n/g, '<br>'); // Single line breaks become <br>
        document.getElementById('modalNewsContent').innerHTML = `<p>${formattedContent}</p>`;
        
        const imageContainer = document.getElementById('modalNewsImage');
        if (item.image_url) {
            imageContainer.innerHTML = `<img src="${item.image_url}" alt="${item.title}" class="news-modal-image">`;
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
    
    // Hero News Methods
    renderHeroNews() {
        if (this.heroNews.length === 0) return;
        
        this.renderCurrentHero();
        this.renderHeroIndicators();
    }
    
    renderCurrentHero() {
        const item = this.heroNews[this.currentHeroIndex];
        if (!item) return;
        
        const formattedDate = this.formatDate(item.timestamp);
        const excerpt = this.createExcerpt(item.content, 400);
        
        // Special handling for live streams
        const liveIndicator = item.isLiveStream ? 
            `<div style="position: absolute; top: 15px; left: 15px; background: red; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-weight: 600; font-size: 0.9rem; z-index: 5;">🔴 LIVE</div>` : 
            '';
        
        this.heroNewsCard.innerHTML = `
            <div class="hero-content">
                <div class="hero-image-content" style="position: relative;">
                    ${liveIndicator}
                    ${item.image_url ? 
                        `<img src="${item.image_url}" alt="${item.title}" class="hero-news-image">` : 
                        `<div class="hero-placeholder">
                            <div style="font-size: 4rem; color: var(--accent-color);">${item.isLiveStream ? '📺' : '📰'}</div>
                            <div style="color: var(--text-secondary); margin-top: 1rem;">${item.isLiveStream ? 'Live Stream' : 'News Article'}</div>
                        </div>`
                    }
                    ${item.isLiveStream ? 
                        `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80px; height: 80px; background: rgba(255, 0, 0, 0.8); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem; pointer-events: none;">▶</div>` : 
                        ''
                    }
                </div>
                <div class="hero-text-content">
                    <h2 class="hero-news-title">${item.title}</h2>
                    <p class="hero-news-excerpt">${excerpt}</p>
                    <div class="hero-news-meta">
                        <span class="hero-news-author">By ${item.author}</span>
                        <span class="hero-news-date">${formattedDate}</span>
                    </div>
                    ${item.isLiveStream ? 
                        `<div style="margin-top: 1.5rem;">
                            <button style="background: red; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 1.1rem;" onclick="window.open('https://www.youtube.com/watch?v=${item.youtubeId}', '_blank')">
                                🔴 Watch Live on YouTube
                            </button>
                        </div>` : 
                        ''
                    }
                </div>
            </div>
        `;
        
        // Add click handler - different for live streams vs regular news
        this.heroNewsCard.style.cursor = 'pointer';
        if (item.isLiveStream) {
            this.heroNewsCard.onclick = () => window.open(`https://www.youtube.com/watch?v=${item.youtubeId}`, '_blank');
        } else {
            this.heroNewsCard.onclick = () => this.showNewsModal(item);
        }
    }
    
    renderHeroIndicators() {
        this.heroIndicators.innerHTML = this.heroNews.map((_, index) => 
            `<div class="hero-indicator ${index === this.currentHeroIndex ? 'active' : ''}" 
                  onclick="newsManager.goToHero(${index})"></div>`
        ).join('');
    }
    
    goToHero(index) {
        if (index >= 0 && index < this.heroNews.length) {
            this.currentHeroIndex = index;
            this.renderCurrentHero();
            this.renderHeroIndicators();
            this.resetHeroRotation();
        }
    }
    
    nextHero() {
        this.currentHeroIndex = (this.currentHeroIndex + 1) % this.heroNews.length;
        this.renderCurrentHero();
        this.renderHeroIndicators();
        this.resetHeroRotation();
    }
    
    previousHero() {
        this.currentHeroIndex = (this.currentHeroIndex - 1 + this.heroNews.length) % this.heroNews.length;
        this.renderCurrentHero();
        this.renderHeroIndicators();
        this.resetHeroRotation();
    }
    
    startHeroRotation() {
        if (this.heroNews.length <= 1) return;
        
        this.heroInterval = setInterval(() => {
            this.nextHero();
        }, 30000); // Rotate every 30 seconds
    }
    
    pauseHeroRotation() {
        if (this.heroInterval) {
            clearInterval(this.heroInterval);
            this.heroInterval = null;
        }
    }
    
    resetHeroRotation() {
        this.pauseHeroRotation();
        this.startHeroRotation();
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
            { element: document.getElementById('memberCount'), target: 2200, suffix: '+' },
            { element: document.getElementById('yearsCount'), target: 5, suffix: '' }
        ];
        this.init();
        this.loadLiveStats();
    }
    
    init() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animateStats();
                    observer.unobserve(entry.target);
                }
            });
        });
        
        const heroSection = document.getElementById('hero');
        if (heroSection) {
            observer.observe(heroSection);
        }
    }
    
    async loadLiveStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            if (data.memberCount) {
                // Update the target for member count animation
                const memberCountStat = this.stats.find(stat => stat.element && stat.element.id === 'memberCount');
                if (memberCountStat) {
                    memberCountStat.target = data.memberCount;
                    console.log(`📊 Updated member count target to: ${data.memberCount}`);
                }
            }
        } catch (error) {
            console.log('📊 Using default member count (API not available)');
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
                stat.element.textContent = Math.floor(current) + stat.suffix;
            }, 16);
        });
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