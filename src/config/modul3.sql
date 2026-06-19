CREATE TABLE IF NOT EXISTS petitions (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- Örn: Davacı Dilekçesi, Cevap Dilekçesi, Beyan, vb.
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS petition_comparisons (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
    petition1_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
    petition2_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
    ai_report TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
