-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (synced with Keycloak)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) CHECK (role IN ('patient', 'provider', 'admin', 'caregiver')),
    profile JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    filename VARCHAR(255),
    storage_path VARCHAR(500),
    storage_bucket VARCHAR(100),
    document_type VARCHAR(50),
    mime_type VARCHAR(100),
    file_size BIGINT,
    ocr_text TEXT,
    ocr_confidence FLOAT,
    encryption_key_id VARCHAR(255),
    content_hash VARCHAR(64),
    blockchain_tx_hash VARCHAR(255),
    blockchain_anchored_at TIMESTAMP,
    fhir_resource_id VARCHAR(255),
    metadata JSONB,
    status VARCHAR(50) DEFAULT 'processing',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Vector embeddings for RAG
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    chunk_text TEXT,
    embedding VECTOR(384),
    chunk_index INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Chat conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    document_id UUID REFERENCES documents(id),
    title VARCHAR(255),
    expert_used VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    role VARCHAR(50) CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT,
    model_used VARCHAR(100),
    tokens_used INTEGER,
    latency_ms INTEGER,
    safety_flags JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Health records (FHIR-compatible)
CREATE TABLE health_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    source_document_id UUID REFERENCES documents(id),
    record_type VARCHAR(100),
    fhir_resource_type VARCHAR(100),
    fhir_resource JSONB,
    effective_date DATE,
    value_numeric FLOAT,
    value_unit VARCHAR(50),
    reference_range_low FLOAT,
    reference_range_high FLOAT,
    is_abnormal BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Access control (supplements blockchain)
CREATE TABLE access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    granted_by UUID REFERENCES users(id),
    granted_to UUID REFERENCES users(id),
    access_level VARCHAR(50),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP
);

-- Blockchain audit log (mirror of chain events)
CREATE TABLE blockchain_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash VARCHAR(255),
    block_number BIGINT,
    event_type VARCHAR(100),
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_health_records_user ON health_records(user_id);
CREATE INDEX idx_health_records_date ON health_records(effective_date);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_embeddings_document ON document_embeddings(document_id);
CREATE INDEX idx_access_grants_document ON access_grants(document_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);

-- Create keycloak database
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak');
