class OcrProvider {
  async recognize() {
    throw new Error('OcrProvider.recognize must be implemented.');
  }
}

module.exports = OcrProvider;
