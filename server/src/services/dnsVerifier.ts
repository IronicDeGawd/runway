import dns from 'dns/promises';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { VerificationResult } from '@runway/shared';
import { logger } from '../utils/logger';

class DNSVerifier {
  private cachedServerIp: string | null = null;
  private lastIpFetch: number = 0;
  private readonly IP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // HTTPS challenge tokens: token -> expiry timestamp
  private challengeTokens: Map<string, number> = new Map();

  /**
   * Get the server's public IP address
   * Uses EC2 metadata service first, falls back to external IP services
   */
  async getServerPublicIp(): Promise<string> {
    // Return cached IP if still valid
    const now = Date.now();
    if (this.cachedServerIp && (now - this.lastIpFetch) < this.IP_CACHE_TTL) {
      return this.cachedServerIp;
    }

    // Try EC2 metadata service first (for AWS instances)
    try {
      const ip = await this.fetchUrl('http://169.254.169.254/latest/meta-data/public-ipv4', 2000);
      if (this.isValidIp(ip)) {
        this.cachedServerIp = ip;
        this.lastIpFetch = now;
        logger.debug(`Server IP from EC2 metadata: ${ip}`);
        return ip;
      }
    } catch (error) {
      logger.debug('EC2 metadata service not available, trying external services');
    }

    // Fallback to external IP services
    const ipServices = [
      'https://api.ipify.org',
      'https://ifconfig.me/ip',
      'https://icanhazip.com',
      'https://checkip.amazonaws.com',
    ];

    for (const service of ipServices) {
      try {
        const ip = await this.fetchUrl(service, 5000);
        if (this.isValidIp(ip)) {
          this.cachedServerIp = ip.trim();
          this.lastIpFetch = now;
          logger.debug(`Server IP from ${service}: ${this.cachedServerIp}`);
          return this.cachedServerIp;
        }
      } catch (error) {
        logger.debug(`Failed to get IP from ${service}`);
      }
    }

    throw new Error('Unable to determine server public IP');
  }

  /**
   * Resolve domain A/AAAA records
   */
  async resolveDomain(domain: string): Promise<string[]> {
    const ips: string[] = [];

    // Try A records (IPv4)
    try {
      const ipv4Addresses = await dns.resolve4(domain);
      ips.push(...ipv4Addresses);
    } catch (error) {
      logger.debug(`No A records found for ${domain}`);
    }

    // Try AAAA records (IPv6)
    try {
      const ipv6Addresses = await dns.resolve6(domain);
      ips.push(...ipv6Addresses);
    } catch (error) {
      logger.debug(`No AAAA records found for ${domain}`);
    }

    return ips;
  }

  // ── Challenge token management ────────────────────────────────────────────

  /**
   * Generate a challenge token for HTTPS reachability verification.
   * Token expires after 60 seconds.
   */
  generateChallenge(): string {
    this.cleanExpiredTokens();
    const token = crypto.randomBytes(32).toString('hex');
    this.challengeTokens.set(token, Date.now() + 60_000);
    return token;
  }

  /**
   * Validate a challenge token. Returns true if the token exists and is not expired.
   * Consumes the token on successful validation (one-time use).
   */
  validateChallenge(token: string): boolean {
    const expiry = this.challengeTokens.get(token);
    if (!expiry) return false;
    this.challengeTokens.delete(token);
    return Date.now() < expiry;
  }

  private cleanExpiredTokens(): void {
    const now = Date.now();
    for (const [token, expiry] of this.challengeTokens) {
      if (now >= expiry) this.challengeTokens.delete(token);
    }
  }

  // ── HTTPS reachability check ──────────────────────────────────────────────

  /**
   * Verify domain by making an HTTPS request through it.
   * This supports Cloudflare-proxied and other reverse-proxied domains.
   */
  private async verifyViaHttps(domain: string): Promise<boolean> {
    const token = this.generateChallenge();
    const url = `https://${domain}/api/domain/verify-challenge?token=${token}`;

    logger.info(`Attempting HTTPS reachability challenge for ${domain}`);

    try {
      const body = await this.fetchUrl(url, 10_000);
      const data = JSON.parse(body);
      return data.runway === true && data.token === token;
    } catch (error) {
      logger.debug(`HTTPS challenge failed for ${domain}: ${error instanceof Error ? error.message : error}`);
      // Also try HTTP in case HTTPS isn't set up yet
      try {
        const httpUrl = `http://${domain}/api/domain/verify-challenge?token=${token}`;
        const token2 = this.generateChallenge();
        const httpUrlWithToken = `http://${domain}/api/domain/verify-challenge?token=${token2}`;
        const body = await this.fetchUrl(httpUrlWithToken, 10_000);
        const data = JSON.parse(body);
        return data.runway === true && data.token === token2;
      } catch {
        return false;
      }
    }
  }

  // ── Main verification ─────────────────────────────────────────────────────

  /**
   * Verify that a domain points to this server.
   * Strategy:
   *   1. Fast path: A-record IP match
   *   2. Fallback: HTTPS reachability challenge (supports Cloudflare proxy etc.)
   */
  async verifyDomain(domain: string): Promise<VerificationResult> {
    try {
      const serverIp = await this.getServerPublicIp();
      const resolvedIps = await this.resolveDomain(domain);

      // Fast path: direct IP match
      const ipMatch = resolvedIps.some(ip => ip === serverIp);
      if (ipMatch) {
        logger.info(`Domain ${domain} verified via A-record match → ${serverIp}`);
        return { success: true, domain, resolvedIps, serverIp };
      }

      // Fallback: HTTPS reachability challenge (Cloudflare, reverse proxies)
      logger.info(`IP mismatch for ${domain} (resolved: ${resolvedIps.join(', ')}, server: ${serverIp}). Trying HTTPS challenge...`);
      const reachable = await this.verifyViaHttps(domain);

      if (reachable) {
        logger.info(`Domain ${domain} verified via HTTPS reachability challenge (proxied)`);
        return { success: true, domain, resolvedIps, serverIp };
      }

      // Both methods failed
      const reason = resolvedIps.length === 0
        ? 'No DNS records found for domain. Add an A record pointing to your server IP, or configure your proxy to forward traffic to this server.'
        : `Domain resolves to ${resolvedIps.join(', ')} (not ${serverIp}), and HTTPS reachability check also failed. Ensure your DNS or proxy forwards traffic to this server.`;

      logger.warn(`Domain ${domain} verification failed: ${reason}`);
      return { success: false, domain, resolvedIps, serverIp, error: reason };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during verification';
      logger.error(`Domain verification failed for ${domain}:`, error);
      return { success: false, domain, resolvedIps: [], serverIp: '', error: errorMessage };
    }
  }

  /**
   * Validate domain format
   */
  isValidDomain(domain: string): boolean {
    // Basic domain regex - allows subdomains
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain);
  }

  /**
   * Helper to validate IP address format
   */
  private isValidIp(ip: string): boolean {
    const trimmed = ip.trim();
    // IPv4 regex
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 simplified regex
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
  }

  /**
   * Helper to fetch URL content
   */
  private fetchUrl(url: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const request = protocol.get(url, { timeout, rejectUnauthorized: false }, (res) => {
        // Follow redirects (3xx)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data.trim()));
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Clear cached server IP (useful for testing or when IP changes)
   */
  clearCache(): void {
    this.cachedServerIp = null;
    this.lastIpFetch = 0;
  }
}

export const dnsVerifier = new DNSVerifier();
