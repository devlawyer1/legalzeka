const FileScanner = require('./FileScanner');

class NoopFileScanner extends FileScanner {
  async scan() {
    return { clean: true, provider: 'noop' };
  }
}

module.exports = NoopFileScanner;
