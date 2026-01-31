import { SystemDomain, SystemConfig, SecurityMode, VerificationStatus, VerificationResult } from '@runway/shared';
import { database } from '../services/database';

interface SystemConfigRow {
  id: number;
  domain: string | null;
  domain_verified_at: string | null;
  domain_active: number;
  verification_status: VerificationStatus | null;
  last_checked: string | null;
  failure_reason: string | null;
  server_ip: string | null;
  security_mode: SecurityMode;
  rsa_public_key: string | null;
  rsa_private_key: string | null;
  rsa_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDomain(row: SystemConfigRow): SystemDomain | null {
  if (!row.domain) {
    return null;
  }
  return {
    domain: row.domain,
    verifiedAt: row.domain_verified_at,
    active: row.domain_active === 1,
    verificationStatus: row.verification_status || 'pending',
    lastChecked: row.last_checked,
    failureReason: row.failure_reason || undefined,
  };
}

function rowToConfig(row: SystemConfigRow): SystemConfig {
  return {
    domain: rowToDomain(row) || undefined,
    securityMode: row.security_mode,
    serverIp: row.server_ip || undefined,
  };
}

export class SystemRepository {
  /**
   * Get full system configuration
   */
  getConfig(): SystemConfig {
    const row = database.get<SystemConfigRow>('SELECT * FROM system_config WHERE id = 1');
    if (!row) {
      // Return default config if no row exists
      return {
        securityMode: 'ip-http',
      };
    }
    return rowToConfig(row);
  }

  /**
   * Get current domain configuration
   */
  getDomain(): SystemDomain | null {
    const row = database.get<SystemConfigRow>('SELECT * FROM system_config WHERE id = 1');
    if (!row) {
      return null;
    }
    return rowToDomain(row);
  }

  /**
   * Set domain configuration with verification result
   */
  setDomain(domain: string, verificationResult: VerificationResult): void {
    const now = new Date().toISOString();
    const isVerified = verificationResult.success;
    const verificationStatus: VerificationStatus = isVerified ? 'verified' : 'failed';
    const securityMode: SecurityMode = isVerified ? 'domain-https' : 'ip-http';

    database.run(
      `UPDATE system_config SET
        domain = ?,
        domain_verified_at = ?,
        domain_active = ?,
        verification_status = ?,
        last_checked = ?,
        failure_reason = ?,
        server_ip = ?,
        security_mode = ?,
        updated_at = ?
      WHERE id = 1`,
      [
        domain,
        isVerified ? now : null,
        isVerified ? 1 : 0,
        verificationStatus,
        now,
        verificationResult.error || null,
        verificationResult.serverIp,
        securityMode,
        now,
      ]
    );
  }

  /**
   * Update domain verification status
   */
  updateVerificationStatus(
    status: VerificationStatus,
    failureReason?: string
  ): void {
    const now = new Date().toISOString();
    const isVerified = status === 'verified';
    const securityMode: SecurityMode = isVerified ? 'domain-https' : 'ip-http';

    database.run(
      `UPDATE system_config SET
        domain_verified_at = ?,
        domain_active = ?,
        verification_status = ?,
        last_checked = ?,
        failure_reason = ?,
        security_mode = ?,
        updated_at = ?
      WHERE id = 1`,
      [
        isVerified ? now : null,
        isVerified ? 1 : 0,
        status,
        now,
        failureReason || null,
        securityMode,
        now,
      ]
    );
  }

  /**
   * Clear domain configuration
   */
  clearDomain(): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE system_config SET
        domain = NULL,
        domain_verified_at = NULL,
        domain_active = 0,
        verification_status = NULL,
        last_checked = NULL,
        failure_reason = NULL,
        security_mode = 'ip-http',
        updated_at = ?
      WHERE id = 1`,
      [now]
    );
  }

  /**
   * Get current security mode
   */
  getSecurityMode(): SecurityMode {
    const row = database.get<{ security_mode: SecurityMode }>(
      'SELECT security_mode FROM system_config WHERE id = 1'
    );
    return row?.security_mode || 'ip-http';
  }

  /**
   * Update server IP
   */
  updateServerIp(ip: string): void {
    const now = new Date().toISOString();
    database.run(
      'UPDATE system_config SET server_ip = ?, updated_at = ? WHERE id = 1',
      [ip, now]
    );
  }

  /**
   * Get server IP
   */
  getServerIp(): string | null {
    const row = database.get<{ server_ip: string | null }>(
      'SELECT server_ip FROM system_config WHERE id = 1'
    );
    return row?.server_ip || null;
  }

  /**
   * Store RSA keys for CLI authentication
   */
  setRSAKeys(publicKey: string, privateKey: string): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE system_config SET
        rsa_public_key = ?,
        rsa_private_key = ?,
        rsa_generated_at = ?,
        updated_at = ?
      WHERE id = 1`,
      [publicKey, privateKey, now, now]
    );
  }

  /**
   * Get RSA keys
   */
  getRSAKeys(): { publicKey: string; privateKey: string } | null {
    const row = database.get<{ rsa_public_key: string | null; rsa_private_key: string | null }>(
      'SELECT rsa_public_key, rsa_private_key FROM system_config WHERE id = 1'
    );
    if (!row?.rsa_public_key || !row?.rsa_private_key) {
      return null;
    }
    return {
      publicKey: row.rsa_public_key,
      privateKey: row.rsa_private_key,
    };
  }
}

export const systemRepository = new SystemRepository();
