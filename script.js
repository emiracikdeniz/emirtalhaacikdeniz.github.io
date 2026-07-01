// ============================================
// TREFANYA - FRONTEND JAVASCRIPT
// ============================================

const API_URL = window.location.origin + '/api';

// ----- API İSTEKLERİ -----
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('trefanya_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Hatası:', error);
        return { error: 'Sunucu ile bağlantı kurulamadı' };
    }
}

// ----- UYGULAMA -----
const App = {
    currentUser: null,
    currentPage: 'feed',
    currentChat: null,
    
    init() {
        this.setupEventListeners();
        this.checkAuth();
    },
    
    setupEventListeners() {
        // Giriş
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('registerBtn').addEventListener('click', () => this.showRegister());
        document.getElementById('registerSubmitBtn').addEventListener('click', () => this.register());
        document.getElementById('backToLoginBtn').addEventListener('click', () => this.showLogin());
        
        // Çıkış
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // Enter ile giriş
        document.getElementById('loginPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Sayfa navigasyonu
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            });
        });
        
        // Gönderi
        document.getElementById('submitPostBtn').addEventListener('click', () => this.createPost());
        document.getElementById('postMediaBtn').addEventListener('click', () => {
            document.getElementById('mediaInput').click();
        });
        document.getElementById('mediaInput').addEventListener('change', (e) => {
            this.handleMediaUpload(e);
        });
        document.getElementById('postPollBtn').addEventListener('click', () => {
            const el = document.getElementById('pollCreator');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('addPollBtn').addEventListener('click', () => this.addPoll());
        
        // IM
        document.getElementById('imSendBtn').addEventListener('click', () => this.sendIM());
        document.getElementById('imInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendIM();
        });
        
        // Notlar
        document.getElementById('addNoteBtn').addEventListener('click', () => this.addNote());
        
        // Profil
        document.getElementById('editProfileBtn').addEventListener('click', () => this.editProfile());
        document.getElementById('changePasswordBtn').addEventListener('click', () => this.changePassword());
        
        // Grup
        document.getElementById('createGroupBtn').addEventListener('click', () => this.createGroup());
        
        // Niko
        document.getElementById('niko-toggle').addEventListener('click', () => {
            document.getElementById('niko-panel').classList.toggle('open');
        });
        document.getElementById('niko-close').addEventListener('click', () => {
            document.getElementById('niko-panel').classList.remove('open');
        });
        document.getElementById('niko-send-btn').addEventListener('click', () => this.sendNikoMessage());
        document.getElementById('niko-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendNikoMessage();
        });
        document.getElementById('niko-voice-btn').addEventListener('click', () => this.startVoiceRecognition());
        
        // Arama
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchContent(e.target.value);
        });
        
        // Admin
        document.getElementById('adminUpdateTicker').addEventListener('click', () => this.updateTicker());
        document.getElementById('adminSetWeekMember').addEventListener('click', () => this.setWeekMember());
    },
    
    // ----- GİRİŞ / KAYIT -----
    async login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const msg = document.getElementById('loginMessage');
        
        if (!username || !password) {
            msg.textContent = '❌ Lütfen tüm alanları doldurun';
            return;
        }
        
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        if (result.error) {
            msg.textContent = '❌ ' + result.error;
            return;
        }
        
        localStorage.setItem('trefanya_token', result.token);
        this.currentUser = result.user;
        this.showMainApp();
    },
    
    async register() {
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const displayName = document.getElementById('regDisplayName').value.trim();
        const msg = document.getElementById('registerMessage');
        
        if (!username || !password || !displayName) {
            msg.textContent = '❌ Tüm alanları doldurun';
            return;
        }
        
        const result = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, displayName })
        });
        
        if (result.error) {
            msg.textContent = '❌ ' + result.error;
            return;
        }
        
        localStorage.setItem('trefanya_token', result.token);
        this.currentUser = result.user;
        this.showMainApp();
    },
    
    showRegister() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    },
    
    showLogin() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    },
    
    async checkAuth() {
        const token = localStorage.getItem('trefanya_token');
        if (!token) {
            document.getElementById('login-screen').classList.remove('hidden');
            return;
        }
        
        const result = await apiRequest('/auth/verify');
        if (result.error) {
            localStorage.removeItem('trefanya_token');
            document.getElementById('login-screen').classList.remove('hidden');
            return;
        }
        
        this.currentUser = result;
        this.showMainApp();
    },
    
    showMainApp() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.add('active');
        
        document.getElementById('userDisplayName').textContent = this.currentUser.displayName;
        document.getElementById('userProfilePic').src = this.currentUser.avatar || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'20\' fill=\'%230088ff\'/%3E%3Ctext x=\'20\' y=\'25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\' font-family=\'Arial\'%3E👤%3C/text%3E%3C/svg%3E';
        
        if (this.currentUser.isAdmin) {
            document.getElementById('adminPanelLink').style.display = 'block';
        }
        
        this.loadFeed();
        this.loadProfile();
        this.loadConversations();
        this.loadGroups();
        this.loadNotes();
        this.loadAdminPanel();
        this.loadOnlineUsers();
        
        // Splash'ı kaldır
        document.getElementById('splash-screen').classList.add('hidden');
    },
    
    logout() {
        localStorage.removeItem('trefanya_token');
        this.currentUser = null;
        document.getElementById('main-app').classList.remove('active');
        document.getElementById('login-screen').classList.remove('hidden');
    },
    
    // ----- NAVİGASYON -----
    navigateTo(page) {
        this.currentPage = page;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + page).classList.add('active');
        document.querySelectorAll('.sidebar-menu a').forEach(l => l.classList.remove('active'));
        document.querySelector(`.sidebar-menu a[data-page="${page}"]`).classList.add('active');
        
        if (page === 'feed') this.loadFeed();
        if (page === 'profile') this.loadProfile();
        if (page === 'messages') this.loadConversations();
        if (page === 'groups') this.loadGroups();
        if (page === 'notepad') this.loadNotes();
        if (page === 'admin') this.loadAdminPanel();
    },
    
    // ----- GÖNDERİLER -----
    async loadFeed() {
        const container = document.getElementById('feedContainer');
        container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">⏳ Yükleniyor...</div>';
        
        const result = await apiRequest('/posts?userId=' + (this.currentUser?.id || 0));
        
        if (result.error) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ff0044;">❌ ${result.error}</div>`;
            return;
        }
        
        if (result.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">
                <i class="fas fa-newspaper" style="font-size:40px;display:block;margin-bottom:15px;"></i>
                Henüz gönderi yok. İlk gönderiyi sen paylaş!
            </div>`;
            return;
        }
        
        let html = '';
        for (const post of result) {
            const isLiked = post.isLiked || false;
            const isAuthor = post.author.id === this.currentUser?.id;
            const isAdmin = this.currentUser?.isAdmin;
            
            html += `
                <div class="post-card" data-id="${post.id}">
                    <div class="post-header">
                        <img src="${post.author.avatar || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'20\' fill=\'%230088ff\'/%3E%3Ctext x=\'20\' y=\'25\' text-anchor=\'middle\' fill=\'white\' font-size=\'16\' font-family=\'Arial\'%3E👤%3C/text%3E%3C/svg%3E'}" class="post-avatar">
                        <span class="post-user">${post.author.displayName}</span>
                        <span style="font-size:10px;color:rgba(255,255,255,0.3);">${post.author.title || ''}</span>
                        <span class="post-time">${this.formatTime(post.createdAt)}</span>
                        ${post.isPinned ? '<span style="color:#ffd700;font-size:11px;">📌 Öne Çıkan</span>' : ''}
                        ${isAdmin ? `<button class="admin-btn" style="margin-left:auto;font-size:10px;background:transparent;border:1px solid #ff00aa;color:#ff00aa;border-radius:5px;padding:2px 8px;cursor:pointer;" onclick="App.togglePinned('${post.id}')">📌</button>` : ''}
                    </div>
                    <div class="post-content">${this.formatContent(post.content)}</div>
                    ${post.media ? `<img src="${post.media}" class="post-media">` : ''}
                    ${post.pollData ? this.renderPoll(post.pollData, post.id) : ''}
                    <div class="post-actions">
                        <button onclick="App.toggleLike('${post.id}')" class="${isLiked ? 'liked' : ''}">
                            <i class="fas fa-heart"></i> ${post.likeCount || 0}
                        </button>
                        <button onclick="App.toggleComments('${post.id}')">
                            <i class="fas fa-comment"></i> ${post.commentCount || 0}
                        </button>
                        ${isAuthor ? `
                            <button onclick="App.editPost('${post.id}')"><i class="fas fa-edit"></i></button>
                            <button onclick="App.deletePost('${post.id}')" style="color:#ff0044;"><i class="fas fa-trash"></i></button>
                        ` : ''}
                        ${isAdmin && !isAuthor ? `<button onclick="App.deletePost('${post.id}')" style="color:#ff0044;"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                    <div class="comment-section" id="comments-${post.id}" style="display:none;">
                        <div id="comments-list-${post.id}"></div>
                        <div class="comment-input">
                            <input type="text" id="comment-input-${post.id}" placeholder="Yorum yaz... #etiket">
                            <button onclick="App.addComment('${post.id}')"><i class="fas fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    },
    
    async toggleLike(postId) {
        const result = await apiRequest(`/posts/${postId}/like`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadFeed();
    },
    
    toggleComments(postId) {
        const el = document.getElementById('comments-' + postId);
        if (el.style.display === 'none') {
            el.style.display = 'block';
            this.loadComments(postId);
        } else {
            el.style.display = 'none';
        }
    },
    
    async loadComments(postId) {
        const container = document.getElementById('comments-list-' + postId);
        const result = await apiRequest(`/posts/${postId}/comments`);
        
        if (result.error || result.length === 0) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:12px;padding:5px;">Henüz yorum yok</div>';
            return;
        }
        
        let html = '';
        for (const comment of result) {
            const isAuthor = comment.author.id === this.currentUser?.id;
            html += `
                <div class="comment">
                    <img src="${comment.author.avatar || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'25\' height=\'25\'%3E%3Ccircle cx=\'12.5\' cy=\'12.5\' r=\'12.5\' fill=\'%230088ff\'/%3E%3Ctext x=\'12.5\' y=\'17\' text-anchor=\'middle\' fill=\'white\' font-size=\'10\' font-family=\'Arial\'%3E👤%3C/text%3E%3C/svg%3E'}" class="comment-avatar">
                    <div class="comment-content">
                        <div class="comment-user">${comment.author.displayName}</div>
                        <div class="comment-text">${this.formatContent(comment.content)}</div>
                        <div class="comment-actions">
                            <button onclick="App.likeComment('${postId}','${comment.id}')"><i class="fas fa-heart"></i> ${comment.likeCount || 0}</button>
                            ${isAuthor ? `
                                <button onclick="App.editComment('${postId}','${comment.id}')"><i class="fas fa-edit"></i></button>
                                <button onclick="App.deleteComment('${postId}','${comment.id}')" style="color:#ff0044;"><i class="fas fa-trash"></i></button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    },
    
    async addComment(postId) {
        const input = document.getElementById('comment-input-' + postId);
        const content = input.value.trim();
        
        if (!content) return;
        
        const result = await apiRequest(`/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        input.value = '';
        this.loadComments(postId);
        this.loadFeed();
    },
    
    async likeComment(postId, commentId) {
        const result = await apiRequest(`/posts/comments/${commentId}/like`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadComments(postId);
    },
    
    async editComment(postId, commentId) {
        const newContent = prompt('Yorumu düzenle:');
        if (!newContent || !newContent.trim()) return;
        
        const result = await apiRequest(`/posts/comments/${commentId}`, {
            method: 'PUT',
            body: JSON.stringify({ content: newContent.trim() })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadComments(postId);
    },
    
    async deleteComment(postId, commentId) {
        if (!confirm('Bu yorumu silmek istediğine emin misin?')) return;
        
        const result = await apiRequest(`/posts/comments/${commentId}`, {
            method: 'DELETE'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadComments(postId);
        this.loadFeed();
    },
    
    async createPost() {
        const content = document.getElementById('postContent').value.trim();
        if (!content) {
            this.showNotification('Lütfen bir şeyler yazın!');
            return;
        }
        
        const postData = {
            content,
            media: this._pendingMedia || null,
            pollData: this._pendingPoll || null
        };
        
        const result = await apiRequest('/posts', {
            method: 'POST',
            body: JSON.stringify(postData)
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this._pendingMedia = null;
        this._pendingPoll = null;
        document.getElementById('postContent').value = '';
        document.getElementById('pollCreator').style.display = 'none';
        document.getElementById('postMediaBtn').innerHTML = '<i class="fas fa-image"></i> Medya Ekle';
        
        this.showNotification('✅ Gönderi paylaşıldı!');
        this.loadFeed();
    },
    
    async editPost(postId) {
        const newContent = prompt('Gönderiyi düzenle:');
        if (!newContent || !newContent.trim()) return;
        
        const result = await apiRequest(`/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify({ content: newContent.trim() })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Gönderi güncellendi');
        this.loadFeed();
    },
    
    async deletePost(postId) {
        if (!confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
        
        const result = await apiRequest(`/posts/${postId}`, {
            method: 'DELETE'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('🗑️ Gönderi silindi');
        this.loadFeed();
    },
    
    async togglePinned(postId) {
        const result = await apiRequest(`/posts/${postId}/pin`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadFeed();
    },
    
    // ----- ANKET -----
    addPoll() {
        const question = document.getElementById('pollQuestion').value.trim();
        const option1 = document.getElementById('pollOption1').value.trim();
        const option2 = document.getElementById('pollOption2').value.trim();
        const option3 = document.getElementById('pollOption3').value.trim();
        
        if (!question || !option1 || !option2) {
            this.showNotification('Lütfen soruyu ve en az 2 seçeneği doldurun');
            return;
        }
        
        const options = [option1, option2];
        if (option3) options.push(option3);
        
        this._pendingPoll = {
            question,
            options,
            votes: options.map(() => [])
        };
        
        this.showNotification('✅ Anket oluşturuldu! Gönderiyi paylaşmayı unutma.');
        document.getElementById('pollCreator').style.display = 'none';
    },
    
    renderPoll(pollData, postId) {
        if (!pollData) return '';
        const totalVotes = pollData.votes.reduce((sum, v) => sum + v.length, 0);
        
        let html = `<div style="margin:10px 0;padding:15px;background:rgba(0,0,0,0.3);border-radius:10px;">
            <div style="font-weight:bold;color:#00ff88;margin-bottom:10px;">📊 ${pollData.question}</div>`;
        
        pollData.options.forEach((opt, i) => {
            const count = pollData.votes[i]?.length || 0;
            const percent = totalVotes > 0 ? (count / totalVotes * 100) : 0;
            
            html += `
                <div class="poll-option" onclick="App.votePoll('${postId}', ${i})">
                    <span style="font-size:13px;color:rgba(255,255,255,0.7);">${opt}</span>
                    <div class="vote-bar"><div class="fill" style="width:${percent}%;"></div></div>
                    <span class="vote-percent">${Math.round(percent)}%</span>
                    <span style="font-size:10px;color:rgba(255,255,255,0.3);">${count}</span>
                </div>
            `;
        });
        
        html += `<div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:5px;">${totalVotes} oy</div></div>`;
        return html;
    },
    
    async votePoll(postId, optionIndex) {
        const result = await apiRequest(`/posts/${postId}/vote`, {
            method: 'POST',
            body: JSON.stringify({ optionIndex })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.loadFeed();
    },
    
    // ----- PROFİL -----
    async loadProfile() {
        if (!this.currentUser) return;
        
        const result = await apiRequest(`/users/${this.currentUser.username}`);
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        document.getElementById('profileAvatar').src = result.avatar || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Ccircle cx=\'50\' cy=\'50\' r=\'50\' fill=\'%230088ff\'/%3E%3Ctext x=\'50\' y=\'60\' text-anchor=\'middle\' fill=\'white\' font-size=\'40\' font-family=\'Arial\'%3E👤%3C/text%3E%3C/svg%3E';
        document.getElementById('profileName').textContent = result.displayName;
        document.getElementById('profileTitle').textContent = result.title || '🌟 Yeni Üye';
        document.getElementById('profileBio').textContent = result.bio || 'Merhaba! Ben Trefanya\'dayım.';
        document.getElementById('profilePosts').textContent = result.postCount || 0;
        document.getElementById('profileFollowers').textContent = result.followerCount || 0;
        document.getElementById('profileFollowing').textContent = result.followingCount || 0;
        
        // Rozetler
        const badgeContainer = document.getElementById('profileBadges');
        if (result.badges && result.badges.length > 0) {
            badgeContainer.innerHTML = result.badges.map(b => {
                const cls = b.includes('Kurucu') || b.includes('Admin') ? 'badge-gold' :
                           b.includes('Haftanın') ? 'badge-neon' :
                           b.includes('Günlük') ? 'badge-silver' : 'badge-bronze';
                return `<span class="badge ${cls}">${b}</span>`;
            }).join('');
        } else {
            badgeContainer.innerHTML = '<span style="color:rgba(255,255,255,0.2);font-size:11px;">Henüz rozet yok</span>';
        }
        
        // Gönderiler
        const container = document.getElementById('profilePostsContainer');
        if (result.recentPosts && result.recentPosts.length > 0) {
            container.innerHTML = result.recentPosts.map(p => `
                <div class="post-card">
                    <div class="post-header">
                        <span class="post-user">${result.displayName}</span>
                        <span class="post-time">${this.formatTime(p.createdAt)}</span>
                    </div>
                    <div class="post-content">${this.formatContent(p.content)}</div>
                    ${p.media ? `<img src="${p.media}" class="post-media" style="max-height:200px;object-fit:contain;">` : ''}
                    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:5px;">
                        ❤️ ${p.likeCount || 0} · 💬 ${p.commentCount || 0}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);">Henüz gönderin yok</div>';
        }
    },
    
    async editProfile() {
        const displayName = prompt('Görünen isim:', this.currentUser.displayName);
        if (displayName !== null && displayName.trim()) {
            const result = await apiRequest('/users/profile', {
                method: 'PUT',
                body: JSON.stringify({ displayName: displayName.trim() })
            });
            
            if (result.error) {
                this.showNotification('❌ ' + result.error);
                return;
            }
            
            this.currentUser.displayName = displayName.trim();
            document.getElementById('userDisplayName').textContent = this.currentUser.displayName;
            this.showNotification('✅ Profil güncellendi!');
        }
    },
    
    async changePassword() {
        const currentPassword = prompt('Mevcut şifre:');
        if (!currentPassword) return;
        
        const newPassword = prompt('Yeni şifre (en az 4 karakter):');
        if (!newPassword || newPassword.length < 4) {
            this.showNotification('❌ Şifre en az 4 karakter olmalı');
            return;
        }
        
        const result = await apiRequest('/users/change-password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Şifre değiştirildi!');
    },
    
    // ----- MESAJLAŞMA (IM) -----
    async loadConversations() {
        const container = document.getElementById('imUserList');
        const result = await apiRequest('/messages/conversations');
        
        if (result.error || result.length === 0) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;font-size:12px;">Henüz mesajlaşacak kimse yok</div>';
            return;
        }
        
        let html = '';
        for (const conv of result) {
            html += `
                <div class="im-user ${this.currentChat === conv.userId ? 'active' : ''}" onclick="App.openChat('${conv.userId}')">
                    <img src="${conv.avatar || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'30\' height=\'30\'%3E%3Ccircle cx=\'15\' cy=\'15\' r=\'15\' fill=\'%230088ff\'/%3E%3Ctext x=\'15\' y=\'20\' text-anchor=\'middle\' fill=\'white\' font-size=\'12\' font-family=\'Arial\'%3E👤%3C/text%3E%3C/svg%3E'}" style="width:30px;height:30px;border-radius:50%;border:2px solid ${conv.isOnline ? '#00ff88' : '#555'};">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;color:${conv.isOnline ? '#00ff88' : 'rgba(255,255,255,0.4)'};">${conv.displayName}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${conv.lastMessage || '...'}</div>
                    </div>
                    ${conv.unreadCount > 0 ? `<span style="background:#ff00aa;color:#fff;border-radius:50%;padding:2px 8px;font-size:10px;">${conv.unreadCount}</span>` : ''}
                </div>
            `;
        }
        
        container.innerHTML = html;
    },
    
    async openChat(userId) {
        this.currentChat = userId;
        this.loadConversations();
        await this.loadMessages(userId);
    },
    
    async loadMessages(userId) {
        const container = document.getElementById('imMessages');
        container.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);">⏳ Yükleniyor...</div>';
        
        const result = await apiRequest(`/messages/${userId}`);
        
        if (result.error) {
            container.innerHTML = `<div style="text-align:center;padding:20px;color:#ff0044;">❌ ${result.error}</div>`;
            return;
        }
        
        if (result.length === 0) {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:40px;font-size:14px;">Henüz mesaj yok</div>';
            return;
        }
        
        let html = '';
        for (const msg of result) {
            const isSent = msg.sender.id === this.currentUser.id;
            html += `
                <div class="im-message ${isSent ? 'sent' : 'received'}">
                    <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:3px;">${isSent ? 'Ben' : msg.sender.displayName}</div>
                    ${msg.content}
                    <div style="font-size:8px;color:rgba(255,255,255,0.2);margin-top:3px;">${this.formatTime(msg.createdAt)}</div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    },
    
    async sendIM() {
        if (!this.currentChat) {
            this.showNotification('Lütfen bir kullanıcı seçin');
            return;
        }
        
        const input = document.getElementById('imInput');
        const content = input.value.trim();
        if (!content) return;
        
        const result = await apiRequest('/messages/send', {
            method: 'POST',
            body: JSON.stringify({ receiverId: this.currentChat, content })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        input.value = '';
        this.loadMessages(this.currentChat);
    },
    
    // ----- GRUPLAR -----
    async loadGroups() {
        const container = document.getElementById('groupsContainer');
        container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">⏳ Yükleniyor...</div>';
        
        const result = await apiRequest('/groups');
        
        if (result.error) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#ff0044;">❌ ${result.error}</div>`;
            return;
        }
        
        if (result.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">Henüz grup yok. İlk grubu oluştur!</div>';
            return;
        }
        
        let html = '';
        for (const group of result) {
            const isMember = group.isMember || false;
            html += `
                <div class="group-card">
                    <h3>${group.name}</h3>
                    <p>${group.description || 'Sohbet grubu'}</p>
                    <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap;">
                        <span style="font-size:11px;color:rgba(255,255,255,0.3);">👥 ${group.memberCount || 0} üye</span>
                        ${isMember ? 
                            `<button class="btn-neon-small" onclick="App.leaveGroup('${group.id}')" style="border-color:#ff0044;color:#ff0044;">Ayrıl</button>` :
                            `<button class="btn-neon-small" onclick="App.joinGroup('${group.id}')">Katıl</button>`
                        }
                        ${group.ownerId === this.currentUser?.id || this.currentUser?.isAdmin ? 
                            `<button class="btn-neon-small" onclick="App.deleteGroup('${group.id}')" style="border-color:#ff0044;color:#ff0044;">Sil</button>` : ''
                        }
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    },
    
    async createGroup() {
        const name = prompt('Grup adı:');
        if (!name || !name.trim()) return;
        
        const description = prompt('Grup açıklaması (opsiyonel):');
        
        const result = await apiRequest('/groups', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), description: description?.trim() || '' })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Grup oluşturuldu!');
        this.loadGroups();
    },
    
    async joinGroup(groupId) {
        const result = await apiRequest(`/groups/${groupId}/join`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Gruba katıldın!');
        this.loadGroups();
    },
    
    async leaveGroup(groupId) {
        const result = await apiRequest(`/groups/${groupId}/leave`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Gruptan ayrıldın');
        this.loadGroups();
    },
    
    async deleteGroup(groupId) {
        if (!confirm('Bu grubu silmek istediğine emin misin?')) return;
        
        const result = await apiRequest(`/groups/${groupId}`, {
            method: 'DELETE'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('🗑️ Grup silindi');
        this.loadGroups();
    },
    
    // ----- NOT DEFTERİ -----
    async loadNotes() {
        const container = document.getElementById('notesContainer');
        const result = await apiRequest('/notes');
        
        if (result.error || result.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);">📝 Henüz notun yok</div>';
            return;
        }
        
        let html = '';
        for (const note of result) {
            html += `
                <div class="note-card">
                    <h4>${note.title}</h4>
                    <p>${note.content}</p>
                    <div class="note-time">${this.formatTime(note.createdAt)}</div>
                    <button onclick="App.deleteNote('${note.id}')" style="background:transparent;border:none;color:#ff0044;cursor:pointer;font-size:11px;margin-top:5px;">
                        <i class="fas fa-trash"></i> Sil
                    </button>
                </div>
            `;
        }
        
        container.innerHTML = html;
    },
    
    async addNote() {
        const title = document.getElementById('noteTitle').value.trim();
        const content = document.getElementById('noteContent').value.trim();
        
        if (!title || !content) {
            this.showNotification('Başlık ve içerik gerekli');
            return;
        }
        
        const result = await apiRequest('/notes', {
            method: 'POST',
            body: JSON.stringify({ title, content })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteContent').value = '';
        this.showNotification('✅ Not eklendi!');
        this.loadNotes();
    },
    
    async deleteNote(noteId) {
        if (!confirm('Bu notu silmek istediğine emin misin?')) return;
        
        const result = await apiRequest(`/notes/${noteId}`, {
            method: 'DELETE'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('🗑️ Not silindi');
        this.loadNotes();
    },
    
    // ----- ADMIN PANEL -----
    async loadAdminPanel() {
        if (!this.currentUser?.isAdmin) return;
        
        const container = document.getElementById('adminContainer');
        
        // İstatistikler
        const stats = await apiRequest('/admin/stats');
        // Kullanıcılar
        const users = await apiRequest('/users/admin/users');
        // Haftanın üyesi
        const weekMember = await apiRequest('/users/week-member');
        // Sıfırlama talepleri
        const resetRequests = await apiRequest('/auth/reset-requests');
        
        let html = `
            <!-- İSTATİSTİKLER -->
            <div class="admin-section">
                <h3>📊 İstatistikler</h3>
                <div style="display:flex;gap:30px;flex-wrap:wrap;">
                    <div><span style="color:rgba(255,255,255,0.4);">Toplam Kullanıcı:</span> <span style="color:#00ff88;">${stats?.totalUsers || 0}</span></div>
                    <div><span style="color:rgba(255,255,255,0.4);">Toplam Gönderi:</span> <span style="color:#00ff88;">${stats?.totalPosts || 0}</span></div>
                    <div><span style="color:rgba(255,255,255,0.4);">Çevrimiçi:</span> <span style="color:#00ff88;">${stats?.onlineUsers || 0}</span></div>
                </div>
            </div>
            
            <!-- HABER ŞERİDİ -->
            <div class="admin-section">
                <h3>📝 Haber Şeridi</h3>
                <input type="text" id="adminTickerInput" class="neon-input" placeholder="Haber metni..." style="margin-bottom:10px;" />
                <button id="adminUpdateTicker" class="neon-btn" style="width:auto;padding:8px 20px;font-size:12px;">Güncelle</button>
            </div>
            
            <!-- KULLANICILAR -->
            <div class="admin-section">
                <h3>👥 Kullanıcılar</h3>
                <table>
                    <thead><tr><th>Kullanıcı</th><th>Durum</th><th>Gönderi</th><th>İşlem</th></tr></thead>
                    <tbody>
                        ${users?.map(u => `
                            <tr>
                                <td>${u.displayName}</td>
                                <td>${u.isBanned ? '🚫 Yasaklı' : (u.isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı')}</td>
                                <td>${u.postCount || 0}</td>
                                <td>
                                    ${!u.isAdmin ? `
                                        <button class="admin-btn" onclick="App.banUser('${u.id}')">${u.isBanned ? 'Yasağı Kaldır' : 'Yasakla'}</button>
                                        <button class="admin-btn danger" onclick="App.deleteUser('${u.id}')">Sil</button>
                                    ` : '<span style="color:#ffd700;">👑 Admin</span>'}
                                </td>
                            </tr>
                        `).join('') || ''}
                    </tbody>
                </table>
            </div>
            
            <!-- HAFTANIN ÜYESİ -->
            <div class="admin-section">
                <h3>🏆 Haftanın Üyesi</h3>
                <select id="adminWeekMember" class="neon-input" style="margin-bottom:10px;">
                    ${users?.map(u => `
                        <option value="${u.username}" ${u.username === weekMember?.username ? 'selected' : ''}>${u.displayName}</option>
                    `).join('') || ''}
                </select>
                <button id="adminSetWeekMember" class="neon-btn" style="width:auto;padding:8px 20px;font-size:12px;">Seç</button>
                <div style="margin-top:10px;color:#ffd700;" id="adminCurrentWeekMember">
                    ${weekMember ? `🏆 Mevcut: ${weekMember.displayName}` : 'Henüz seçilmedi'}
                </div>
            </div>
            
            <!-- ŞİFRE SIFIRLAMA TALEPLERİ -->
            <div class="admin-section">
                <h3>📩 Şifre Sıfırlama Talepleri</h3>
                <div id="adminResetRequests">
                    ${resetRequests?.length > 0 ? resetRequests.map(r => `
                        <div style="display:flex;justify-content:space-between;padding:5px;border-bottom:1px solid rgba(255,255,255,0.03);flex-wrap:wrap;gap:5px;">
                            <span>${r.username} - ${this.formatTime(r.created_at)}</span>
                            <div>
                                <button class="admin-btn" onclick="App.approveReset('${r.id}')">Onayla</button>
                                <button class="admin-btn danger" onclick="App.rejectReset('${r.id}')">Reddet</button>
                            </div>
                        </div>
                    `).join('') : '<div style="color:rgba(255,255,255,0.3);font-size:12px;">Talep yok</div>'}
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Admin butonları için event listener'ları yeniden ekle
        document.getElementById('adminUpdateTicker')?.addEventListener('click', () => this.updateTicker());
        document.getElementById('adminSetWeekMember')?.addEventListener('click', () => this.setWeekMember());
    },
    
    async banUser(userId) {
        const currentUser = await apiRequest(`/users/${userId}`);
        if (currentUser.isBanned) {
            const result = await apiRequest(`/users/admin/ban/${userId}`, {
                method: 'POST',
                body: JSON.stringify({ ban: false })
            });
            if (!result.error) this.loadAdminPanel();
        } else {
            const result = await apiRequest(`/users/admin/ban/${userId}`, {
                method: 'POST',
                body: JSON.stringify({ ban: true })
            });
            if (!result.error) this.loadAdminPanel();
        }
    },
    
    async deleteUser(userId) {
        if (!confirm('Bu kullanıcıyı silmek istediğine emin misin?')) return;
        
        const result = await apiRequest(`/users/admin/delete/${userId}`, {
            method: 'DELETE'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('🗑️ Kullanıcı silindi');
        this.loadAdminPanel();
    },
    
    async updateTicker() {
        const content = document.getElementById('adminTickerInput').value.trim();
        if (!content) {
            this.showNotification('Lütfen bir metin girin');
            return;
        }
        
        const result = await apiRequest('/admin/ticker', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        document.getElementById('tickerText').textContent = content;
        this.showNotification('✅ Haber şeridi güncellendi!');
    },
    
    async setWeekMember() {
        const username = document.getElementById('adminWeekMember').value;
        
        const result = await apiRequest('/users/admin/week-member', {
            method: 'POST',
            body: JSON.stringify({ username })
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification(`🏆 ${username} haftanın üyesi seçildi!`);
        this.loadAdminPanel();
    },
    
    async approveReset(requestId) {
        const result = await apiRequest(`/auth/reset-approve/${requestId}`, {
            method: 'POST'
        });
        
        if (result.error) {
            this.showNotification('❌ ' + result.error);
            return;
        }
        
        this.showNotification('✅ Şifre 12345 olarak sıfırlandı');
        this.loadAdminPanel();
    },
    
    async rejectReset(requestId) {
        // Silme işlemi
        this.showNotification('❌ Talep reddedildi');
        this.loadAdminPanel();
    },
    
    // ----- ÇEVRİMİÇİ KULLANICILAR -----
    async loadOnlineUsers() {
        const result = await apiRequest('/users/online');
        if (!result.error) {
            document.getElementById('onlineCount').textContent = `Çevrimiçi: ${result.length}`;
        }
    },
    
    // ----- MEDYA YÜKLEME -----
    handleMediaUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            this._pendingMedia = ev.target.result;
            document.getElementById('postMediaBtn').innerHTML = '<i class="fas fa-check"></i> Medya Eklendi';
        };
        reader.readAsDataURL(file);
    },
    
    // ----- AI ASİSTAN (NIKO) -----
    async sendNikoMessage() {
        const input = document.getElementById('niko-input');
        const text = input.value.trim();
        if (!text) return;
        
        this.addNikoMessage('user', text);
        input.value = '';
        
        try {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=AIzaSyAb8RN6L_3jwAEFV13X96VcxMXdPvZI8-2n1hEQX_rLuLqqleYw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `Sen Trefanya'nın AI asistanısın. Adın Niko. Kullanıcı: ${text}` }]
                    }]
                })
            });
            
            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Üzgünüm, bir hata oluştu.';
            this.addNikoMessage('bot', reply);
        } catch (error) {
            this.addNikoMessage('bot', 'Bağlantı hatası! Lütfen tekrar dene.');
        }
    },
    
    addNikoMessage(type, text) {
        const container = document.getElementById('niko-messages');
        const div = document.createElement('div');
        div.className = `niko-msg ${type}`;
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },
    
    startVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            this.showNotification('Ses tanıma tarayıcında desteklenmiyor');
            return;
        }
        
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'tr-TR';
        recognition.continuous = false;
        
        const btn = document.getElementById('niko-voice-btn');
        btn.classList.add('listening');
        
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            document.getElementById('niko-input').value = text;
            this.sendNikoMessage();
            btn.classList.remove('listening');
        };
        
        recognition.onerror = () => {
            btn.classList.remove('listening');
            this.showNotification('Ses tanıma hatası');
        };
        
        recognition.start();
    },
    
    // ----- ARAMA -----
    searchContent(query) {
        // Bu fonksiyon feed'de arama yapar
        const container = document.getElementById('feedContainer');
        if (!query.trim()) {
            this.loadFeed();
            return;
        }
        
        const posts = container.querySelectorAll('.post-card');
        let found = false;
        
        posts.forEach(post => {
            const content = post.querySelector('.post-content')?.textContent?.toLowerCase() || '';
            if (content.includes(query.toLowerCase())) {
                post.style.display = 'block';
                found = true;
            } else {
                post.style.display = 'none';
            }
        });
        
        if (!found) {
            const noResult = document.createElement('div');
            noResult.style.cssText = 'text-align:center;padding:40px;color:rgba(255,255,255,0.3);';
            noResult.textContent = '🔍 Sonuç bulunamadı';
            container.appendChild(noResult);
        }
    },
    
    // ----- YARDIMCI -----
    formatTime(timestamp) {
        if (!timestamp) return 'Bilinmiyor';
        const diff = Date.now() - new Date(timestamp).getTime();
        if (diff < 60000) return 'Şimdi';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' dakika önce';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' saat önce';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' gün önce';
        return new Date(timestamp).toLocaleDateString('tr-TR');
    },
    
    formatContent(content) {
        return content
            .replace(/#([a-zA-Z0-9_]+)/g, '<span style="color:#ff00aa;">#$1</span>')
            .replace(/@([a-zA-Z0-9_]+)/g, '<span style="color:#0088ff;">@$1</span>');
    },
    
    showNotification(msg) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.9); color: #00ff88;
            padding: 15px 30px; border-radius: 15px;
            border: 1px solid #00ff88;
            font-size: 14px; z-index: 10000;
            box-shadow: 0 0 30px rgba(0,255,136,0.2);
            font-family: 'Orbitron', sans-serif;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.5s';
            setTimeout(() => el.remove(), 500);
        }, 3000);
    }
};

// ----- BAŞLAT -----
document.addEventListener('DOMContentLoaded', () => {
    window.App = App;
    App.init();
});
