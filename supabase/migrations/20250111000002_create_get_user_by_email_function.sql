-- Create a function to get user by email
CREATE OR REPLACE FUNCTION get_user_by_email(user_email TEXT)
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
  WHERE u.email = user_email;
END;
$$ LANGUAGE plpgsql;

-- Set appropriate permissions
REVOKE ALL ON FUNCTION get_user_by_email FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_by_email TO service_role;
