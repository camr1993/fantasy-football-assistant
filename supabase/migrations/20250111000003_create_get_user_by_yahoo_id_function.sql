-- Create a function to get user by yahoo_id from user_metadata
CREATE OR REPLACE FUNCTION get_user_by_yahoo_id(yahoo_user_id TEXT)
RETURNS TABLE (
  id UUID,
  email VARCHAR(255),
  user_metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data as user_metadata,
    u.created_at,
    u.updated_at
  FROM auth.users u
  WHERE u.raw_user_meta_data->>'yahoo_id' = yahoo_user_id;
END;
$$ LANGUAGE plpgsql;

-- Set appropriate permissions
REVOKE ALL ON FUNCTION get_user_by_yahoo_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_by_yahoo_id TO service_role;
