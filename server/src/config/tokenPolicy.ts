import { SecurityMode } from '@runway/shared';

export interface TokenPolicy {
  maxAge: number; // milliseconds
  type: 'pairing' | 'standard';
  refreshable: boolean;
  requiresRSA: boolean;
}

/**
 * Token policies based on security mode
 *
 * ip-http: Short-lived tokens with RSA encryption (MITM vulnerable)
 * domain-https: Long-lived tokens with direct TLS protection
 */
export const TOKEN_POLICIES: Record<SecurityMode, TokenPolicy> = {
  'ip-http': {
    maxAge: 15 * 60 * 1000,      // 15 minutes
    type: 'pairing',
    refreshable: false,
    requiresRSA: true,           // Must use RSA key exchange
  },
  'domain-https': {
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    type: 'standard',
    refreshable: true,
    requiresRSA: false,          // Direct auth over TLS
  },
};

/**
 * Get token policy for the given security mode
 */
export function getTokenPolicy(mode: SecurityMode): TokenPolicy {
  return TOKEN_POLICIES[mode];
}

/**
 * Calculate token expiration time in seconds (for JWT)
 */
export function getTokenExpirySeconds(mode: SecurityMode): number {
  return TOKEN_POLICIES[mode].maxAge / 1000;
}
