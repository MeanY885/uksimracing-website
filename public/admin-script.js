// Admin Manager Class for separate admin page
class AdminManager {
    constructor() {
        this.authToken = localStorage.getItem('adminToken');
        this.userRole = localStorage.getItem('adminRole');
        this.username = localStorage.getItem('adminUsername');
        this.editMode = false;
        this.draggedElement = null;
        this.currentTab = 'news';
        this.init();
    }
    
    init() {
        this.bindLoginEvents();
        this.bindTabEvents();
        this.createEditModal();
        
        if (this.authToken) {
            this.showAdminPanel();
        }
    }
    
    bindLoginEvents() {
        const loginBtn = document.getElementById('loginBtn');
        const passwordInput = document.getElementById('adminPassword');
        const usernameInput = document.getElementById('adminUsername');
        
        loginBtn.addEventListener('click', () => this.login());
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }
    
    bindTabEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName + 'Tab').classList.add('active');
        
        this.currentTab = tabName;
        
        // Load content for specific tabs
        if (tabName === 'users' && this.userRole === 'master') {
            this.loadUsers();
        } else if (tabName === 'videos') {
            this.loadVideos();
        } else if (tabName === 'partners') {
            this.loadPartners();
        } else if (tabName === 'leagues') {
            this.loadLeagues();
        } else if (tabName === 'discord') {
            this.loadDiscordManagement();
        }
    }
    
    async login() {
        const password = document.getElementById('adminPassword').value;
        const username = document.getElementById('adminUsername').value;
        const errorDiv = document.getElementById('loginError');
        
        const payload = { password };
        if (username.trim()) {
            payload.username = username.trim();
        }
        
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.authToken = data.token;
                this.userRole = data.role;
                this.username = data.username;
                
                localStorage.setItem('adminToken', this.authToken);
                localStorage.setItem('adminRole', this.userRole);
                localStorage.setItem('adminUsername', this.username);
                
                this.showAdminPanel();
                errorDiv.textContent = '';
            } else {
                errorDiv.textContent = data.error || 'Invalid credentials';
            }
        } catch (error) {
            errorDiv.textContent = 'Login failed';
        }
    }
    
    showAdminPanel() {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        
        // Update welcome message
        document.getElementById('adminWelcome').textContent = this.username || 'Admin';
        
        // Show user management tab only for master admin
        if (this.userRole === 'master') {
            document.getElementById('usersTabBtn').style.display = 'block';
        }
        
        this.bindAdminEvents();
        this.bindLogoutEvents();
        this.loadAdminNews();
    }
    
    bindAdminEvents() {
        // Always enable edit mode for news since user is already authenticated
        this.editMode = true;
        
        // News management events
        const createNewsBtn = document.getElementById('createNewsBtn');
        if (createNewsBtn) {
            createNewsBtn.addEventListener('click', () => this.createNews());
        }
        
        // User management events
        if (this.userRole === 'master') {
            const createUserBtn = document.getElementById('createUserBtn');
            const changePasswordBtn = document.getElementById('changePasswordBtn');
            
            createUserBtn.addEventListener('click', () => this.createUser());
            changePasswordBtn.addEventListener('click', () => this.changePassword());
        }
    }
    
    bindLogoutEvents() {
        const logoutBtn = document.getElementById('logoutBtn');
        logoutBtn.addEventListener('click', () => this.logout());
    }
    
    logout() {
        // Clear stored authentication data
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminRole');
        localStorage.removeItem('adminUsername');
        
        // Reset instance variables
        this.authToken = null;
        this.userRole = null;
        this.username = null;
        
        // Hide admin panel and show login form
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('adminLogin').style.display = 'block';
        
        // Clear login form
        document.getElementById('adminUsername').value = '';
        document.getElementById('adminPassword').value = '';
        document.getElementById('loginError').textContent = '';
        
        // Reset to news tab
        this.switchTab('news');
    }
    
    
    async loadAdminNews() {
        try {
            const response = await fetch('/api/news?limit=50');
            const news = await response.json();
            this.renderAdminNews(news);
        } catch (error) {
            console.error('Error loading admin news:', error);
        }
    }
    
    renderAdminNews(newsItems) {
        const container = document.getElementById('adminNewsContainer');
        container.innerHTML = '';
        
        newsItems.forEach(item => {
            const card = this.createAdminNewsCard(item);
            container.appendChild(card);
        });
    }
    
    createAdminNewsCard(item) {
        const card = document.createElement('div');
        card.className = 'admin-news-card';
        card.dataset.id = item.id;
        
        const formattedDate = this.formatDate(item.timestamp);
        const excerpt = this.createExcerpt(item.content, 100);
        
        card.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div class="admin-card-controls">
                <button class="admin-btn edit" onclick="adminManager.editNews(${item.id})">Edit</button>
                <button class="admin-btn delete" onclick="adminManager.deleteNews(${item.id})">Delete</button>
            </div>
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
        
        // Always enable edit mode since user is authenticated
        card.classList.add('edit-mode');
        this.addDragListeners(card);
        
        return card;
    }
    
    addDragListeners(card) {
        card.draggable = true;
        
        card.addEventListener('dragstart', (e) => {
            this.draggedElement = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', card.outerHTML);
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            this.draggedElement = null;
        });
        
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (this.draggedElement && this.draggedElement !== card) {
                const rect = card.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const clientY = e.clientY;
                
                // Remove all drag-over classes first
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                
                // Add appropriate drag-over class based on position
                if (clientY < midY) {
                    card.classList.add('drag-over-top');
                } else {
                    card.classList.add('drag-over-bottom');
                }
            }
        });
        
        card.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });
        
        card.addEventListener('dragleave', (e) => {
            // Only remove if we're actually leaving the card completely
            const rect = card.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                card.classList.remove('drag-over-top', 'drag-over-bottom');
            }
        });
        
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over-top', 'drag-over-bottom');
            
            if (this.draggedElement && this.draggedElement !== card) {
                const rect = card.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const clientY = e.clientY;
                const insertBefore = clientY < midY;
                
                this.reorderNews(this.draggedElement, card, insertBefore);
            }
        });
    }
    
    removeDragListeners(card) {
        card.draggable = false;
        // Remove all event listeners by cloning the element
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
    }
    
    async reorderNews(draggedCard, targetCard, insertBefore) {
        const container = document.getElementById('adminNewsContainer');
        
        // Reorder in DOM based on drop position
        if (insertBefore) {
            targetCard.parentNode.insertBefore(draggedCard, targetCard);
        } else {
            targetCard.parentNode.insertBefore(draggedCard, targetCard.nextSibling);
        }
        
        // Get new order
        const newCards = Array.from(container.children);
        const newsIds = newCards.map(card => parseInt(card.dataset.id));
        
        // Send to server
        try {
            await fetch('/api/news/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ newsIds })
            });
        } catch (error) {
            console.error('Error reordering news:', error);
            // Revert on error
            this.loadAdminNews();
        }
    }
    
    async deleteNews(id) {
        if (!confirm('Are you sure you want to delete this news article?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/news/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                this.loadAdminNews();
            } else {
                alert('Failed to delete news article');
            }
        } catch (error) {
            console.error('Error deleting news:', error);
            alert('Failed to delete news article');
        }
    }
    
    editNews(id) {
        // Find the news item
        fetch(`/api/news?limit=50`)
            .then(response => response.json())
            .then(news => {
                const item = news.find(n => n.id === id);
                if (item) {
                    this.showEditModal(item);
                }
            });
    }
    
    createNews() {
        // Show modal for creating new news
        this.showEditModal({
            id: null,
            title: '',
            content: '',
            author: this.username || 'Admin',
            image_url: ''
        }, true);
    }
    
    showEditModal(item, isCreate = false) {
        const modal = document.getElementById('editModal');
        
        // Update modal title and button text based on mode
        const modalTitle = modal.querySelector('h3');
        const submitBtn = modal.querySelector('button[type="submit"]');
        
        if (isCreate) {
            modalTitle.textContent = 'Create New News Article';
            submitBtn.textContent = 'Create Article';
        } else {
            modalTitle.textContent = 'Edit News Article';
            submitBtn.textContent = 'Save Changes';
        }
        
        // Populate form
        document.getElementById('editId').value = item.id || '';
        document.getElementById('editTitle').value = item.title;
        document.getElementById('editContent').value = item.content;
        document.getElementById('editAuthor').value = item.author;
        document.getElementById('editImageUrl').value = item.image_url || '';
        
        // Store create mode on modal for form submission
        modal.dataset.isCreate = isCreate;
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    
    createEditModal() {
        const modal = document.createElement('div');
        modal.id = 'editModal';
        modal.className = 'edit-modal';
        modal.innerHTML = `
            <div class="edit-modal-content">
                <span class="edit-modal-close">&times;</span>
                <h3>Edit News Article</h3>
                <form class="edit-form" id="editForm">
                    <input type="hidden" id="editId">
                    
                    <label for="editTitle">Title:</label>
                    <input type="text" id="editTitle" required>
                    
                    <label for="editContent">Content:</label>
                    <textarea id="editContent" required></textarea>
                    
                    <label for="editAuthor">Author:</label>
                    <input type="text" id="editAuthor" required>
                    
                    <label for="editImageUrl">Image URL:</label>
                    <input type="url" id="editImageUrl">
                    
                    <label for="editImageFile">Or Upload Image:</label>
                    <input type="file" id="editImageFile" accept="image/*" class="file-input">
                    <div id="imagePreview" class="image-preview"></div>
                    
                    <div class="edit-form-buttons">
                        <button type="button" class="btn" onclick="adminManager.closeEditModal()">Cancel</button>
                        <button type="submit" class="btn btn-outline">Save Changes</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Close modal events
        modal.querySelector('.edit-modal-close').addEventListener('click', () => this.closeEditModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeEditModal();
        });
        
        // Form submit
        document.getElementById('editForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewsEdit();
        });
        
        // File input change event
        document.getElementById('editImageFile').addEventListener('change', (e) => {
            this.handleImageFileSelect(e);
        });
        
        // Clear file input when URL is entered
        document.getElementById('editImageUrl').addEventListener('input', () => {
            const fileInput = document.getElementById('editImageFile');
            const imagePreview = document.getElementById('imagePreview');
            fileInput.value = '';
            imagePreview.innerHTML = '';
        });
    }
    
    handleImageFileSelect(event) {
        const file = event.target.files[0];
        const imagePreview = document.getElementById('imagePreview');
        const imageUrlInput = document.getElementById('editImageUrl');
        
        if (file) {
            // Clear URL input when file is selected
            imageUrlInput.value = '';
            
            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.innerHTML = `
                    <div class="preview-container">
                        <img src="${e.target.result}" alt="Preview" class="preview-image">
                        <span class="preview-filename">${file.name}</span>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.innerHTML = '';
        }
    }
    
    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Clear file input and preview
        const fileInput = document.getElementById('editImageFile');
        const imagePreview = document.getElementById('imagePreview');
        if (fileInput) fileInput.value = '';
        if (imagePreview) imagePreview.innerHTML = '';
    }
    
    async saveNewsEdit() {
        const modal = document.getElementById('editModal');
        const isCreate = modal.dataset.isCreate === 'true';
        
        const id = document.getElementById('editId').value;
        const title = document.getElementById('editTitle').value;
        const content = document.getElementById('editContent').value;
        const author = document.getElementById('editAuthor').value;
        const image_url = document.getElementById('editImageUrl').value;
        const imageFile = document.getElementById('editImageFile').files[0];
        
        if (!title.trim() || !content.trim() || !author.trim()) {
            alert('Please fill in all required fields (Title, Content, Author)');
            return;
        }
        
        try {
            let finalImageUrl = image_url;
            
            // If file is selected, upload it first
            if (imageFile) {
                const formData = new FormData();
                formData.append('image', imageFile);
                
                const uploadResponse = await fetch('/api/news/upload-image', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    },
                    body: formData
                });
                
                if (uploadResponse.ok) {
                    const uploadResult = await uploadResponse.json();
                    finalImageUrl = uploadResult.imagePath;
                } else {
                    alert('Failed to upload image');
                    return;
                }
            }
            
            let response;
            
            if (isCreate) {
                // Create new news article
                response = await fetch('/api/news', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.authToken}`
                    },
                    body: JSON.stringify({ title, content, author, image_url: finalImageUrl })
                });
            } else {
                // Update existing news article
                response = await fetch(`/api/news/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.authToken}`
                    },
                    body: JSON.stringify({ title, content, author, image_url: finalImageUrl })
                });
            }
            
            if (response.ok) {
                this.closeEditModal();
                this.loadAdminNews();
                const action = isCreate ? 'created' : 'updated';
                console.log(`News article ${action} successfully`);
            } else {
                const errorText = await response.text();
                alert(`Failed to ${isCreate ? 'create' : 'save'} article: ${errorText}`);
            }
        } catch (error) {
            console.error('Error saving news:', error);
            alert(`Failed to ${isCreate ? 'create' : 'save'} article`);
        }
    }
    
    createExcerpt(content, maxLength) {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength).trim() + '...';
    }
    
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }
    
    // User Management Methods
    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                const users = await response.json();
                this.renderUsers(users);
            } else {
                console.error('Failed to load users');
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    renderUsers(users) {
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = '<div class="loading">No users found</div>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-name">${user.username}</div>
                    <div class="user-role">${user.role}</div>
                </div>
                <div class="user-created">Created: ${this.formatDate(user.created_at)}</div>
                <div class="user-login">Last Login: ${user.last_login ? this.formatDate(user.last_login) : 'Never'}</div>
                <div class="user-created">By: ${user.created_by}</div>
                <div class="user-actions">
                    <button class="user-delete-btn" 
                            onclick="adminManager.deleteUser(${user.id}, '${user.username}')"
                            ${user.role === 'master' ? 'disabled' : ''}>
                        ${user.role === 'master' ? 'Protected' : 'Delete'}
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    async createUser() {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newUserRole').value;
        const errorDiv = document.getElementById('createUserError');
        
        if (!username || !password || !role) {
            errorDiv.textContent = 'All fields are required';
            return;
        }
        
        if (password.length < 6) {
            errorDiv.textContent = 'Password must be at least 6 characters';
            return;
        }
        
        try {
            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ username, password, role })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Clear form
                document.getElementById('newUsername').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('newUserRole').value = 'admin';
                errorDiv.textContent = '';
                
                // Reload users list
                this.loadUsers();
                
                alert(`User "${username}" created successfully!`);
            } else {
                errorDiv.textContent = data.error || 'Failed to create user';
            }
        } catch (error) {
            errorDiv.textContent = 'Error creating user';
        }
    }
    
    async deleteUser(userId, username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                this.loadUsers();
                alert(`User "${username}" deleted successfully!`);
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete user');
            }
        } catch (error) {
            alert('Error deleting user');
        }
    }
    
    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPasswordChange').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorDiv = document.getElementById('changePasswordError');
        const successDiv = document.getElementById('changePasswordSuccess');
        
        // Clear previous messages
        errorDiv.textContent = '';
        successDiv.textContent = '';
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            errorDiv.textContent = 'All fields are required';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match';
            return;
        }
        
        if (newPassword.length < 6) {
            errorDiv.textContent = 'New password must be at least 6 characters';
            return;
        }
        
        try {
            const response = await fetch('/api/admin/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Clear form
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPasswordChange').value = '';
                document.getElementById('confirmPassword').value = '';
                
                successDiv.textContent = 'Password changed successfully!';
            } else {
                errorDiv.textContent = data.error || 'Failed to change password';
            }
        } catch (error) {
            errorDiv.textContent = 'Error changing password';
        }
    }
    
    // Video Management Methods
    async loadVideos() {
        const container = document.getElementById('adminVideosContainer');
        container.innerHTML = '<div class="loading">Loading videos...</div>';
        
        try {
            const response = await fetch('/api/videos?limit=100', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            const videos = await response.json();
            
            this.renderAdminVideos(videos);
            this.bindVideoAdminEvents();
        } catch (error) {
            console.error('Error loading videos:', error);
            container.innerHTML = '<div class="loading">Error loading videos</div>';
        }
    }
    
    renderAdminVideos(videos) {
        const container = document.getElementById('adminVideosContainer');
        
        if (videos.length === 0) {
            container.innerHTML = '<div class="loading">No videos found</div>';
            return;
        }
        
        container.innerHTML = videos.map(video => this.createAdminVideoCard(video)).join('');
    }
    
    createAdminVideoCard(video) {
        const formattedDate = this.formatDate(video.created_at);
        const videoTitle = video.title || 'Untitled';
        const duration = this.formatDuration(video.duration);
        const viewCount = video.view_count || 0;
        
        return `
            <div class="video-card admin-video-card" data-video-id="${video.id}">
                <div class="video-thumbnail">
                    ${video.thumbnail_url ? 
                        `<img src="${video.thumbnail_url}" alt="${videoTitle}" loading="lazy">` : 
                        '<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: var(--hover-bg); color: var(--text-secondary);">No Thumbnail</div>'
                    }
                    ${duration ? `<div class="video-duration">${duration}</div>` : ''}
                    <div class="video-card-controls" style="display: none;">
                        <button class="admin-btn edit" onclick="adminManager.editVideo(${video.id})">Edit</button>
                        <button class="admin-btn delete" onclick="adminManager.deleteVideo(${video.id})">Delete</button>
                    </div>
                    <div class="video-drag-handle" style="display: none;">⋮⋮</div>
                </div>
                <div class="video-info">
                    <div class="video-title">${videoTitle}</div>
                    <div class="video-description">${video.description ? video.description.substring(0, 100) + (video.description.length > 100 ? '...' : '') : 'No description'}</div>
                    <div class="video-meta">
                        <span class="video-views">${viewCount} views</span>
                        <span class="video-date">${formattedDate}</span>
                    </div>
                    ${video.youtube_id ? 
                        `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
                            YouTube ID: ${video.youtube_id}
                        </div>` : ''
                    }
                </div>
            </div>
        `;
    }
    
    bindVideoAdminEvents() {
        const syncBtn = document.getElementById('adminSyncYouTubeBtn');
        const addBtn = document.getElementById('adminAddVideoBtn');
        
        if (syncBtn) {
            syncBtn.replaceWith(syncBtn.cloneNode(true));
            document.getElementById('adminSyncYouTubeBtn').addEventListener('click', () => this.syncYouTube());
        }
        
        if (addBtn) {
            addBtn.replaceWith(addBtn.cloneNode(true));
            document.getElementById('adminAddVideoBtn').addEventListener('click', () => this.addVideo());
        }
        
        // Always enable video edit mode since user is authenticated
        this.enableVideoEditMode();
    }
    
    
    enableVideoEditMode() {
        const videoCards = document.querySelectorAll('.admin-video-card');
        videoCards.forEach(card => {
            card.classList.add('edit-mode');
            const controls = card.querySelector('.video-card-controls');
            const dragHandle = card.querySelector('.video-drag-handle');
            if (controls) controls.style.display = 'flex';
            if (dragHandle) dragHandle.style.display = 'block';
        });
    }
    
    disableVideoEditMode() {
        const videoCards = document.querySelectorAll('.admin-video-card');
        videoCards.forEach(card => {
            card.classList.remove('edit-mode');
            const controls = card.querySelector('.video-card-controls');
            const dragHandle = card.querySelector('.video-drag-handle');
            if (controls) controls.style.display = 'none';
            if (dragHandle) dragHandle.style.display = 'none';
        });
    }
    
    async syncYouTube() {
        if (!confirm('This will sync videos from the UKSimRacing YouTube channel. Continue?')) {
            return;
        }
        
        const syncBtn = document.getElementById('adminSyncYouTubeBtn');
        const originalText = syncBtn.textContent;
        syncBtn.textContent = 'Syncing...';
        syncBtn.disabled = true;
        
        try {
            const response = await fetch('/api/sync-youtube', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert(`Success: ${data.message}`);
                this.loadVideos(); // Reload videos
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error syncing YouTube:', error);
            alert('Error syncing YouTube videos');
        } finally {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }
    
    async editVideo(videoId) {
        try {
            // Fetch video details
            const response = await fetch('/api/videos', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            const videos = await response.json();
            const video = videos.find(v => v.id === videoId);
            
            if (!video) {
                alert('Video not found');
                return;
            }
            
            // Show edit modal
            this.showVideoEditModal(video);
        } catch (error) {
            console.error('Error loading video for edit:', error);
            alert('Error loading video details');
        }
    }
    
    showVideoEditModal(video) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('videoEditModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'videoEditModal';
            modal.className = 'edit-modal';
            modal.innerHTML = `
                <div class="edit-modal-content">
                    <span class="edit-modal-close">&times;</span>
                    <h3>Edit Video</h3>
                    <form class="edit-form" id="videoEditForm">
                        <label for="videoEditTitle">Title:</label>
                        <input type="text" id="videoEditTitle" required>
                        
                        <label for="videoEditDescription">Description:</label>
                        <textarea id="videoEditDescription" rows="5"></textarea>
                        
                        <label for="videoEditYouTubeId">YouTube ID:</label>
                        <input type="text" id="videoEditYouTubeId" readonly>
                        
                        <label for="videoEditDuration">Duration (seconds):</label>
                        <input type="number" id="videoEditDuration">
                        
                        <div class="edit-form-buttons">
                            <button type="button" class="btn btn-outline" onclick="adminManager.closeVideoEditModal()">Cancel</button>
                            <button type="submit" class="btn btn-outline">Save Changes</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add close handlers
            modal.querySelector('.edit-modal-close').addEventListener('click', () => this.closeVideoEditModal());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeVideoEditModal();
            });
        }
        
        // Populate form
        document.getElementById('videoEditTitle').value = video.title || '';
        document.getElementById('videoEditDescription').value = video.description || '';
        document.getElementById('videoEditYouTubeId').value = video.youtube_id || '';
        document.getElementById('videoEditDuration').value = video.duration || '';
        
        // Handle form submission
        const form = document.getElementById('videoEditForm');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.saveVideoChanges(video.id);
        };
        
        modal.style.display = 'block';
    }
    
    closeVideoEditModal() {
        const modal = document.getElementById('videoEditModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    async saveVideoChanges(videoId) {
        const title = document.getElementById('videoEditTitle').value;
        const description = document.getElementById('videoEditDescription').value;
        const duration = document.getElementById('videoEditDuration').value;
        
        try {
            const response = await fetch(`/api/videos/${videoId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    title,
                    description,
                    duration: duration ? parseInt(duration) : null
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.closeVideoEditModal();
                this.loadVideos(); // Reload videos
                alert('Video updated successfully!');
            } else {
                alert(data.error || 'Failed to update video');
            }
        } catch (error) {
            console.error('Error updating video:', error);
            alert('Error updating video');
        }
    }
    
    async deleteVideo(videoId) {
        if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/videos/${videoId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadVideos(); // Reload videos
                alert('Video deleted successfully!');
            } else {
                alert(data.error || 'Failed to delete video');
            }
        } catch (error) {
            console.error('Error deleting video:', error);
            alert('Error deleting video');
        }
    }
    
    addVideo() {
        alert('Add Video functionality would open a form to manually add videos. For now, use the Sync YouTube button to import videos from your channel.');
    }
    
    formatDuration(seconds) {
        if (!seconds) return '';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // Partners Management Functions
    async loadPartners() {
        const container = document.getElementById('adminPartnersContainer');
        container.innerHTML = '<div class="loading">Loading partners...</div>';
        
        try {
            const response = await fetch('/api/partners', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            const partners = await response.json();
            
            this.renderAdminPartners(partners);
            this.bindPartnerAdminEvents();
        } catch (error) {
            console.error('Error loading partners:', error);
            container.innerHTML = '<div class="loading">Error loading partners</div>';
        }
    }
    
    renderAdminPartners(partners) {
        const container = document.getElementById('adminPartnersContainer');
        
        if (partners.length === 0) {
            container.innerHTML = '<div class="loading">No partners yet. Add your first partner!</div>';
            return;
        }
        
        container.innerHTML = partners.map(partner => `
            <div class="partner-card admin-partner-card" data-partner-id="${partner.id}">
                <div class="partner-header">
                    ${partner.logo_path ? `<img src="${partner.logo_path}" alt="${partner.name}" class="partner-logo-admin">` : ''}
                    <div class="partner-info">
                        <h3>${partner.name}</h3>
                        <span class="partner-badge ${partner.is_featured ? 'featured' : ''}">${partner.partner_type || 'Partner'}</span>
                    </div>
                </div>
                <div class="partner-content">
                    <div class="partner-url">
                        <strong>URL:</strong> <a href="${partner.url}" target="_blank" rel="noopener noreferrer">${partner.url}</a>
                    </div>
                </div>
                <div class="admin-controls-inline">
                    <button class="btn-small btn-edit" onclick="adminManager.editPartner(${partner.id})">Edit</button>
                    <button class="btn-small btn-delete" onclick="adminManager.deletePartner(${partner.id})">Delete</button>
                    <span class="status-badge ${partner.is_active ? 'active' : 'inactive'}">${partner.is_active ? 'Active' : 'Inactive'}</span>
                </div>
            </div>
        `).join('');
    }
    
    bindPartnerAdminEvents() {
        const addPartnerBtn = document.getElementById('adminAddPartnerBtn');
        if (addPartnerBtn) {
            addPartnerBtn.onclick = () => this.showAddPartnerModal();
        }
    }
    
    showAddPartnerModal() {
        const modal = document.createElement('div');
        modal.className = 'admin-modal';
        modal.innerHTML = `
            <div class="admin-modal-content">
                <h3>Add New Partner</h3>
                <form id="addPartnerForm" class="admin-form">
                    <label for="partnerName">Partner Name:</label>
                    <input type="text" id="partnerName" placeholder="Enter partner name" required>
                    
                    <label for="partnerLogo">Partner Logo:</label>
                    <input type="file" id="partnerLogo" accept="image/*" class="file-input">
                    <small class="form-help">Upload partner logo (JPG, PNG, GIF)</small>
                    
                    <label for="partnerUrl">Partner URL:</label>
                    <input type="url" id="partnerUrl" placeholder="https://partner-website.com" required>
                    
                    <div class="form-buttons">
                        <button type="button" class="btn btn-outline" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                        <button type="submit" class="btn">Add Partner</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('addPartnerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addPartner();
            modal.remove();
        });
    }
    
    async addPartner() {
        const name = document.getElementById('partnerName').value;
        const url = document.getElementById('partnerUrl').value;
        const logoFile = document.getElementById('partnerLogo').files[0];
        
        if (!name || !url) {
            alert('Partner name and URL are required');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('url', url);
            
            if (logoFile) {
                formData.append('logo', logoFile);
            }
            
            const response = await fetch('/api/partners', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadPartners();
                alert('Partner added successfully!');
            } else {
                alert(data.error || 'Failed to add partner');
            }
        } catch (error) {
            console.error('Error adding partner:', error);
            alert('Error adding partner');
        }
    }
    
    async editPartner(partnerId) {
        try {
            // Fetch partner details
            const response = await fetch('/api/partners');
            const partners = await response.json();
            const partner = partners.find(p => p.id === partnerId);
            
            if (!partner) {
                alert('Partner not found');
                return;
            }
            
            const modal = document.createElement('div');
            modal.className = 'admin-modal';
            modal.innerHTML = `
                <div class="admin-modal-content">
                    <h3>Edit Partner</h3>
                    <form id="editPartnerForm" class="admin-form">
                        <input type="text" id="editPartnerName" placeholder="Partner Name" value="${partner.name}" required>
                        <input type="text" id="editPartnerType" placeholder="Partner Type" value="${partner.partner_type}">
                        <input type="url" id="editPartnerUrl" placeholder="Partner URL" value="${partner.url}" required>
                        <textarea id="editPartnerDescription" placeholder="Partner Description" rows="4" required>${partner.description}</textarea>
                        <textarea id="editPartnerBenefits" placeholder="Benefits (one per line)" rows="4">${partner.benefits || ''}</textarea>
                        <textarea id="editPartnerInstructions" placeholder="Instructions for supporting UKSR" rows="3">${partner.instructions || ''}</textarea>
                        <label class="checkbox-label">
                            <input type="checkbox" id="editPartnerFeatured" ${partner.is_featured ? 'checked' : ''}> Featured Partner
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="editPartnerActive" ${partner.is_active ? 'checked' : ''}> Active
                        </label>
                        <div class="form-buttons">
                            <button type="button" class="btn btn-outline" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                            <button type="submit" class="btn">Update Partner</button>
                        </div>
                    </form>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            document.getElementById('editPartnerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.updatePartner(partnerId);
                modal.remove();
            });
        } catch (error) {
            console.error('Error loading partner:', error);
            alert('Error loading partner details');
        }
    }
    
    async updatePartner(partnerId) {
        const partnerData = {
            name: document.getElementById('editPartnerName').value,
            partner_type: document.getElementById('editPartnerType').value,
            url: document.getElementById('editPartnerUrl').value,
            description: document.getElementById('editPartnerDescription').value,
            benefits: document.getElementById('editPartnerBenefits').value,
            instructions: document.getElementById('editPartnerInstructions').value,
            is_featured: document.getElementById('editPartnerFeatured').checked,
            is_active: document.getElementById('editPartnerActive').checked
        };
        
        try {
            const response = await fetch(`/api/partners/${partnerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(partnerData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadPartners(); // Reload partners
                alert('Partner updated successfully!');
            } else {
                alert(data.error || 'Failed to update partner');
            }
        } catch (error) {
            console.error('Error updating partner:', error);
            alert('Error updating partner');
        }
    }
    
    async deletePartner(partnerId) {
        if (!confirm('Are you sure you want to delete this partner? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/partners/${partnerId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadPartners(); // Reload partners
                alert('Partner deleted successfully!');
            } else {
                alert(data.error || 'Failed to delete partner');
            }
        } catch (error) {
            console.error('Error deleting partner:', error);
            alert('Error deleting partner');
        }
    }

    // Leagues Management Functions
    async loadLeagues() {
        const container = document.getElementById('adminLeaguesContainer');
        container.innerHTML = '<div class="loading">Loading leagues...</div>';
        
        try {
            const response = await fetch('/api/leagues', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            const leagues = await response.json();
            
            this.renderAdminLeagues(leagues);
            this.bindLeagueAdminEvents();
        } catch (error) {
            console.error('Error loading leagues:', error);
            container.innerHTML = '<div class="loading">Error loading leagues</div>';
        }
    }
    
    renderAdminLeagues(leagues) {
        const container = document.getElementById('adminLeaguesContainer');
        
        if (leagues.length === 0) {
            container.innerHTML = '<div class="loading">No leagues yet. Create your first league!</div>';
            return;
        }
        
        container.innerHTML = leagues.map(league => `
            <div class="league-card admin-league-card" data-league-id="${league.id}">
                <div class="league-header">
                    ${league.image_path ? `<img src="${league.image_path}" alt="${league.name}" class="league-image-admin">` : ''}
                    <div class="league-info">
                        <h3>${league.name}</h3>
                        <span class="registration-status ${league.registration_status}">${this.getStatusLabel(league.registration_status)}</span>
                    </div>
                </div>
                <div class="league-content">
                    <p>${league.information.substring(0, 100)}${league.information.length > 100 ? '...' : ''}</p>
                    <div class="league-links">
                        ${league.handbook_url ? `<a href="${league.handbook_url}" target="_blank" rel="noopener noreferrer">Handbook</a>` : ''}
                        ${league.standings_url ? `<a href="${league.standings_url}" target="_blank" rel="noopener noreferrer">Standings</a>` : ''}
                        ${league.registration_url ? `<a href="${league.registration_url}" target="_blank" rel="noopener noreferrer">Registration</a>` : ''}
                    </div>
                </div>
                <div class="admin-controls-inline">
                    <button class="btn-small btn-edit" onclick="adminManager.editLeague(${league.id})">Edit</button>
                    <button class="btn-small btn-archive" onclick="adminManager.archiveLeague(${league.id})">${league.is_archived ? 'Unarchive' : 'Archive'}</button>
                    <button class="btn-small btn-delete" onclick="adminManager.deleteLeague(${league.id})">Delete</button>
                    <span class="status-badge ${league.is_active ? 'active' : 'inactive'}">${league.is_active ? 'Active' : 'Inactive'}</span>
                </div>
            </div>
        `).join('');
    }
    
    getStatusLabel(status) {
        switch(status) {
            case 'active': return 'Active / Signups Open!';
            case 'reserve': return 'Reserve List';
            case 'closed': return 'Full/Signups Closed';
            default: return 'Unknown';
        }
    }
    
    bindLeagueAdminEvents() {
        const addLeagueBtn = document.getElementById('adminAddLeagueBtn');
        if (addLeagueBtn) {
            addLeagueBtn.onclick = () => this.showAddLeagueModal();
        }
    }
    
    showAddLeagueModal() {
        const modal = document.createElement('div');
        modal.className = 'admin-modal';
        modal.innerHTML = `
            <div class="admin-modal-content">
                <h3>Create New League</h3>
                <form id="addLeagueForm" class="admin-form">
                    <label for="leagueName">League Name:</label>
                    <input type="text" id="leagueName" placeholder="Enter league name" required>
                    
                    <label for="leagueImage">League Image:</label>
                    <input type="file" id="leagueImage" accept="image/*" class="file-input">
                    <small class="form-help">Upload league image (JPG, PNG, GIF)</small>
                    
                    <label for="leagueInformation">League Information:</label>
                    <textarea id="leagueInformation" placeholder="Enter detailed league information..." rows="8" required></textarea>
                    
                    <label for="leagueHandbook">League Handbook (URL):</label>
                    <input type="url" id="leagueHandbook" placeholder="https://handbook-url.com">
                    
                    <label for="leagueStandings">League Standings (URL):</label>
                    <input type="url" id="leagueStandings" placeholder="https://standings-url.com">
                    
                    <label for="registrationStatus">Registration Status:</label>
                    <select id="registrationStatus" required>
                        <option value="active">Active / Signups Open!</option>
                        <option value="reserve">Reserve List</option>
                        <option value="closed">Full/Signups Closed</option>
                    </select>
                    
                    <label for="registrationUrl">Registration URL (for Active/Reserve):</label>
                    <input type="url" id="registrationUrl" placeholder="https://registration-url.com">
                    
                    <div class="form-buttons">
                        <button type="button" class="btn btn-outline" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                        <button type="submit" class="btn">Create League</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('addLeagueForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.addLeague();
            modal.remove();
        });
    }
    
    async addLeague() {
        const name = document.getElementById('leagueName').value;
        const information = document.getElementById('leagueInformation').value;
        const handbookUrl = document.getElementById('leagueHandbook').value;
        const standingsUrl = document.getElementById('leagueStandings').value;
        const registrationStatus = document.getElementById('registrationStatus').value;
        const registrationUrl = document.getElementById('registrationUrl').value;
        const imageFile = document.getElementById('leagueImage').files[0];
        
        if (!name || !information) {
            alert('League name and information are required');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('information', information);
            formData.append('handbook_url', handbookUrl);
            formData.append('standings_url', standingsUrl);
            formData.append('registration_status', registrationStatus);
            formData.append('registration_url', registrationUrl);
            
            if (imageFile) {
                formData.append('image', imageFile);
            }
            
            const response = await fetch('/api/leagues', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadLeagues();
                alert('League created successfully!');
            } else {
                alert(data.error || 'Failed to create league');
            }
        } catch (error) {
            console.error('Error creating league:', error);
            alert('Error creating league');
        }
    }
    
    async editLeague(leagueId) {
        try {
            const response = await fetch('/api/leagues');
            const leagues = await response.json();
            const league = leagues.find(l => l.id === leagueId);
            
            if (!league) {
                alert('League not found');
                return;
            }
            
            const modal = document.createElement('div');
            modal.className = 'admin-modal';
            modal.innerHTML = `
                <div class="admin-modal-content">
                    <h3>Edit League</h3>
                    <form id="editLeagueForm" class="admin-form">
                        <label for="editLeagueName">League Name:</label>
                        <input type="text" id="editLeagueName" value="${league.name}" required>
                        
                        <label for="editLeagueImage">League Image:</label>
                        <input type="file" id="editLeagueImage" accept="image/*" class="file-input">
                        <small class="form-help">Upload new image (leave empty to keep current)</small>
                        
                        <label for="editLeagueInformation">League Information:</label>
                        <textarea id="editLeagueInformation" rows="8" required>${league.information}</textarea>
                        
                        <label for="editLeagueHandbook">League Handbook (URL):</label>
                        <input type="url" id="editLeagueHandbook" value="${league.handbook_url || ''}">
                        
                        <label for="editLeagueStandings">League Standings (URL):</label>
                        <input type="url" id="editLeagueStandings" value="${league.standings_url || ''}">
                        
                        <label for="editRegistrationStatus">Registration Status:</label>
                        <select id="editRegistrationStatus" required>
                            <option value="active" ${league.registration_status === 'active' ? 'selected' : ''}>Active / Signups Open!</option>
                            <option value="reserve" ${league.registration_status === 'reserve' ? 'selected' : ''}>Reserve List</option>
                            <option value="closed" ${league.registration_status === 'closed' ? 'selected' : ''}>Full/Signups Closed</option>
                        </select>
                        
                        <label for="editRegistrationUrl">Registration URL:</label>
                        <input type="url" id="editRegistrationUrl" value="${league.registration_url || ''}">
                        
                        <label class="checkbox-label">
                            <input type="checkbox" id="editLeagueActive" ${league.is_active ? 'checked' : ''}> Active
                        </label>
                        
                        <div class="form-buttons">
                            <button type="button" class="btn btn-outline" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                            <button type="submit" class="btn">Update League</button>
                        </div>
                    </form>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            document.getElementById('editLeagueForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.updateLeague(leagueId);
                modal.remove();
            });
        } catch (error) {
            console.error('Error loading league:', error);
            alert('Error loading league details');
        }
    }
    
    async updateLeague(leagueId) {
        const name = document.getElementById('editLeagueName').value;
        const information = document.getElementById('editLeagueInformation').value;
        const handbookUrl = document.getElementById('editLeagueHandbook').value;
        const standingsUrl = document.getElementById('editLeagueStandings').value;
        const registrationStatus = document.getElementById('editRegistrationStatus').value;
        const registrationUrl = document.getElementById('editRegistrationUrl').value;
        const isActive = document.getElementById('editLeagueActive').checked;
        const imageFile = document.getElementById('editLeagueImage').files[0];
        
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('information', information);
            formData.append('handbook_url', handbookUrl);
            formData.append('standings_url', standingsUrl);
            formData.append('registration_status', registrationStatus);
            formData.append('registration_url', registrationUrl);
            formData.append('is_active', isActive);
            
            if (imageFile) {
                formData.append('image', imageFile);
            }
            
            const response = await fetch(`/api/leagues/${leagueId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadLeagues();
                alert('League updated successfully!');
            } else {
                alert(data.error || 'Failed to update league');
            }
        } catch (error) {
            console.error('Error updating league:', error);
            alert('Error updating league');
        }
    }
    
    async archiveLeague(leagueId) {
        try {
            const response = await fetch(`/api/leagues/${leagueId}/archive`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadLeagues();
                alert('League archived/unarchived successfully!');
            } else {
                alert(data.error || 'Failed to archive league');
            }
        } catch (error) {
            console.error('Error archiving league:', error);
            alert('Error archiving league');
        }
    }
    
    async deleteLeague(leagueId) {
        if (!confirm('Are you sure you want to delete this league? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/leagues/${leagueId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.loadLeagues();
                alert('League deleted successfully!');
            } else {
                alert(data.error || 'Failed to delete league');
            }
        } catch (error) {
            console.error('Error deleting league:', error);
            alert('Error deleting league');
        }
    }

    // Discord Management Methods
    async loadDiscordManagement() {
        // Show Discord tab for master admins only
        if (this.userRole !== 'master') {
            document.getElementById('discordTab').innerHTML = `
                <div class="access-denied">
                    <h3>Access Denied</h3>
                    <p>Discord role management is only available to master administrators.</p>
                </div>
            `;
            return;
        }

        // Check if user is authenticated with Discord
        try {
            const response = await fetch('/api/discord/user');
            if (response.ok) {
                const discordUser = await response.json();
                this.showDiscordManagement(discordUser);
            } else {
                this.showDiscordAuth();
            }
        } catch (error) {
            this.showDiscordAuth();
        }
    }

    showDiscordAuth() {
        document.getElementById('discordAuthSection').style.display = 'block';
        document.getElementById('discordManagementSection').style.display = 'none';
        
        // Add event listener for Discord login
        const loginBtn = document.getElementById('discordLoginBtn');
        if (loginBtn) {
            loginBtn.onclick = () => {
                window.location.href = '/auth/discord';
            };
        }
    }

    async showDiscordManagement(discordUser) {
        document.getElementById('discordAuthSection').style.display = 'none';
        document.getElementById('discordManagementSection').style.display = 'block';
        
        // Show Discord user info
        document.getElementById('discordUserInfo').innerHTML = `
            <div class="discord-user-card">
                <img src="https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64" 
                     alt="${discordUser.username}" class="discord-avatar">
                <div class="discord-user-details">
                    <h4>${discordUser.username}</h4>
                    <p>Authenticated with Discord</p>
                </div>
            </div>
        `;
        
        // Add event listeners
        document.getElementById('refreshRolesBtn').onclick = () => this.loadDiscordRoles();
        document.getElementById('logoutDiscordBtn').onclick = () => this.logoutDiscord();
        
        // Load Discord roles
        this.loadDiscordRoles();
    }

    async loadDiscordRoles() {
        const container = document.getElementById('discordRolesContainer');
        container.innerHTML = '<div class="loading">Loading Discord roles...</div>';
        
        try {
            // Get server roles and current permissions
            const [serverRolesResponse, permissionsResponse] = await Promise.all([
                fetch('/api/discord/server-roles', {
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                }),
                fetch('/api/discord/role-permissions', {
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                })
            ]);
            
            if (!serverRolesResponse.ok || !permissionsResponse.ok) {
                throw new Error('Failed to load Discord data');
            }
            
            const serverRoles = await serverRolesResponse.json();
            const currentPermissions = await permissionsResponse.json();
            
            this.renderDiscordRoles(serverRoles, currentPermissions);
        } catch (error) {
            console.error('Error loading Discord roles:', error);
            container.innerHTML = '<div class="error">Failed to load Discord roles</div>';
        }
    }

    renderDiscordRoles(serverRoles, currentPermissions) {
        const container = document.getElementById('discordRolesContainer');
        
        if (serverRoles.length === 0) {
            container.innerHTML = '<div class="no-roles">No Discord roles found</div>';
            return;
        }
        
        const rolesHTML = serverRoles.map(role => {
            const rolePermissions = currentPermissions.find(p => p.role_id === role.id);
            const hasAdminPanel = rolePermissions?.permissions.includes('admin_panel') || false;
            const hasBotMentions = rolePermissions?.permissions.includes('bot_mentions') || false;
            
            return `
                <div class="discord-role-card" data-role-id="${role.id}">
                    <div class="role-header">
                        <div class="role-name" style="color: #${role.color.toString(16).padStart(6, '0')}">
                            ${role.name}
                        </div>
                        <div class="role-member-count">${role.position} members</div>
                    </div>
                    <div class="role-permissions">
                        <label class="permission-checkbox">
                            <input type="checkbox" ${hasAdminPanel ? 'checked' : ''} 
                                   data-permission="admin_panel" data-role-id="${role.id}">
                            Admin Panel Access
                        </label>
                        <label class="permission-checkbox">
                            <input type="checkbox" ${hasBotMentions ? 'checked' : ''} 
                                   data-permission="bot_mentions" data-role-id="${role.id}">
                            Bot Mentions
                        </label>
                    </div>
                    <div class="role-actions">
                        <button class="btn-small save-role-btn" data-role-id="${role.id}" data-role-name="${role.name}">
                            Save Changes
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = rolesHTML;
        
        // Add event listeners for save buttons
        container.querySelectorAll('.save-role-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roleId = e.target.dataset.roleId;
                const roleName = e.target.dataset.roleName;
                this.saveRolePermissions(roleId, roleName);
            });
        });
    }

    async saveRolePermissions(roleId, roleName) {
        const card = document.querySelector(`[data-role-id="${roleId}"]`);
        const checkboxes = card.querySelectorAll('input[type="checkbox"]');
        const permissions = [];
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                permissions.push(checkbox.dataset.permission);
            }
        });
        
        try {
            const response = await fetch('/api/discord/role-permissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    role_id: roleId,
                    role_name: roleName,
                    permissions: permissions
                })
            });
            
            if (response.ok) {
                // Show success feedback
                const saveBtn = card.querySelector('.save-role-btn');
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                saveBtn.style.backgroundColor = '#22c55e';
                
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.backgroundColor = '';
                }, 2000);
            } else {
                alert('Failed to save role permissions');
            }
        } catch (error) {
            console.error('Error saving role permissions:', error);
            alert('Error saving role permissions');
        }
    }

    logoutDiscord() {
        if (confirm('Are you sure you want to logout from Discord?')) {
            window.location.href = '/auth/logout';
        }
    }
}

// Initialize admin manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔐 Admin Panel loading...');
    window.adminManager = new AdminManager();
    console.log('🔐 Admin Panel ready');
});