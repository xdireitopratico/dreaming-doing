import { createClient } from "npm:@supabase/supabase-js@2";

interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  blockedUntil: string | null;
  message: string;
}

interface RateLimitConfig {
  maxRequests?: number;      // Max requests in window (default: 100)
  windowMinutes?: number;    // Time window in minutes (default: 1)
  blockMinutes?: number;     // Block duration in minutes (default: 15)
}

/**
 * Check rate limit for an IP address
 * Returns { allowed, currentCount, blockedUntil, message }
 */
export async function checkRateLimit(
  req: Request,
  functionName: string,
  config: RateLimitConfig = {}
): Promise<RateLimitResult> {
  const {
    maxRequests = 100,
    windowMinutes = 1,
    blockMinutes = 15
  } = config;

  // Get IP from various headers (Cloudflare, proxies, etc.)
  const ip = req.headers.get('cf-connecting-ip') 
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';

  console.log(`[RateLimit] Checking IP: ${ip} for function: ${functionName}`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_ip_address: ip,
      p_function_name: functionName,
      p_max_requests: maxRequests,
      p_window_minutes: windowMinutes,
      p_block_minutes: blockMinutes
    });

    if (error) {
      console.error('[RateLimit] Error checking rate limit:', error);
      // Em caso de erro, permitir (fail open) para não bloquear usuários legítimos
      return {
        allowed: true,
        currentCount: 0,
        blockedUntil: null,
        message: 'Rate limit check failed, allowing request'
      };
    }

    const result = data?.[0] || { allowed: true, current_count: 0, blocked_until: null, message: 'OK' };
    
    console.log(`[RateLimit] Result for ${ip}:`, {
      allowed: result.allowed,
      count: result.current_count,
      blocked: result.blocked_until
    });

    return {
      allowed: result.allowed,
      currentCount: result.current_count,
      blockedUntil: result.blocked_until,
      message: result.message
    };
  } catch (err) {
    console.error('[RateLimit] Exception:', err);
    return {
      allowed: true,
      currentCount: 0,
      blockedUntil: null,
      message: 'Rate limit exception, allowing request'
    };
  }
}

/**
 * Create a rate limit response (429 Too Many Requests)
 */
export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: result.message,
      blockedUntil: result.blockedUntil,
      retryAfter: result.blockedUntil 
        ? Math.ceil((new Date(result.blockedUntil).getTime() - Date.now()) / 1000)
        : 60
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': result.blockedUntil 
          ? Math.ceil((new Date(result.blockedUntil).getTime() - Date.now()) / 1000).toString()
          : '60'
      }
    }
  );
}

/**
 * Helper to wrap an edge function with rate limiting
 * Usage:
 * 
 * import { withRateLimit } from '../_shared/rateLimiter.ts';
 * 
 * serve(withRateLimit(async (req) => {
 *   // Your function logic here
 *   return new Response('OK');
 * }, { maxRequests: 50, windowMinutes: 1 }));
 */
export function withRateLimit(
  handler: (req: Request) => Promise<Response>,
  config: RateLimitConfig & { functionName: string }
) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  return async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(req, config.functionName, config);
    
    if (!rateLimitResult.allowed) {
      console.log(`[RateLimit] Blocked request to ${config.functionName}`);
      return rateLimitResponse(rateLimitResult, corsHeaders);
    }

    // Call the actual handler
    return handler(req);
  };
}
