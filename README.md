# ⚖️ Emsal Atlası - LegalTech SaaS API

Avukatların emsal kararları anahtar kelimeler ve semantik arama ile bulmasını sağlayan LegalTech SaaS platformu.

## 📋 Aşama 1: Kullanıcı Kayıt, Giriş ve Abonelik Yönetimi

### 🛠️ Teknolojiler
- **Runtime:** Node.js
- **Framework:** Express.js
- **Veritabanı:** MySQL (Docker)
- **Kimlik Doğrulama:** JWT (JSON Web Token)
- **Şifreleme:** bcryptjs
- **Doğrulama:** express-validator
- **Güvenlik:** helmet, cors, express-rate-limit

### 📁 Proje Yapısı
```
emsal-atlasi/
├── server.js                    # Giriş noktası
├── package.json
├── .env                         # Ortam değişkenleri
├── .env.example                 # Örnek ortam değişkenleri
└── src/
    ├── app.js                   # Express uygulaması
    ├── config/
    │   ├── db.js                # MySQL bağlantı havuzu
    │   └── database.sql         # Veritabanı şeması
    ├── controllers/
    │   └── authController.js    # Kayıt/Giriş iş mantığı
    ├── middleware/
    │   ├── auth.js              # JWT doğrulama
    │   ├── errorHandler.js      # Hata yakalama
    │   └── validate.js          # Doğrulama sonuçları
    ├── models/
    │   ├── User.js              # Kullanıcı modeli
    │   ├── Role.js              # Rol modeli
    │   ├── SubscriptionPlan.js  # Abonelik planı modeli
    │   └── UserSubscription.js  # Kullanıcı aboneliği modeli
    ├── routes/
    │   ├── index.js             # Merkezi route yöneticisi
    │   ├── auth.js              # Auth endpoint'leri
    │   └── subscription.js      # Abonelik endpoint'leri
    ├── utils/
    │   └── migrate.js           # Veritabanı migration
    └── validators/
        └── authValidator.js     # Giriş doğrulama kuralları
```

### 🚀 Kurulum

1. **Bağımlılıkları yükle:**
```bash
npm install
```

2. **.env dosyasını düzenle:**
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=SENIN_MYSQL_SIFREN
DB_NAME=emsal_atlasi
JWT_SECRET=GUCLU_BIR_SECRET_KEY
```

3. **Veritabanı tablolarını oluştur:**
```bash
npm run migrate
```

4. **Sunucuyu başlat:**
```bash
# Development (hot-reload)
npm run dev

# Production
npm start
```

### 📍 API Endpoint'leri

| Metod | Endpoint | Açıklama | Erişim |
|-------|----------|----------|--------|
| POST | `/api/auth/register` | Yeni kullanıcı kaydı | Public |
| POST | `/api/auth/login` | Kullanıcı girişi | Public |
| GET | `/api/auth/me` | Profil bilgileri | JWT |
| POST | `/api/auth/refresh-token` | Token yenileme | Public |
| GET | `/api/subscriptions/plans` | Abonelik planları | Public |
| GET | `/api/subscriptions/my` | Aktif abonelik | JWT |
| GET | `/api/subscriptions/history` | Abonelik geçmişi | JWT |
| GET | `/api/health` | Sağlık kontrolü | Public |

### 📝 API Kullanım Örnekleri

**Kayıt:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ahmet",
    "lastName": "Yılmaz",
    "email": "ahmet@example.com",
    "password": "Sifre123",
    "passwordConfirm": "Sifre123"
  }'
```

**Giriş:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmet@example.com",
    "password": "Sifre123"
  }'
```

**Profil (JWT ile):**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer SENIN_JWT_TOKENIN"
```
