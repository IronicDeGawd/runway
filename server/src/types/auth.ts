export interface AuthConfig {
  username: string;
  passwordHash: string;
  jwtSecret: string;
}

export interface UserSession {
  username: string;
  iat: number;
  exp: number;
}
