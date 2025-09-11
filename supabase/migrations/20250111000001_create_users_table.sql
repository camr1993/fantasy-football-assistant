-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert some sample data
INSERT INTO users (name, email) VALUES
  ('John Doe', 'john@example.com'),
  ('Jane Smith', 'jane@example.com');
