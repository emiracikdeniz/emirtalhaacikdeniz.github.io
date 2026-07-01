const express = require('express');
const router = express.Router();
const pool = require('./db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'trefanya-super-secret-key-2024';

// Middleware: Token doğrulama
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Giriş yapmalısınız' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Geçersiz token' });
    }
}

// Gönderi oluştur
router.post('/', verifyToken, async (req, res) => {
    const { content, media, pollData } = req.body;
    
    if (!content) {
        return res.status(400).json({ error: 'İçerik gerekli' });
    }

    // Küfür kontrolü
    const badWords = ['küfür1', 'küfür2', 'küfür3', 'mal', 'salak', 'aptal'];
    for (const word of badWords) {
        if (content.toLowerCase().includes(word)) {
            // 1 saat yasakla
            await pool.query(
                'UPDATE users SET is_banned = true, ban_until = NOW() + INTERVAL \'1 hour\' WHERE id = $1',
                [req.userId]
            );
            return res.status(403).json({ error: 'Küfür kullandığınız için 1 saat yasaklandınız!' });
        }
    }

    try {
        const result = await pool.query(
            `INSERT INTO posts (author_id, content, media, poll_data)
             VALUES ($1, $2, $3, $4)
             RETURNING id, content, media, poll_data, created_at`,
            [req.userId, content, media || null, pollData || null]
        );

        const post = result.rows[0];
        
        // Rozet kontrolü
        await checkBadges(req.userId);

        res.json({ 
            success: true, 
            post: {
                id: post.id,
                content: post.content,
                media: post.media,
                pollData: post.poll_data,
                createdAt: post.created_at
            }
        });
    } catch (error) {
        console.error('Gönderi oluşturma hatası:', error);
        res.status(500).json({ error: 'Gönderi oluşturulamadı' });
    }
});

