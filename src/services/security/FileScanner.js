class FileScanner {
  async scan() {
    throw new Error('FileScanner.scan must be implemented.');
  }
}

module.exports = FileScanner;
