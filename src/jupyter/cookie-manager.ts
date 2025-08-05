/**
 * Cookie management utility for maintaining session cookies
 * across HTTP requests and WebSocket connections to Jupyter server
 */

export interface CookieJar {
  [key: string]: string;
}

export class CookieManager {
  private cookies: CookieJar = {};

  /**
   * Parse cookies from a Set-Cookie header
   * @param setCookieHeader Set-Cookie header value
   */
  parseSetCookieHeader(setCookieHeader: string): void {
    const cookieParts = setCookieHeader.split(";");
    const firstPart = cookieParts[0].trim();
    const [name, value] = firstPart.split("=");

    if (name && value) {
      this.cookies[name.trim()] = value.trim();
    }
  }

  /**
   * Parse cookies from multiple Set-Cookie headers
   * @param headers Response headers containing Set-Cookie
   */
  parseResponseHeaders(headers: Headers): void {
    const setCookieHeaders = headers.get("set-cookie");
    if (setCookieHeaders) {
      // Handle multiple Set-Cookie headers
      const cookieHeaders = setCookieHeaders.split(", ");
      cookieHeaders.forEach((header) => this.parseSetCookieHeader(header));
    }
  }

  /**
   * Get Cookie header value for requests
   * @returns Cookie header string
   */
  getCookieHeader(): string {
    const cookieStrings = Object.entries(this.cookies).map(
      ([name, value]) => `${name}=${value}`,
    );
    return cookieStrings.join("; ");
  }

  /**
   * Check if we have any cookies
   * @returns True if we have cookies
   */
  hasCookies(): boolean {
    return Object.keys(this.cookies).length > 0;
  }

  /**
   * Clear all cookies
   */
  clear(): void {
    this.cookies = {};
  }

  /**
   * Get a specific cookie value
   * @param name Cookie name
   * @returns Cookie value or undefined
   */
  getCookie(name: string): string | undefined {
    return this.cookies[name];
  }

  /**
   * Set a cookie value
   * @param name Cookie name
   * @param value Cookie value
   */
  setCookie(name: string, value: string): void {
    this.cookies[name] = value;
  }
}

// Global cookie manager instance
export const cookieManager = new CookieManager();
