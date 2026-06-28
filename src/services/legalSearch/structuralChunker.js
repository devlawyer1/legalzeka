const { normalizeTurkish, sha256 } = require('./normalization');

const HEADING_RULES = [
  { pattern: /^(olay(?:lar)?|maddi olay)\s*:?[\s]*$/i, type: 'FACTS' },
  { pattern: /^(özet|ozet)\s*:?[\s]*$/i, type: 'SUMMARY' },
  { pattern: /^(gerekçe|gerekce)\s*:?[\s]*$/i, type: 'REASONING' },
  { pattern: /^(hukuki değerlendirme|hukuki degerlendirme|değerlendirme|degerlendirme)\s*:?[\s]*$/i, type: 'LEGAL_ASSESSMENT' },
  { pattern: /^(hüküm|hukum|sonuç|sonuc)\s*:?[\s]*$/i, type: 'RULING' },
  { pattern: /^(karşı oy|karsi oy|muhalefet şerhi|muhalefet serhi)\s*:?[\s]*$/i, type: 'DISSENT' },
  { pattern: /^(dipnot(?:lar)?)\s*:?[\s]*$/i, type: 'FOOTNOTE' },
];

const ARTICLE_PATTERN = /^\s*((?:geçici|gecici)\s+)?madde\s+([0-9]+(?:\/[A-Za-z0-9]+)?[A-Za-z]?)\s*[-–.:]?\s*(.*)$/i;

function splitOversizedSection(section, maxChars) {
  if (section.content.length <= maxChars) return [section];

  const paragraphs = section.content.split(/\n\s*\n/).filter(Boolean);
  const parts = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      parts.push({ ...section, content: current.trim() });
      current = '';
    }
    if (paragraph.length <= maxChars) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }

    if (current) parts.push({ ...section, content: current.trim() });
    current = '';
    for (let offset = 0; offset < paragraph.length; offset += maxChars) {
      parts.push({ ...section, content: paragraph.slice(offset, offset + maxChars).trim() });
    }
  }
  if (current) parts.push({ ...section, content: current.trim() });
  return parts.filter((part) => part.content);
}

function detectHeading(line) {
  const article = line.match(ARTICLE_PATTERN);
  if (article) {
    return {
      type: article[1] ? 'TRANSITIONAL_ARTICLE' : 'LEGISLATION_ARTICLE',
      heading: line.trim(),
      articleNumber: article[2],
      inlineContent: article[3] || '',
    };
  }
  const normalized = normalizeTurkish(line);
  const rule = HEADING_RULES.find((entry) => entry.pattern.test(normalized));
  return rule ? { type: rule.type, heading: line.trim(), articleNumber: null, inlineContent: '' } : null;
}

function structuralChunk(text, { maxChars = 6000 } = {}) {
  const normalizedText = String(text || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!normalizedText) return [];

  const sections = [];
  let current = { type: 'GENERAL', heading: null, articleNumber: null, content: '' };
  for (const line of normalizedText.split('\n')) {
    const heading = detectHeading(line);
    if (heading) {
      if (current.content.trim()) sections.push({ ...current, content: current.content.trim() });
      current = {
        type: heading.type,
        heading: heading.heading,
        articleNumber: heading.articleNumber,
        content: heading.inlineContent,
      };
      continue;
    }
    current.content = current.content ? `${current.content}\n${line}` : line;
  }
  if (current.content.trim()) sections.push({ ...current, content: current.content.trim() });

  return sections
    .flatMap((section) => splitOversizedSection(section, maxChars))
    .map((section, index) => {
      const contentHash = sha256(section.content);
      return {
        ...section,
        chunkIndex: index,
        contentHash,
        fingerprint: sha256([
          section.type,
          section.articleNumber || '',
          section.heading || '',
          contentHash,
        ].join('|')),
      };
    });
}

function extractLegalCitations(text) {
  const source = String(text || '');
  const patterns = [
    {
      regex: /\b(\d{3,5})\s+sayılı\s+([^\n.;]{0,100}?(?:Kanun|Kanunu|Yasa|Yasası))[^\n.;]{0,80}?\b(\d+(?:\/[A-Za-z0-9]+)?[A-Za-z]?)\.?\s*(?:madde(?:si|sinin)?)/giu,
      map: (match) => ({ lawNumber: match[1], lawName: match[2].trim(), articleNumber: match[3] }),
    },
    {
      regex: /\b(\d{3,5})\s+sayılı\s+([^\n.;]{0,100}?(?:Kanun|Kanunu|Yasa|Yasası))[^\n.;]{0,80}?\b(?:madde(?:si|sinin)?|m\.)\s*(\d+(?:\/[A-Za-z0-9]+)?[A-Za-z]?)/giu,
      map: (match) => ({ lawNumber: match[1], lawName: match[2].trim(), articleNumber: match[3] }),
    },
    {
      regex: /\b([A-ZÇĞİÖŞÜ]{2,8})\s+(?:m\.|madde)\s*(\d+(?:\/[A-Za-z0-9]+)?[A-Za-z]?)/gu,
      map: (match) => ({ lawNumber: null, lawName: match[1], articleNumber: match[2] }),
    },
  ];
  const citations = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern.regex)) {
      const citationText = match[0];
      const { lawNumber, lawName, articleNumber } = pattern.map(match);
      citations.push({
        lawName,
        lawNumber,
        articleNumber,
        citationText,
        citationHash: sha256(normalizeTurkish(citationText)),
      });
    }
  }
  return [...new Map(citations.map((citation) => [citation.citationHash, citation])).values()];
}

module.exports = { extractLegalCitations, structuralChunk };
