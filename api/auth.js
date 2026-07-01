const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'trefanya-super-secret-key-2024';

// KAYIT
router.post('/register', async (req, res) => {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
        return res.status(400).json({ error: 'Tüm alanları doldurun' });
    }

    if (username.length < 3) {
        return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter' });
    }

    try {
        const existing = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users (username, password, display_name, is_online)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, display_name, title, bio, avatar, is_admin`,
            [username, hashedPassword, displayName, true]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                title: user.title,
                bio: user.bio,
                avatar: user.avatar,
                isAdmin: user.is_admin
            }
        });
    } catch (error) {
        console.error('Kayıt hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// GİRİŞ
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = result.rows[0];

        // Yasak kontrolü
        if (user.is_banned && user.ban_until && new Date(user.ban_until) > new Date()) {
            const remaining = Math.ceil((new Date(user.ban_until) - new Date()) / 60000);
            return res.status(403).json({ error: `Yasaklandınız! ${remaining} dakika kaldı` });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Yanlış şifre' });
        }

        // Son giriş zamanını güncelle
        await pool.query(
            'UPDATE users SET last_active = NOW(), is_online = true WHERE id = $1',
            [user.id]
        );

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                title: user.title,
                bio: user.bio,
                avatar: user.avatar,
                isAdmin: user.is_admin
            }
        });
    } catch (error) {
        console.error('Giriş hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Token doğrulama
router.get('/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token gerekli' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query(
            'SELECT id, username, display_name, title, bio, avatar, is_admin FROM users WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            title: user.title,
            bio: user.bio,
            avatar: user.avatar,
            isAdmin: user.is_admin
        });
    } catch (error) {
        res.status(401).json({ error: 'Geçersiz token' });
    }
});

// Şifre sıfırlama talebi
router.post('/reset-request', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Kullanıcı adı gerekli' });
    }

    try {
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        await pool.query(
            'INSERT INTO reset_requests (username) VALUES ($1)',
            [username]
        );

        res.json({ 
            success: true, 
            message: 'Şifre sıfırlama talebi admin\'e gönderildi' 
        });
    } catch (error) {
        console.error('Sıfırlama talebi hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Şifre sıfırlama taleplerini getir (admin)
router.get('/reset-requests', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token gerekli' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const adminCheck = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [decoded.id]
        );

        if (!adminCheck.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        const result = await pool.query(
            'SELECT * FROM reset_requests WHERE is_approved = false ORDER BY created_at DESC'
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Talepler hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Şifre sıfırlama talebini onayla (admin)
router.post('/reset-approve/:id', async (req, res) => {
    const { id } = req.params;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token gerekli' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const adminCheck = await pool.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [decoded.id]
        );

        if (!adminCheck.rows[0]?.is_admin) {
            return res.status(403).json({ error: 'Admin yetkisi gerekli' });
        }

        // Talebi al
        const request = await pool.query(
            'SELECT * FROM reset_requests WHERE id = $1',
            [id]
        );

        if (request.rows.length === 0) {
            return res.status(404).json({ error: 'Talep bulunamadı' });
        }

        const username = request.rows[0].username;

        // Şifreyi 12345 olarak güncelle
        const hashedPassword = await bcrypt.hash('12345', 10);
        await pool.query(
            'UPDATE users SET password = $1 WHERE username = $2',
            [hashedPassword, username]
        );

        // Talebi onayla
        await pool.query(
            'UPDATE reset_requests SET is_approved = true WHERE id = $1',
            [id]
        );

        res.json({ 
            success: true, 
            message: `${username} şifresi 12345 olarak sıfırlandı` 
        });
    } catch (error) {
        console.error('Onaylama hatası:', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

module.exports = router;