// Tüm gönderileri getir
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   u.id as user_id, u.username, u.display_name, u.avatar, u.title,
                   COUNT(DISTINCT l.id) as like_count,
                   COUNT(DISTINCT c.id) as comment_count,
                   EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN likes l ON l.post_id = p.id
            LEFT JOIN comments c ON c.post_id = p.id
            GROUP BY p.id, u.id
            ORDER BY p.is_pinned DESC, p.created_at DESC
        `, [req.query.userId || 0]);

        const posts = result.rows.map(row => ({
            id: row.id,
            author: {
                id: row.user_id,
                username: row.username,
                displayName: row.display_name,
                avatar: row.avatar,
                title: row.title
            },
            content: row.content,
            media: row.media,
            pollData: row.poll_data,
            isPinned: row.is_pinned,
            createdAt: row.created_at,
            likeCount: parseInt(row.like_count),
            commentCount: parseInt(row.comment_count),
            isLiked: row.is_liked
        }));

        res.json(posts);
    } catch (error) {
        console.error('Gönderiler getirme hatası:', error);
        res.status(500).json({ error: 'Gönderiler alınamadı' });
    }
});

// Tek bir gönderiyi getir
router.get('/:postId', async (req, res) => {
    const { postId } = req.params;

    try {
        const result = await pool.query(`
            SELECT p.*, 
                   u.id as user_id, u.username, u.display_name, u.avatar, u.title,
                   COUNT(DISTINCT l.id) as like_count,
                   COUNT(DISTINCT c.id) as comment_count
            FROM posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN likes l ON l.post_id = p.id
            LEFT JOIN comments c ON c.post_id = p.id
            WHERE p.id = $1
            GROUP BY p.id, u.id
        `, [postId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Gönderi bulunamadı' });
        }

        const row = result.rows[0];
        res.json({
            id: row.id,
            author: {
                id: row.user_id,
                username: row.username,
                displayName: row.display_name,
                avatar: row.avatar,
                title: row.title
            },
            content: row.content,
            media: row.media,
            pollData: row.poll_data,
            isPinned: row.is_pinned,
            createdAt: row.created_at,
            likeCount: parseInt(row.like_count),
            commentCount: parseInt(row.comment_count)
        });
    } catch (error) {
        console.error('Gönderi getirme hatası:', error);
        res.status(500).json({ error: 'Gönderi alınamadı' });
    }
});

// Gönderiyi beğen/beğenme kaldır
router.post('/:postId/like', verifyToken, async (req, res) => {
    const { postId } = req.params;

    try {
        // Var mı kontrol et
        const check = await pool.query(
            'SELECT * FROM likes WHERE user_id = $1 AND post_id = $2',
            [req.userId, postId]
        );

        if (check.rows.length > 0) {
            // Kaldır
            await pool.query(
                'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
                [req.userId, postId]
            );
            res.json({ liked: false });
        } else {
            // Ekle
            await pool.query(
                'INSERT INTO likes (user_id, post_id) VALUES ($1, $2)',
                [req.userId, postId]
            );
            
            // Rozet kontrolü
            await checkBadges(req.userId);
            
            res.json({ liked: true });
        }
    } catch (error) {
        console.error('Beğeni hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Gönderiyi güncelle
router.put('/:postId', verifyToken, async (req, res) => {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'İçerik gerekli' });
    }

    try {
        // Yetki kontrolü
        const post = await pool.query(
            'SELECT author_id FROM posts WHERE id = $1',
            [postId]
        );

        if (post.rows.length === 0) {
            return res.status(404).json({ error: 'Gönderi bulunamadı' });
        }

        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (post.rows[0].author_id !== req.userId && !isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        await pool.query(
            'UPDATE posts SET content = $1, updated_at = NOW() WHERE id = $2',
            [content, postId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Gönderi güncelleme hatası:', error);
        res.status(500).json({ error: 'Gönderi güncellenemedi' });
    }
});

// Gönderiyi sil
router.delete('/:postId', verifyToken, async (req, res) => {
    const { postId } = req.params;

    try {
        // Yetki kontrolü
        const post = await pool.query(
            'SELECT author_id FROM posts WHERE id = $1',
            [postId]
        );

        if (post.rows.length === 0) {
            return res.status(404).json({ error: 'Gönderi bulunamadı' });
        }

        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (post.rows[0].author_id !== req.userId && !isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Gönderi silme hatası:', error);
        res.status(500).json({ error: 'Gönderi silinemedi' });
    }
});

// Gönderiyi öne çıkar (admin)
router.post('/:postId/pin', verifyToken, async (req, res) => {
    const { postId } = req.params;

    try {
        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (!isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const post = await pool.query(
            'SELECT is_pinned FROM posts WHERE id = $1',
            [postId]
        );

        if (post.rows.length === 0) {
            return res.status(404).json({ error: 'Gönderi bulunamadı' });
        }

        const newPinned = !post.rows[0].is_pinned;
        await pool.query(
            'UPDATE posts SET is_pinned = $1 WHERE id = $2',
            [newPinned, postId]
        );

        res.json({ pinned: newPinned });
    } catch (error) {
        console.error('Öne çıkarma hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Yorum ekle
router.post('/:postId/comments', verifyToken, async (req, res) => {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Yorum içeriği gerekli' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO comments (post_id, user_id, content)
             VALUES ($1, $2, $3)
             RETURNING id, content, created_at`,
            [postId, req.userId, content]
        );

        const comment = result.rows[0];
        
        // Kullanıcı bilgilerini al
        const user = await pool.query(
            'SELECT id, username, display_name, avatar FROM users WHERE id = $1',
            [req.userId]
        );

        res.json({
            success: true,
            comment: {
                id: comment.id,
                content: comment.content,
                createdAt: comment.created_at,
                author: {
                    id: user.rows[0].id,
                    username: user.rows[0].username,
                    displayName: user.rows[0].display_name,
                    avatar: user.rows[0].avatar
                }
            }
        });
    } catch (error) {
        console.error('Yorum ekleme hatası:', error);
        res.status(500).json({ error: 'Yorum eklenemedi' });
    }
});

// Yorumları getir
router.get('/:postId/comments', async (req, res) => {
    const { postId } = req.params;

    try {
        const result = await pool.query(`
            SELECT c.*, 
                   u.id as user_id, u.username, u.display_name, u.avatar,
                   COUNT(DISTINCT cl.id) as like_count
            FROM comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN comment_likes cl ON cl.comment_id = c.id
            WHERE c.post_id = $1
            GROUP BY c.id, u.id
            ORDER BY c.created_at ASC
        `, [postId]);

        res.json(result.rows.map(row => ({
            id: row.id,
            content: row.content,
            createdAt: row.created_at,
            likeCount: parseInt(row.like_count),
            author: {
                id: row.user_id,
                username: row.username,
                displayName: row.display_name,
                avatar: row.avatar
            }
        })));
    } catch (error) {
        console.error('Yorum getirme hatası:', error);
        res.status(500).json({ error: 'Yorumlar alınamadı' });
    }
});

