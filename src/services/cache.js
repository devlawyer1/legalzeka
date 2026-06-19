const { LRUCache } = require('lru-cache');

// 1 saatlik (3600000 ms) TTL ve maksimum 500 öge kapasiteli in-memory cache
const options = {
  max: 500,
  ttl: 1000 * 60 * 60,
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false
};

const cache = new LRUCache(options);

/**
 * Cache middleware'i. 
 * İsteğin URL ve body'sini baz alarak cache key üretir.
 */
function cacheMiddleware(req, res, next) {
  // Sadece GET ve POST isteklerini (Arama ve Semantic arama için) cachele
  if (req.method !== 'GET' && req.method !== 'POST') {
    return next();
  }

  let key = `__express__${req.originalUrl || req.url}`;
  
  if (req.method === 'POST') {
    // Body içindeki sorguyu key'e ekle
    key += `__body__${JSON.stringify(req.body)}`;
  }

  const cachedResponse = cache.get(key);

  if (cachedResponse) {
    // Cache'den dönerken, eğer kullanıcı login ise (req.subscription varsa) 
    // kullanıcıya kendi subscription bilgisini güncel olarak dönmeliyiz.
    // Çünkü cache'teki data ilk arayanın abonelik durumunu içeriyor olabilir.
    const responseData = { ...cachedResponse };
    if (responseData.data && req.subscription) {
       responseData.data.subscription = {
          plan: req.subscription.planName,
          searchLimit: req.subscription.maxSearchLimit,
       };
    }

    return res.status(200).json(responseData);
  } else {
    // Orijinal res.json'ı override ederek dönen veriyi cache'e atıyoruz
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Sadece başarılı cevapları cache'le
      if (body && body.success) {
        cache.set(key, body);
      }
      originalJson(body);
    };
    next();
  }
}

module.exports = { cache, cacheMiddleware };
