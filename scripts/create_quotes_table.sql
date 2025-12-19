-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY,
    client_id UUID NOT NULL,
    code VARCHAR(50),
    name VARCHAR(255),
    estimator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    project_division_ids JSONB,
    order_number VARCHAR(20),
    title VARCHAR(255),
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_estimator_id ON quotes(estimator_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