// Yorum beğen
router.post('/comments/:commentId/like', verifyToken, async (req, res) => {
    const { commentId } = req.params;

    try {
        const check = await pool.query(
            'SELECT * FROM comment_likes WHERE user_id = $1 AND comment_id = $2',
            [req.userId, commentId]
        );

        if (check.rows.length > 0) {
            await pool.query(
                'DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2',
                [req.userId, commentId]
            );
            res.json({ liked: false });
        } else {
            await pool.query(
                'INSERT INTO comment_likes (user_id, comment_id) VALUES ($1, $2)',
                [req.userId, commentId]
            );
            res.json({ liked: true });
        }
    } catch (error) {
        console.error('Yorum beğeni hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Yorum sil
router.delete('/comments/:commentId', verifyToken, async (req, res) => {
    const { commentId } = req.params;

    try {
        const comment = await pool.query(
            'SELECT user_id FROM comments WHERE id = $1',
            [commentId]
        );

        if (comment.rows.length === 0) {
            return res.status(404).json({ error: 'Yorum bulunamadı' });
        }

        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (comment.rows[0].user_id !== req.userId && !isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Yorum silme hatası:', error);
        res.status(500).json({ error: 'Yorum silinemedi' });
    }
});

// Yorum güncelle
router.put('/comments/:commentId', verifyToken, async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Yorum içeriği gerekli' });
    }

    try {
        const comment = await pool.query(
            'SELECT user_id FROM comments WHERE id = $1',
            [commentId]
        );

        if (comment.rows.length === 0) {
            return res.status(404).json({ error: 'Yorum bulunamadı' });
        }

        if (comment.rows[0].user_id !== req.userId) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        await pool.query(
            'UPDATE comments SET content = $1, updated_at = NOW() WHERE id = $2',
            [content, commentId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Yorum güncelleme hatası:', error);
        res.status(500).json({ error: 'Yorum güncellenemedi' });
    }
});

// Rozet kontrolü
async function checkBadges(userId) {
    try {
        // Gönderi sayısı
        const postCount = await pool.query(
            'SELECT COUNT(*) FROM posts WHERE author_id = $1',
            [userId]
        );
        const count = parseInt(postCount.rows[0].count);

        // Beğeni sayısı
        const likeCount = await pool.query(
            'SELECT COUNT(*) FROM likes WHERE user_id = $1',
            [userId]
        );
        const likes = parseInt(likeCount.rows[0].count);

        // Takipçi sayısı
        const followerCount = await pool.query(
            'SELECT COUNT(*) FROM followers WHERE following_id = $1',
            [userId]
        );
        const followers = parseInt(followerCount.rows[0].count);

        const badges = [];

        if (count >= 1) badges.push('📝 İlk Gönderi');
        if (count >= 10) badges.push('🔥 Aktif Yazar');
        if (count >= 50) badges.push('💎 Efsane Yazar');
        if (likes >= 10) badges.push('❤️ Beğeni Ustası');
        if (likes >= 50) badges.push('⭐ Süper Beğenici');
        if (followers >= 5) badges.push('👥 Popüler');
        if (followers >= 20) badges.push('🌟 Ünlü');

        // Günlük rozet (bugün gönderi paylaştıysa)
        const today = await pool.query(
            "SELECT COUNT(*) FROM posts WHERE author_id = $1 AND DATE(created_at) = CURRENT_DATE",
            [userId]
        );
        if (parseInt(today.rows[0].count) > 0) {
            badges.push('📅 Günlük Aktif');
        }

        for (const badge of badges) {
            await pool.query(
                `INSERT INTO badges (user_id, badge_name) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id, badge_name) DO NOTHING`,
                [userId, badge]
            );
        }
    } catch (error) {
        console.error('Rozet kontrolü hatası:', error);
    }
}

module.exports = router;
