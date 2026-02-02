export interface AuthConfig {
  username: string;
  passwordHash: string;
  jwtSecret: string;
  mustResetPassword?: boolean;
}

export interface UserSession {
  username: string;
  iat: number;
  exp: number;
}
