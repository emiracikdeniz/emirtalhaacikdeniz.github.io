const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Rotaları
const auth = require('./auth');
const posts = require('./posts');
const users = require('./users');
const messages = require('./messages');

app.use('/api/auth', auth);
app.use('/api/posts', posts);
app.use('/api/users', users);
app.use('/api/messages', messages);

// Ana sayfa kontrolü
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        message: 'Trefanya API çalışıyor! 🚀',
        timestamp: new Date().toISOString()
    });
});

// 404 - Bulunamadı
app.use((req, res) => {
    res.status(404).json({ error: 'API endpoint bulunamadı' });
});

// Hata yakalama
app.use((err, req, res, next) => {
    console.error('Sunucu hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
});

module.exports = app;
