// JWT parsing utility
export function parseJwt(token: string) {
  if (!token) {
    console.error('No token provided to parseJwt');
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format - expected 3 parts, got', parts.length);
      return null;
    }

    const payload = parts[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    console.error('Token that failed to parse:', token);
    return null;
  }
}
