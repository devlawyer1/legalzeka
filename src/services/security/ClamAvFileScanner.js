const fs = require('node:fs');
const net = require('node:net');
const FileScanner = require('./FileScanner');

class ClamAvFileScanner extends FileScanner {
  constructor({ host = process.env.CLAMAV_HOST || 'clamav', port = Number(process.env.CLAMAV_PORT || 3310), timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS || 30000) } = {}) {
    super(); this.host = host; this.port = port; this.timeoutMs = timeoutMs;
  }

  async scan(filePath) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port }); let response = ''; let completed = false;
      const finish = (error, result) => { if (completed) return; completed = true; socket.destroy(); error ? reject(error) : resolve(result); };
      socket.setTimeout(this.timeoutMs, () => finish(Object.assign(new Error('Antivirus scan timed out.'), { code: 'DEPENDENCY_TIMEOUT' })));
      socket.on('error', (error) => finish(Object.assign(new Error('Antivirus scanner is unavailable.'), { code: 'PROVIDER_UNAVAILABLE', cause: error })));
      socket.on('data', (chunk) => { response += chunk.toString('utf8'); });
      socket.on('close', () => {
        if (completed) return;
        if (/FOUND/.test(response)) finish(null, { clean: false, provider: 'clamav', threat: response.split(':').at(-1).replace('FOUND', '').trim().slice(0, 200) });
        else if (/OK/.test(response)) finish(null, { clean: true, provider: 'clamav' });
        else finish(Object.assign(new Error('Antivirus response was invalid.'), { code: 'PROVIDER_UNAVAILABLE' }));
      });
      socket.on('connect', async () => {
        socket.write('zINSTREAM\0');
        try {
          for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
            const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
          }
          socket.end(Buffer.alloc(4));
        } catch (error) { finish(error); }
      });
    });
  }
}

module.exports = ClamAvFileScanner;
