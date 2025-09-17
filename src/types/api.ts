// API Response Types
export interface User {
  id: string;
  name: string;
  email?: string;
  created_at?: string;
}

// API Error Response
export interface ApiError {
  error: string;
  message?: string;
}

// Generic API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  success: boolean;
}
