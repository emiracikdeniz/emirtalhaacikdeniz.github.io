const express = require('express');
const router = express.Router();
const pool = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

// Profil getir (kullanıcı adı ile)
router.get('/:username', async (req, res) => {
    const { username } = req.params;

    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.display_name, u.title, u.bio, u.avatar, u.is_admin, u.is_online, u.last_active,
                   COUNT(DISTINCT p.id) as post_count,
                   COUNT(DISTINCT f1.follower_id) as follower_count,
                   COUNT(DISTINCT f2.following_id) as following_count
            FROM users u
            LEFT JOIN posts p ON p.author_id = u.id
            LEFT JOIN followers f1 ON f1.following_id = u.id
            LEFT JOIN followers f2 ON f2.follower_id = u.id
            WHERE u.username = $1
            GROUP BY u.id
        `, [username]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = result.rows[0];
        
        // Rozetleri al
        const badges = await pool.query(
            'SELECT badge_name FROM badges WHERE user_id = $1',
            [user.id]
        );

        // Son 5 gönderiyi al
        const recentPosts = await pool.query(`
            SELECT id, content, media, created_at,
                   COUNT(DISTINCT l.id) as like_count,
                   COUNT(DISTINCT c.id) as comment_count
            FROM posts
            LEFT JOIN likes l ON l.post_id = posts.id
            LEFT JOIN comments c ON c.post_id = posts.id
            WHERE author_id = $1
            GROUP BY posts.id
            ORDER BY created_at DESC
            LIMIT 5
        `, [user.id]);

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            title: user.title,
            bio: user.bio,
            avatar: user.avatar,
            isAdmin: user.is_admin,
            isOnline: user.is_online,
            lastActive: user.last_active,
            postCount: parseInt(user.post_count),
            followerCount: parseInt(user.follower_count),
            followingCount: parseInt(user.following_count),
            badges: badges.rows.map(b => b.badge_name),
            recentPosts: recentPosts.rows.map(p => ({
                id: p.id,
                content: p.content,
                media: p.media,
                createdAt: p.created_at,
                likeCount: parseInt(p.like_count),
                commentCount: parseInt(p.comment_count)
            }))
        });
    } catch (error) {
        console.error('Profil getirme hatası:', error);
        res.status(500).json({ error: 'Profil alınamadı' });
    }
});

// Profil güncelle
router.put('/profile', verifyToken, async (req, res) => {
    const { displayName, title, bio, avatar } = req.body;

    try {
        await pool.query(
            `UPDATE users 
             SET display_name = COALESCE($1, display_name),
                 title = COALESCE($2, title),
                 bio = COALESCE($3, bio),
                 avatar = COALESCE($4, avatar)
             WHERE id = $5`,
            [displayName, title, bio, avatar, req.userId]
        );

        res.json({ success: true, message: 'Profil güncellendi' });
    } catch (error) {
        console.error('Profil güncelleme hatası:', error);
        res.status(500).json({ error: 'Profil güncellenemedi' });
    }
});

// Şifre değiştir
router.put('/change-password', verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre gerekli' });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalı' });
    }

    try {
        const user = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [req.userId]
        );

        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Mevcut şifre yanlış' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, req.userId]
        );

        res.json({ success: true, message: 'Şifre değiştirildi' });
    } catch (error) {
        console.error('Şifre değiştirme hatası:', error);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
});

// Takip et/çöz
router.post('/follow/:username', verifyToken, async (req, res) => {
    const { username } = req.params;

    if (username === req.userId) {
        return res.status(400).json({ error: 'Kendini takip edemezsin' });
    }

    try {
        const target = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (target.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const targetId = target.rows[0].id;

        // Engellenmiş mi kontrol et
        const blocked = await pool.query(
            'SELECT * FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
            [req.userId, targetId]
        );

        if (blocked.rows.length > 0) {
            return res.status(403).json({ error: 'Bu kullanıcıyı engellediniz' });
        }

        const check = await pool.query(
            'SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2',
            [req.userId, targetId]
        );

        if (check.rows.length > 0) {
            await pool.query(
                'DELETE FROM followers WHERE follower_id = $1 AND following_id = $2',
                [req.userId, targetId]
            );
            res.json({ following: false });
        } else {
            await pool.query(
                'INSERT INTO followers (follower_id, following_id) VALUES ($1, $2)',
                [req.userId, targetId]
            );
            
            // Rozet kontrolü
            await checkBadges(req.userId);
            
            res.json({ following: true });
        }
    } catch (error) {
        console.error('Takip hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Takip durumunu kontrol et
router.get('/follow/status/:username', verifyToken, async (req, res) => {
    const { username } = req.params;

    try {
        const target = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (target.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const check = await pool.query(
            'SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2',
            [req.userId, target.rows[0].id]
        );

        res.json({ following: check.rows.length > 0 });
    } catch (error) {
        console.error('Takip durumu hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Kullanıcı engelle
router.post('/block/:username', verifyToken, async (req, res) => {
    const { username } = req.params;

    try {
        const target = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (target.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const targetId = target.rows[0].id;

        const check = await pool.query(
            'SELECT * FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
            [req.userId, targetId]
        );

        if (check.rows.length > 0) {
            await pool.query(
                'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
                [req.userId, targetId]
            );
            res.json({ blocked: false });
        } else {
            await pool.query(
                'INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)',
                [req.userId, targetId]
            );
            res.json({ blocked: true });
        }
    } catch (error) {
        console.error('Engelleme hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Çevrimiçi kullanıcıları getir
router.get('/online', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, display_name, avatar 
            FROM users 
            WHERE is_online = true AND is_banned = false
            ORDER BY last_active DESC
            LIMIT 20
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Çevrimiçi kullanıcılar hatası:', error);
        res.status(500).json({ error: 'Kullanıcılar alınamadı' });
    }
});

// Tüm kullanıcılar (admin)
router.get('/admin/users', verifyToken, async (req, res) => {
    try {
        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (!isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const result = await pool.query(`
            SELECT id, username, display_name, title, is_admin, is_banned, is_online, 
                   last_active, created_at,
                   COUNT(DISTINCT p.id) as post_count
            FROM users u
            LEFT JOIN posts p ON p.author_id = u.id
            GROUP BY u.id
            ORDER BY created_at DESC
        `);

        res.json(result.rows.map(row => ({
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            title: row.title,
            isAdmin: row.is_admin,
            isBanned: row.is_banned,
            isOnline: row.is_online,
            lastActive: row.last_active,
            createdAt: row.created_at,
            postCount: parseInt(row.post_count)
        })));
    } catch (error) {
        console.error('Admin kullanıcılar hatası:', error);
        res.status(500).json({ error: 'Kullanıcılar alınamadı' });
    }
});

// Kullanıcı yasakla (admin)
router.post('/admin/ban/:userId', verifyToken, async (req, res) => {
    try {
        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (!isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const { userId } = req.params;
        const { ban } = req.body;

        const targetUser = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [userId]
        );

        if (targetUser.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin kullanıcı yasaklanamaz' });
        }

        if (ban) {
            await pool.query(
                'UPDATE users SET is_banned = true, ban_until = NOW() + INTERVAL \'1 hour\' WHERE id = $1',
                [userId]
            );
        } else {
            await pool.query(
                'UPDATE users SET is_banned = false, ban_until = NULL WHERE id = $1',
                [userId]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Yasaklama hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Kullanıcı sil (admin)
router.delete('/admin/delete/:userId', verifyToken, async (req, res) => {
    try {
        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (!isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const { userId } = req.params;

        const targetUser = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [userId]
        );

        if (targetUser.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin kullanıcı silinemez' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Kullanıcı silme hatası:', error);
        res.status(500).json({ error: 'Kullanıcı silinemedi' });
    }
});

// Haftanın üyesini seç (admin)
router.post('/admin/week-member', verifyToken, async (req, res) => {
    const { username } = req.body;

    try {
        const isAdmin = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (!isAdmin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const user = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // Eski kaydı sil
        await pool.query('DELETE FROM week_member');
        
        // Yeni kayıt ekle
        await pool.query(
            'INSERT INTO week_member (user_id) VALUES ($1)',
            [user.rows[0].id]
        );

        // Rozet ekle
        await pool.query(
            `INSERT INTO badges (user_id, badge_name) 
             VALUES ($1, '🏆 Haftanın Üyesi')
             ON CONFLICT (user_id, badge_name) DO NOTHING`,
            [user.rows[0].id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Haftanın üyesi hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Haftanın üyesini getir
router.get('/week-member', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.display_name, u.avatar, u.title
            FROM week_member wm
            JOIN users u ON u.id = wm.user_id
            ORDER BY wm.selected_at DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return res.json(null);
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Haftanın üyesi getirme hatası:', error);
        res.status(500).json({ error: 'Veri alınamadı' });
    }
});

// Rozet kontrolü
async function checkBadges(userId) {
    try {
        // Takipçi sayısı
        const followerCount = await pool.query(
            'SELECT COUNT(*) FROM followers WHERE following_id = $1',
            [userId]
        );
        const followers = parseInt(followerCount.rows[0].count);

        const badges = [];

        if (followers >= 5) badges.push('👥 Popüler');
        if (followers >= 20) badges.push('🌟 Ünlü');
        if (followers >= 50) badges.push('⭐ Fenomen');

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
