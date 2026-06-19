// ============================================================
// Emsal Atlası - Firm Routes
// Hukuk bürosu yönetimi endpoint'leri
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { firmMember, firmAdmin } = require('../middleware/firmAuth');
const firmController = require('../controllers/firmController');
const financeRoutes = require('./finance');
const corporateRoutes = require('./corporate');

// ==================== Büro İşlemleri ====================

// Kullanıcının bürolarını listele
router.get('/', authenticate, firmController.getMyFirms);

// Yeni büro oluştur
router.post('/', authenticate, firmController.createFirm);

// Daveti kabul et (firmMember gerekmez, çünkü henüz üye değil)
router.post('/accept-invitation/:invitationId', authenticate, firmController.acceptInvitation);

// ==================== Büro Detay İşlemleri (Üyelik gerekli) ====================

// Büro detaylarını getir
router.get('/:firmId', authenticate, firmMember, firmController.getFirmDetails);

// Büro bilgilerini güncelle (Sadece kurucu/ortak)
router.put('/:firmId', authenticate, firmMember, firmAdmin, firmController.updateFirm);

// ==================== Üye Yönetimi ====================

// Büro üyelerini listele
router.get('/:firmId/members', authenticate, firmMember, firmController.getMembers);

// Büro'ya davet gönder (Sadece kurucu/ortak)
router.post('/:firmId/invite', authenticate, firmMember, firmAdmin, firmController.inviteMember);

// Bekleyen davetleri listele (Sadece kurucu/ortak)
router.get('/:firmId/invitations', authenticate, firmMember, firmAdmin, firmController.getInvitations);

// Üye rolünü güncelle (Sadece kurucu/ortak)
router.put('/:firmId/members/:userId/role', authenticate, firmMember, firmAdmin, firmController.updateMemberRole);

// Üyeyi bürodan çıkar (Sadece kurucu/ortak)
router.delete('/:firmId/members/:userId', authenticate, firmMember, firmAdmin, firmController.removeMember);

// ==================== Şablon Yönetimi (Faz 2) ====================
router.use('/:firmId/templates', authenticate, firmMember, require('./firmTemplates'));

// ==================== CRM Yönetimi ====================
router.use('/:firmId/crm', authenticate, firmMember, require('./crm'));

// ==================== Finans Yönetimi ====================
router.use('/:firmId/finance', authenticate, firmMember, financeRoutes);

router.use('/:firmId/corporate', authenticate, firmMember, corporateRoutes);
module.exports = router;
