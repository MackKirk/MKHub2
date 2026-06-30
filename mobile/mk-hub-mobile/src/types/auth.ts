export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface MeUser {
  id: string;
  username: string;
  email: string;
  is_active?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  roles?: string[];
}

export interface MeResponse {
  id: string;
  username: string;
  email_personal: string;
  email_corporate?: string | null;
  roles: string[];
  permissions: string[];
}

export interface MeProfile {
  first_name?: string | null;
  last_name?: string | null;
}

export interface MeProfileResponse {
  user: MeUser;
  profile: MeProfile | null;
}


