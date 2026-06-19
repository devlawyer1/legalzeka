const InternalMessage = require('../models/InternalMessage');

exports.getMessages = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const messages = await InternalMessage.findByFirmId(firmId, limit, offset);
    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const { icerik } = req.body;

    if (!icerik) {
      return res.status(400).json({ success: false, message: 'Mesaj icerigi bos olamaz.' });
    }

    const newMessage = await InternalMessage.create({
      firmId,
      gonderenId: req.user.id,
      icerik
    });

    // Websocket emit here later
    // req.app.get('io').to(`firm_${firmId}`).emit('new_internal_message', { ...newMessage, first_name: req.user.firstName, last_name: req.user.lastName });

    res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    next(error);
  }
};