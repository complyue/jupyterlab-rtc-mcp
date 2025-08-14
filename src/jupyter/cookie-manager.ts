/**
 * Cookie management utility for maintaining session cookies
 * across HTTP requests and WebSocket connections to Jupyter server
 */

import { Cookie, CookieJar } from "tough-cookie";

import { logger } from "../utils/logger";

export class CookieManager {
  private cookies: CookieJar;

  constructor() {
    this.cookies = new CookieJar();
  }

  /**
   * Parse cookies from a Set-Cookie header
   * @param setCookieHeader Set-Cookie header value
   */
  parseSetCookieHeader(setCookieHeader: string): void {
    try {
      const cookie = Cookie.parse(setCookieHeader);
      if (cookie) {
        this.cookies.setCookieSync(cookie, "http://localhost");
      } else {
        logger.warn(`Failed to parse cookie from header: ${setCookieHeader}`);
      }
    } catch (error) {
      logger.error(`Error parsing cookie header: ${setCookieHeader}`, error);
    }
  }

  /**
   * Parse cookies from multiple Set-Cookie headers
   * @param headers Response headers containing Set-Cookie
   */
  parseResponseHeaders(headers: Headers): void {
    const setCookieHeaders = headers.get("set-cookie");
    if (setCookieHeaders) {
      // Handle multiple Set-Cookie headers properly
      const cookieHeaders = setCookieHeaders.split("\n");

      cookieHeaders.forEach((header) => {
        const trimmedHeader = header.trim();
        if (trimmedHeader) {
          this.parseSetCookieHeader(trimmedHeader);
        }
      });
    }
  }

  /**
   * Get Cookie header value for requests
   * @returns Cookie header string
   */
  getCookieHeader(): string {
    const headerValue = this.cookies.getCookieStringSync("http://localhost");
    return headerValue;
  }

  /**
   * Check if we have any cookies
   * @returns True if we have cookies
   */
  hasCookies(): boolean {
    const cookies = this.cookies.getCookiesSync("http://localhost");
    return cookies.length > 0;
  }

  /**
   * Clear all cookies
   */
  clear(): void {
    this.cookies.removeAllCookiesSync();
  }
}

// Global cookie manager instance
export const cookieManager = new CookieManager();
