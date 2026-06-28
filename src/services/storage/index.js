const LocalStorageProvider = require('./LocalStorageProvider');

const storage = new LocalStorageProvider();

module.exports = { LocalStorageProvider, storage };
