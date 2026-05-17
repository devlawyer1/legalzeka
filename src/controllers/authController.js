// ============================================================
// Emsal Atlası - Auth Controller
// Kayıt (Register) ve Giriş (Login) iş mantığı
// ============================================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');

/**
 * JWT Access Token oluşturur.
 * @param {Object} user - Kullanıcı bilgisi
 * @returns {string} JWT token
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

/**
 * JWT Refresh Token oluşturur.
 * @param {Object} user - Kullanıcı bilgisi
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

// =============================================================
// POST /api/auth/register
// Yeni kullanıcı kaydı
// =============================================================
exports.register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // 1. E-posta kontrolü
    const emailExists = await User.emailExists(email);
    if (emailExists) {
      return res.status(409).json({
        success: false,
        message: 'Bu e-posta adresi zaten kayıtlı.',
      });
    }

    // 2. 'Users' rolünü al
    const userRole = await Role.findByName('Users');
    if (!userRole) {
      return res.status(500).json({
        success: false,
        message: 'Sistem hatası: Varsayılan rol bulunamadı.',
      });
    }

    // 3. Kullanıcıyı oluştur
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      roleId: userRole.id,
    });

    // 4. 'Ücretsiz Deneme' aboneliğini ata (ID=1, encoding sorunları nedeniyle ID ile aranır)
    const trialPlan = await SubscriptionPlan.findById(1);
    if (!trialPlan) {
      console.error('⚠️ Ücretsiz Deneme planı bulunamadı. Abonelik atanamadı.');
    } else {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + trialPlan.duration_days);

      await UserSubscription.create({
        userId: newUser.id,
        planId: trialPlan.id,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });
    }

    // 5. Token oluştur
    const tokenPayload = {
      id: newUser.id,
      email: newUser.email,
      role: userRole.role_name,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // 6. Başarılı yanıt
    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı! 7 günlük ücretsiz deneme aboneliğiniz aktif edildi.',
      data: {
        user: {
          id: newUser.id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          role: userRole.role_name,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// POST /api/auth/login
// Kullanıcı girişi
// =============================================================
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Kullanıcıyı bul
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'E-posta veya şifre hatalı.',
      });
    }

    // 2. Hesap aktiflik kontrolü
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Hesabınız devre dışı bırakılmıştır. Lütfen destek ile iletişime geçin.',
      });
    }

    // 3. Şifre doğrulama
    const isPasswordValid = await User.comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'E-posta veya şifre hatalı.',
      });
    }

    // 4. Aktif abonelik bilgisini al
    const activeSubscription = await UserSubscription.findActiveByUserId(user.id);

    // 5. Token oluştur
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role_name,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // 6. Başarılı yanıt
    res.status(200).json({
      success: true,
      message: 'Giriş başarılı.',
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role_name,
        },
        subscription: activeSubscription
          ? {
              planName: activeSubscription.plan_name,
              maxSearchLimit: activeSubscription.max_search_limit,
              startDate: activeSubscription.start_date,
              endDate: activeSubscription.end_date,
              isActive: activeSubscription.is_active,
            }
          : null,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// GET /api/auth/me
// Mevcut kullanıcı bilgilerini getirir (korumalı endpoint)
// =============================================================
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.',
      });
    }

    const activeSubscription = await UserSubscription.findActiveByUserId(user.id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          role: user.role_name,
          createdAt: user.created_at,
        },
        subscription: activeSubscription
          ? {
              planName: activeSubscription.plan_name,
              maxSearchLimit: activeSubscription.max_search_limit,
              startDate: activeSubscription.start_date,
              endDate: activeSubscription.end_date,
              isActive: activeSubscription.is_active,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// POST /api/auth/refresh-token
// Access token yenileme
// =============================================================
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token gereklidir.',
      });
    }

    // Token'ı doğrula
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Kullanıcıyı bul
    const user = await User.findById(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz refresh token.',
      });
    }

    // Yeni access token oluştur
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role_name,
    };

    const newAccessToken = generateAccessToken(tokenPayload);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz veya süresi dolmuş refresh token.',
      });
    }
    next(error);
  }
};

// =============================================================
// PUT /api/auth/profile
// Profil bilgilerini güncelle (Ad, Soyad)
// =============================================================
exports.updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Ad ve Soyad alanları zorunludur.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.',
      });
    }

    await User.updateProfile(req.user.id, { firstName, lastName });

    res.status(200).json({
      success: true,
      message: 'Profil başarıyla güncellendi.',
      data: {
        user: {
          ...user,
          first_name: firstName,
          last_name: lastName
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// PUT /api/auth/password
// Şifre değiştirme
// =============================================================
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut şifre ve yeni şifre gereklidir.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre en az 6 karakter olmalıdır.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.',
      });
    }

    // 1. Orijinal User verisini şifre kontrolü için al
    const userForAuth = await User.findByEmail(user.email);
    
    // 2. Mevcut şifre doğrulaması
    const isPasswordValid = await User.comparePassword(currentPassword, userForAuth.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Mevcut şifreniz hatalı.',
      });
    }

    // 3. Şifreyi güncelle
    await User.updatePassword(req.user.id, newPassword);

    res.status(200).json({
      success: true,
      message: 'Şifreniz başarıyla güncellendi.',
    });
  } catch (error) {
    next(error);
  }
};
