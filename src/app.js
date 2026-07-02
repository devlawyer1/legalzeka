// ============================================================
// Emsal Atlası - Express App Configuration
// Uygulama yapılandırması ve middleware'ler
// ============================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const requestContext = require('./middleware/requestContext');
const { csrfProtection } = require('./middleware/csrf');
const { httpMetrics } = require('./services/observability');
const healthRoutes = require('./routes/health');

const app = express();

// =============================================================
// Güvenlik Middleware'leri
// =============================================================

// Helmet - HTTP başlık güvenliği
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
}));

// CORS - Cross-Origin Resource Sharing
const corsAllowlist = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
if (process.env.NODE_ENV === 'production' && (!corsAllowlist.length || corsAllowlist.includes('*'))) {
  throw new Error('Production CORS_ORIGINS must contain an explicit allowlist.');
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || (process.env.NODE_ENV !== 'production' && !corsAllowlist.length) || corsAllowlist.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin is not allowed.'), { status: 403, code: 'CORS_DENIED' }));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'Idempotency-Key'],
  credentials: true,
}));

// Rate Limiting - Brute Force koruması
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 20, // Her IP için 15 dakikada maksimum 20 istek
  message: {
    success: false,
    message: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Genel rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: {
    success: false,
    message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
  },
});

app.use(generalLimiter);

// =============================================================
// Genel Middleware'ler
// =============================================================

// JSON body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);
app.use(httpMetrics);
app.use(csrfProtection);

// HTTP istek loglaması
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// =============================================================
// Route'lar
// =============================================================

// Sağlık kontrolü
app.use('/health', healthRoutes);
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Emsal Atlası API çalışıyor.',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Kök dizin (Yanlışlıkla tarayıcıdan girilirse bilgi ver)
app.get('/', (req, res) => {
  res.status(200).send(`
    <html>
      <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
        <h2>Emsal Atlası - API Sunucusu Çalışıyor</h2>
        <p>Burası arka uç (backend) sunucusudur. Kullanıcı arayüzüne ulaşmak için lütfen Frontend adresine gidin:</p>
        <a href="http://localhost:3001" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Arayüze Git (Port 3001)</a>
      </body>
    </html>
  `);
});

// Auth route'larına rate limiter uygula
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// API route'ları
app.use('/api', routes);

// =============================================================
// Hata Yakalama
// =============================================================
app.use(notFound);
app.use(errorHandler);

module.exports = app;
