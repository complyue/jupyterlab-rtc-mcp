/**
 * Cookie management utility for maintaining session cookies
 * across HTTP requests and WebSocket connections to Jupyter server
 */

import { Cookie, CookieJar } from "tough-cookie";

import { logger } from "../utils/logger.js";

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
   * Get session headers including cookies and XSRF token
   * @returns Headers object with Cookie and X-XSRFToken if available
   */
  sessionHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Add cookies if available
    const cookieHeader = this.cookies.getCookieStringSync("http://localhost");
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    // Add XSRF token if available
    const cookies = this.cookies.getCookiesSync("http://localhost");
    const xsrfCookie = cookies.find((cookie) => cookie.key === "_xsrf");
    if (xsrfCookie) {
      headers["X-XSRFToken"] = xsrfCookie.value;
    }

    return headers;
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
