import dns from 'dns/promises';
import https from 'https';
import http from 'http';
import { VerificationResult } from '@runway/shared';
import { logger } from '../utils/logger';

class DNSVerifier {
  private cachedServerIp: string | null = null;
  private lastIpFetch: number = 0;
  private readonly IP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

  /**
   * Verify that a domain points to this server
   */
  async verifyDomain(domain: string): Promise<VerificationResult> {
    try {
      // Get server's public IP
      const serverIp = await this.getServerPublicIp();

      // Resolve domain
      const resolvedIps = await this.resolveDomain(domain);

      if (resolvedIps.length === 0) {
        return {
          success: false,
          domain,
          resolvedIps: [],
          serverIp,
          error: 'No DNS records found for domain. Please add an A record pointing to your server IP.',
        };
      }

      // Check if any resolved IP matches the server IP
      const matches = resolvedIps.some(ip => ip === serverIp);

      if (matches) {
        logger.info(`Domain ${domain} verified successfully - points to ${serverIp}`);
        return {
          success: true,
          domain,
          resolvedIps,
          serverIp,
        };
      }

      logger.warn(`Domain ${domain} verification failed - expected ${serverIp}, got ${resolvedIps.join(', ')}`);
      return {
        success: false,
        domain,
        resolvedIps,
        serverIp,
        error: `Domain resolves to ${resolvedIps.join(', ')}, but server IP is ${serverIp}. Please update your DNS A record.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during verification';
      logger.error(`Domain verification failed for ${domain}:`, error);
      return {
        success: false,
        domain,
        resolvedIps: [],
        serverIp: '',
        error: errorMessage,
      };
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
      const request = protocol.get(url, { timeout }, (res) => {
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
