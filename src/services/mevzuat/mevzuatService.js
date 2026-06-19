const bedestenClient = require('./bedestenClient');
const govTrClient = require('./govTrClient');

class MevzuatService {
  /**
   * Search mevzuat.
   * Uses Bedesten Client as primary (fast), falls back to GovTr Client if needed.
   */
  async searchDocuments({
    query = '',
    mevzuatAdi = '',
    mevzuatNo = null,
    mevzuatTur = null, // Can be array for bedesten, string for govtr
    basliktaAra = true,
    tamCumle = false,
    resmiGazeteTarihiStart = null,
    resmiGazeteTarihiEnd = null,
    page = 1,
    pageSize = 25
  }) {
    try {
      // Try Bedesten API first
      console.log(`[MevzuatService] Searching in Bedesten for: ${query || mevzuatAdi}`);
      const mevzuatTurList = Array.isArray(mevzuatTur) ? mevzuatTur : (mevzuatTur ? [mevzuatTur] : null);
      
      const bedestenResults = await bedestenClient.searchDocuments({
        phrase: query,
        mevzuatAdi,
        mevzuatNo,
        mevzuatTurList,
        basliktaAra,
        tamCumle,
        resmiGazeteTarihiStart,
        resmiGazeteTarihiEnd,
        page,
        pageSize
      });

      if (bedestenResults.documents && bedestenResults.documents.length > 0) {
        return {
          source: 'bedesten',
          ...bedestenResults
        };
      }
    } catch (error) {
      console.warn(`[MevzuatService] Bedesten search failed or returned 0 results. Falling back to GovTr. Error: ${error.message}`);
    }

    // Fallback to GovTr API
    console.log(`[MevzuatService] Searching in GovTr for: ${query || mevzuatAdi}`);
    try {
      const govTrResults = await govTrClient.searchDocuments({
        aranacakIfade: query || mevzuatAdi,
        mevzuatTur: Array.isArray(mevzuatTur) ? mevzuatTur[0] : (mevzuatTur || 'Kanun'),
        tamCumle,
        aranacakYer: basliktaAra ? 'Baslik' : 'BaslikIcerik',
        mevzuatNo: mevzuatNo || '',
        baslangicTarihi: resmiGazeteTarihiStart || '',
        bitisTarihi: resmiGazeteTarihiEnd || '',
        pageNumber: page,
        pageSize
      });

      return {
        source: 'govTr',
        ...govTrResults
      };
    } catch (error) {
      console.error(`[MevzuatService] Both Bedesten and GovTr searches failed. Error: ${error.message}`);
      throw new Error('Search failed across all mevzuat sources.');
    }
  }

  /**
   * Get full text of a mevzuat.
   */
  async getDocumentContent(mevzuatId, mevzuatTur, mevzuatTertip, resmiGazeteTarihi) {
    try {
      console.log(`[MevzuatService] Getting content from Bedesten for ID: ${mevzuatId}`);
      // Bedesten ID is usually required. If we only have mevzuatNo, Bedesten might fail if ID is different,
      // but if we got it from Bedesten search, it should be the correct Bedesten ID.
      const bedestenContent = await bedestenClient.getDocumentContent(mevzuatId);
      if (bedestenContent && bedestenContent.content) {
        return {
          source: 'bedesten',
          ...bedestenContent,
          markdownContent: bedestenClient.stripHtml(bedestenContent.content)
        };
      }
    } catch (error) {
      console.warn(`[MevzuatService] Bedesten getDocumentContent failed. Falling back to GovTr. Error: ${error.message}`);
    }

    // Fallback to GovTr API
    console.log(`[MevzuatService] Getting content from GovTr for No: ${mevzuatId}`);
    try {
      const govTrContent = await govTrClient.getContent(mevzuatId, mevzuatTur, mevzuatTertip, resmiGazeteTarihi);
      return {
        source: 'govTr',
        ...govTrContent,
        markdownContent: govTrContent.content
      };
    } catch (error) {
      console.error(`[MevzuatService] Both Bedesten and GovTr content fetching failed.`);
      throw new Error('Content fetch failed across all mevzuat sources.');
    }
  }

  /**
   * Get specific article content
   */
  async getArticleContent(maddeId) {
    // Bedesten specific
    return await bedestenClient.getArticleContent(maddeId);
  }

  /**
   * Get article tree / table of contents
   */
  async getArticleTree(mevzuatId) {
    // Bedesten specific
    return await bedestenClient.getArticleTree(mevzuatId);
  }

  /**
   * Get law rationale (gerekçe)
   */
  async getGerekceContent(gerekceId) {
    // Bedesten specific
    return await bedestenClient.getGerekceContent(gerekceId);
  }
}

module.exports = new MevzuatService();
