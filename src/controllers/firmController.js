// ============================================================
// Emsal Atlası - Firm Controller
// Hukuk bürosu iş mantığı
// ============================================================

const LawFirm = require('../models/LawFirm');
const FirmUser = require('../models/FirmUser');
const User = require('../models/User');

/**
 * Yeni hukuk bürosu oluşturur.
 * POST /api/firms
 */
async function createFirm(req, res, next) {
  try {
    const { name, taxNumber, address, phone } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Büro adı en az 2 karakter olmalıdır.',
      });
    }

    const firm = await LawFirm.create({
      name: name.trim(),
      taxNumber,
      address,
      phone,
      ownerId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Hukuk bürosu başarıyla oluşturuldu.',
      data: firm,
    });
  } catch (error) {
    console.error('Büro oluşturma hatası:', error);
    next(error);
  }
}

/**
 * Kullanıcının büro listesini döndürür.
 * GET /api/firms
 */
async function getMyFirms(req, res, next) {
  try {
    const firms = await LawFirm.findByUserId(req.user.id);

    res.status(200).json({
      success: true,
      data: firms,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Büro detaylarını döndürür.
 * GET /api/firms/:firmId
 */
async function getFirmDetails(req, res, next) {
  try {
    const firm = await LawFirm.findById(req.user.firmId);
    if (!firm) {
      return res.status(404).json({ success: false, message: 'Büro bulunamadı.' });
    }

    const members = await LawFirm.getMembers(req.user.firmId);
    const seatCount = await LawFirm.getSeatCount(req.user.firmId);

    res.status(200).json({
      success: true,
      data: {
        ...firm,
        members,
        currentSeats: seatCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Büro bilgilerini günceller (Sadece kurucu/ortak).
 * PUT /api/firms/:firmId
 */
async function updateFirm(req, res, next) {
  try {
    const { name, taxNumber, address, phone } = req.body;
    const updated = await LawFirm.update(req.user.firmId, { name, taxNumber, address, phone });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Büro bulunamadı.' });
    }

    res.status(200).json({
      success: true,
      message: 'Büro bilgileri güncellendi.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Büro üyelerini listeler.
 * GET /api/firms/:firmId/members
 */
async function getMembers(req, res, next) {
  try {
    const members = await LawFirm.getMembers(req.user.firmId);
    const seatCount = members.filter(m => m.is_active).length;

    res.status(200).json({
      success: true,
      data: {
        members,
        currentSeats: seatCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Büro'ya davet gönderir (Sadece kurucu/ortak).
 * POST /api/firms/:firmId/invite
 */
async function inviteMember(req, res, next) {
  try {
    const { email, firmRole } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'E-posta adresi zorunludur.' });
    }

    const validRoles = ['ortak', 'avukat', 'stajyer', 'asistan'];
    if (firmRole && !validRoles.includes(firmRole)) {
      return res.status(400).json({
        success: false,
        message: `Geçersiz rol. İzin verilen roller: ${validRoles.join(', ')}`,
      });
    }

    // Seat limit kontrolü
    const seatCount = await LawFirm.getSeatCount(req.user.firmId);
    // TODO: Abonelik planından max_seats bilgisini çekip kontrol et
    // Şimdilik sabit limit yok, ileride subscription ile entegre edilecek

    const invitation = await FirmUser.createInvitation(
      req.user.firmId,
      email.trim(),
      firmRole || 'avukat',
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: `${email} adresine davet gönderildi.`,
      data: invitation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Bekleyen davetleri listeler.
 * GET /api/firms/:firmId/invitations
 */
async function getInvitations(req, res, next) {
  try {
    const invitations = await FirmUser.getPendingInvitations(req.user.firmId);

    res.status(200).json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Daveti kabul eder.
 * POST /api/firms/accept-invitation/:invitationId
 */
async function acceptInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const result = await FirmUser.acceptInvitation(invitationId, req.user.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Davet bulunamadı veya süresi dolmuş.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Büroya başarıyla katıldınız!',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Üye rolünü günceller (Sadece kurucu/ortak).
 * PUT /api/firms/:firmId/members/:userId/role
 */
async function updateMemberRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { firmRole } = req.body;

    const validRoles = ['ortak', 'avukat', 'stajyer', 'asistan'];
    if (!validRoles.includes(firmRole)) {
      return res.status(400).json({
        success: false,
        message: `Geçersiz rol. İzin verilen roller: ${validRoles.join(', ')}`,
      });
    }

    // Kurucu rolü değiştirilemez
    const targetRole = await FirmUser.getUserFirmRole(req.user.firmId, userId);
    if (targetRole === 'kurucu') {
      return res.status(403).json({
        success: false,
        message: 'Kurucu rolü değiştirilemez.',
      });
    }

    const updated = await FirmUser.updateRole(req.user.firmId, userId, firmRole);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Üye bulunamadı.' });
    }

    res.status(200).json({
      success: true,
      message: 'Üye rolü güncellendi.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Üyeyi bürodan çıkarır (Sadece kurucu/ortak).
 * DELETE /api/firms/:firmId/members/:userId
 */
async function removeMember(req, res, next) {
  try {
    const { userId } = req.params;

    // Kurucu kendini çıkaramaz
    const targetRole = await FirmUser.getUserFirmRole(req.user.firmId, userId);
    if (targetRole === 'kurucu') {
      return res.status(403).json({
        success: false,
        message: 'Büro kurucusu çıkarılamaz.',
      });
    }

    const removed = await FirmUser.removeMember(req.user.firmId, userId);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Üye bulunamadı.' });
    }

    res.status(200).json({
      success: true,
      message: 'Üye bürodan çıkarıldı.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createFirm,
  getMyFirms,
  getFirmDetails,
  updateFirm,
  getMembers,
  inviteMember,
  getInvitations,
  acceptInvitation,
  updateMemberRole,
  removeMember,
};
