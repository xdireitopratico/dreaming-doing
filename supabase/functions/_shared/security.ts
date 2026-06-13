// Security helper functions for edge functions
// Shared module for bot detection, country blocking, and security logging

// Países bloqueados (China e variações)
export const BLOCKED_COUNTRIES = ['CN', 'China', 'CHN', 'HK', 'Hong Kong', 'MO', 'Macau'];

// User-Agents suspeitos (bots, scrapers, headless browsers)
export const SUSPICIOUS_USER_AGENTS = [
  // Headless browsers
  'HeadlessChrome',
  'PhantomJS',
  'Puppeteer',
  'Playwright',
  'Selenium',
  'WebDriver',
  
  // Scrapers conhecidos
  'Scrapy',
  'Python-urllib',
  'python-requests',
  'Go-http-client',
  'Java/',
  'libwww-perl',
  'Wget',
  'curl/',
  'HttpClient',
  'Apache-HttpClient',
  'okhttp',
  
  // Bots maliciosos
  'MJ12bot',
  'AhrefsBot',
  'SemrushBot',
  'DotBot',
  'PetalBot',
  'Bytespider',
  'YandexBot',
  'BaiduSpider',
  'Sogou',
  '360Spider',
  
  // Ferramentas de scanning
  'Nikto',
  'Nmap',
  'sqlmap',
  'masscan',
  'zgrab',
];

// Bots legítimos (permitidos)
export const LEGITIMATE_BOTS = [
  'Googlebot',
  'Bingbot',
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'Slackbot',
  'TelegramBot',
];

/**
 * Verifica se o país está bloqueado baseado nos headers da requisição
 */
export function isBlockedCountry(req: Request): { blocked: boolean; country: string | null } {
  // Headers de CDN que indicam o país
  const countryHeaders = [
    'cf-ipcountry',      // Cloudflare
    'x-country-code',    // Custom CDN
    'x-geo-country',     // Vercel/Edge
    'x-vercel-ip-country', // Vercel
  ];

  for (const header of countryHeaders) {
    const country = req.headers.get(header);
    if (country) {
      const isBlocked = BLOCKED_COUNTRIES.some(
        blocked => country.toUpperCase() === blocked.toUpperCase()
      );
      return { blocked: isBlocked, country };
    }
  }

  return { blocked: false, country: null };
}

/**
 * Verifica se o User-Agent é suspeito (bot/scraper)
 */
export function isSuspiciousUserAgent(userAgent: string | null): { suspicious: boolean; reason: string | null } {
  if (!userAgent || userAgent.length < 10) {
    return { suspicious: true, reason: 'empty_or_short_ua' };
  }

  // Verificar se é um bot legítimo primeiro
  const isLegitimate = LEGITIMATE_BOTS.some(
    bot => userAgent.toLowerCase().includes(bot.toLowerCase())
  );
  if (isLegitimate) {
    return { suspicious: false, reason: null };
  }

  // Verificar se contém User-Agents suspeitos
  for (const suspectUA of SUSPICIOUS_USER_AGENTS) {
    if (userAgent.toLowerCase().includes(suspectUA.toLowerCase())) {
      return { suspicious: true, reason: `matched_${suspectUA.toLowerCase()}` };
    }
  }

  return { suspicious: false, reason: null };
}

/**
 * Obtém o IP do cliente a partir dos headers
 */
export function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('cf-connecting-ip') || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

/**
 * Faz hash simples do IP para anonimização
 */
export function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Registra uma requisição bloqueada no banco de dados
 */
export async function logBlockedRequest(
  supabase: any,
  data: {
    ip: string;
    country: string | null;
    userAgent: string | null;
    reason: string;
    endpoint: string;
    requestPath?: string;
  }
): Promise<void> {
  try {
    await supabase.from('security_blocked_requests').insert({
      ip_address: data.ip.substring(0, 45),
      ip_hash: hashIP(data.ip),
      country: data.country,
      user_agent: data.userAgent?.substring(0, 500),
      block_reason: data.reason,
      endpoint: data.endpoint,
      request_path: data.requestPath,
    });
  } catch (error) {
    console.error('[Security] Failed to log blocked request:', error);
  }
}

/**
 * Resposta padrão para requisições bloqueadas
 */
export function blockedResponse(
  reason: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ 
      error: 'Access denied',
      code: 'BLOCKED',
    }),
    { 
      status: 403, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

/**
 * Middleware completo de segurança
 * Retorna null se a requisição deve prosseguir, ou Response se deve ser bloqueada
 */
export async function securityMiddleware(
  req: Request,
  supabase: any,
  endpoint: string,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const clientIP = getClientIP(req);
  const userAgent = req.headers.get('user-agent');
  
  // 1. Verificar país bloqueado via header
  const { blocked: countryBlocked, country } = isBlockedCountry(req);
  if (countryBlocked) {
    console.log(`[Security] Blocked country access: ${country} from IP ${hashIP(clientIP)}`);
    await logBlockedRequest(supabase, {
      ip: clientIP,
      country,
      userAgent,
      reason: `blocked_country_${country}`,
      endpoint,
      requestPath: new URL(req.url).pathname,
    });
    return blockedResponse('country_blocked', corsHeaders);
  }

  // 2. Verificar User-Agent suspeito
  const { suspicious, reason: uaReason } = isSuspiciousUserAgent(userAgent);
  if (suspicious) {
    console.log(`[Security] Blocked suspicious UA: ${uaReason} from IP ${hashIP(clientIP)}`);
    await logBlockedRequest(supabase, {
      ip: clientIP,
      country,
      userAgent,
      reason: `suspicious_ua_${uaReason}`,
      endpoint,
      requestPath: new URL(req.url).pathname,
    });
    return blockedResponse('suspicious_request', corsHeaders);
  }
  
  // 3. Verificar padrões comportamentais chineses (Accept-Language zh-CN, etc)
  const acceptLang = req.headers.get('accept-language') || '';
  const chineseLanguages = ['zh-cn', 'zh-tw', 'zh-hk', 'zh-sg', 'zh-hans', 'zh-hant'];
  const hasChineseLang = chineseLanguages.some(lang => acceptLang.toLowerCase().includes(lang));
  
  if (hasChineseLang) {
    console.log(`[Security] Blocked Chinese language pattern from IP ${hashIP(clientIP)}, Accept-Language: ${acceptLang}`);
    await logBlockedRequest(supabase, {
      ip: clientIP,
      country: 'CN_LANG_DETECTED',
      userAgent,
      reason: `chinese_language_pattern_${acceptLang.substring(0, 50)}`,
      endpoint,
      requestPath: new URL(req.url).pathname,
    });
    return blockedResponse('country_blocked', corsHeaders);
  }

  // Requisição permitida
  return null;
}
