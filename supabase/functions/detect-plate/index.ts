import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Track requests by IP
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // max requests per minute (plate detection may be frequent)
const RATE_WINDOW = 60000; // per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Check for authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("🚨 Unauthorized request to detect-plate - missing auth header");
    return new Response(
      JSON.stringify({ error: 'Unauthorized - authentication required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // SECURITY: Verify the JWT token
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      console.warn("🚨 Invalid token for detect-plate:", authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}`);
  } catch (authErr) {
    console.error("🚨 Auth verification failed:", authErr);
    return new Response(
      JSON.stringify({ error: 'Unauthorized - authentication failed' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // SECURITY: Rate limiting
  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  if (!checkRateLimit(clientIP)) {
    console.warn(`🚨 Rate limit exceeded for IP: ${clientIP}`);
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded - try again later' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      console.error('❌ Nenhuma imagem enviada');
      return new Response(
        JSON.stringify({ error: 'Imagem não enviada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate image size (max 5MB base64 = ~3.75MB actual)
    if (imageBase64.length > 5 * 1024 * 1024) {
      console.error('❌ Imagem muito grande');
      return new Response(
        JSON.stringify({ error: 'Imagem muito grande - máximo 5MB' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('PLATE_RECOGNIZER_API_KEY');
    
    if (!apiKey) {
      console.error('❌ PLATE_RECOGNIZER_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'API key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📤 Enviando imagem para Plate Recognizer API...');

    // Criar FormData com a imagem em base64
    const formData = new FormData();
    formData.append('upload', `data:image/jpeg;base64,${imageBase64}`);
    formData.append('regions', 'br'); // Região do Brasil

    const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro na API Plate Recognizer:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Erro na API: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('📝 Resposta do Plate Recognizer:', JSON.stringify(data));

    // Extrair a placa da resposta
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const placa = result.plate?.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const confidence = result.score || 0;

      console.log(`✅ Placa detectada: ${placa} (confiança: ${(confidence * 100).toFixed(1)}%)`);

      return new Response(
        JSON.stringify({ 
          placa, 
          confidence,
          raw: result 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('⚠️ Nenhuma placa detectada na imagem');
      return new Response(
        JSON.stringify({ placa: null, message: 'Nenhuma placa detectada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});