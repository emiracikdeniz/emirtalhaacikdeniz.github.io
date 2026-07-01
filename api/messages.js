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

// Mesaj gönder
router.post('/send', verifyToken, async (req, res) => {
    const { receiverId, content } = req.body;

    if (!receiverId || !content) {
        return res.status(400).json({ error: 'Alıcı ve mesaj içeriği gerekli' });
    }

    if (receiverId === req.userId) {
        return res.status(400).json({ error: 'Kendine mesaj gönderemezsin' });
    }

    try {
        // Alıcının var olduğunu kontrol et
        const receiver = await pool.query(
            'SELECT id FROM users WHERE id = $1',
            [receiverId]
        );

        if (receiver.rows.length === 0) {
            return res.status(404).json({ error: 'Alıcı bulunamadı' });
        }

        // Engellenmiş mi kontrol et
        const blocked = await pool.query(
            'SELECT * FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
            [req.userId, receiverId]
        );

        if (blocked.rows.length > 0) {
            return res.status(403).json({ error: 'Bu kullanıcıyı engellediniz' });
        }

        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, content)
             VALUES ($1, $2, $3)
             RETURNING id, content, created_at, is_read`,
            [req.userId, receiverId, content]
        );

        res.json({
            success: true,
            message: {
                id: result.rows[0].id,
                content: result.rows[0].content,
                createdAt: result.rows[0].created_at,
                isRead: result.rows[0].is_read
            }
        });
    } catch (error) {
        console.error('Mesaj gönderme hatası:', error);
        res.status(500).json({ error: 'Mesaj gönderilemedi' });
    }
});

// Mesajları getir (iki kullanıcı arasındaki)
router.get('/:userId', verifyToken, async (req, res) => {
    const { userId } = req.params;

    try {
        // Engellenmiş mi kontrol et
        const blocked = await pool.query(
            'SELECT * FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
            [req.userId, userId]
        );

        if (blocked.rows.length > 0) {
            return res.status(403).json({ error: 'Bu kullanıcıyı engellediniz' });
        }

        const result = await pool.query(`
            SELECT m.*,
                   u_sender.username as sender_username,
                   u_sender.display_name as sender_display_name,
                   u_sender.avatar as sender_avatar,
                   u_receiver.username as receiver_username,
                   u_receiver.display_name as receiver_display_name,
                   u_receiver.avatar as receiver_avatar
            FROM messages m
            JOIN users u_sender ON u_sender.id = m.sender_id
            JOIN users u_receiver ON u_receiver.id = m.receiver_id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
        `, [req.userId, userId]);

        // Okunmamış mesajları okundu olarak işaretle
        await pool.query(
            'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false',
            [userId, req.userId]
        );

        res.json(result.rows.map(row => ({
            id: row.id,
            content: row.content,
            createdAt: row.created_at,
            isRead: row.is_read,
            sender: {
                id: row.sender_id,
                username: row.sender_username,
                displayName: row.sender_display_name,
                avatar: row.sender_avatar
            },
            receiver: {
                id: row.receiver_id,
                username: row.receiver_username,
                displayName: row.receiver_display_name,
                avatar: row.receiver_avatar
            }
        })));
    } catch (error) {
        console.error('Mesaj getirme hatası:', error);
        res.status(500).json({ error: 'Mesajlar alınamadı' });
    }
});

// Sohbet listesini getir (tüm konuşmalar)
router.get('/conversations', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT 
                CASE 
                    WHEN m.sender_id = $1 THEN m.receiver_id
                    ELSE m.sender_id
                END as other_user_id,
                u.username,
                u.display_name,
                u.avatar,
                u.is_online,
                (
                    SELECT content 
                    FROM messages 
                    WHERE (sender_id = $1 AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at 
                    FROM messages 
                    WHERE (sender_id = $1 AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message_time,
                (
                    SELECT COUNT(*) 
                    FROM messages 
                    WHERE sender_id = u.id AND receiver_id = $1 AND is_read = false
                ) as unread_count
            FROM messages m
            JOIN users u ON u.id = CASE 
                WHEN m.sender_id = $1 THEN m.receiver_id
                ELSE m.sender_id
            END
            WHERE m.sender_id = $1 OR m.receiver_id = $1
            ORDER BY last_message_time DESC
        `, [req.userId]);

        res.json(result.rows.map(row => ({
            userId: row.other_user_id,
            username: row.username,
            displayName: row.display_name,
            avatar: row.avatar,
            isOnline: row.is_online,
            lastMessage: row.last_message,
            lastMessageTime: row.last_message_time,
            unreadCount: parseInt(row.unread_count || 0)
        })));
    } catch (error) {
        console.error('Sohbet listesi hatası:', error);
        res.status(500).json({ error: 'Sohbetler alınamadı' });
    }
});

// Okunmamış mesaj sayısını getir
router.get('/unread/count', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
            [req.userId]
        );

        res.json({ unreadCount: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Okunmamış mesaj hatası:', error);
        res.status(500).json({ error: 'Veri alınamadı' });
    }
});

// Mesajları okundu olarak işaretle
router.post('/read/:userId', verifyToken, async (req, res) => {
    const { userId } = req.params;

    try {
        await pool.query(
            'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false',
            [userId, req.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Mesaj okuma hatası:', error);
        res.status(500).json({ error: 'İşlem başarısız' });
    }
});

// Mesaj sil
router.delete('/:messageId', verifyToken, async (req, res) => {
    const { messageId } = req.params;

    try {
        const message = await pool.query(
            'SELECT sender_id FROM messages WHERE id = $1',
            [messageId]
        );

        if (message.rows.length === 0) {
            return res.status(404).json({ error: 'Mesaj bulunamadı' });
        }

        if (message.rows[0].sender_id !== req.userId) {
            return res.status(403).json({ error: 'Bu mesajı silme yetkiniz yok' });
        }

        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Mesaj silme hatası:', error);
        res.status(500).json({ error: 'Mesaj silinemedi' });
    }
});

module.exports = router;
