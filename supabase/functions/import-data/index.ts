import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: Track requests by IP
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5; // max requests
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // SECURITY: Check for authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("🚨 Unauthorized request to import-data - missing auth header");
    return new Response(JSON.stringify({
      success: false,
      error: "Unauthorized - authentication required",
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // SECURITY: Verify the JWT token
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      console.warn("🚨 Invalid token for import-data:", authError?.message);
      return new Response(JSON.stringify({
        success: false,
        error: "Unauthorized - invalid token",
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Authenticated user: ${user.email}`);
  } catch (authErr) {
    console.error("🚨 Auth verification failed:", authErr);
    return new Response(JSON.stringify({
      success: false,
      error: "Unauthorized - authentication failed",
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // SECURITY: Rate limiting
  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  if (!checkRateLimit(clientIP)) {
    console.warn(`🚨 Rate limit exceeded for IP: ${clientIP}`);
    return new Response(JSON.stringify({
      success: false,
      error: "Rate limit exceeded - try again later",
    }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Função para normalizar números de casa
  const normalizarNumeroCasa = (valor: string): string => {
    if (!valor) return valor;
    
    const valorTrimmed = valor.trim().toUpperCase();
    
    // Se for apenas um dígito de 1-9, adiciona zero à esquerda
    if (/^[1-9]$/.test(valorTrimmed)) {
      return `0${valorTrimmed}`;
    }
    
    // Se tiver formato "CASA X", "APT X", etc. com um dígito, normaliza
    const match = valorTrimmed.match(/^(CASA|APT|APTO|APARTAMENTO|BLOCO|BL)\s*([1-9])$/i);
    if (match) {
      return `${match[1]} 0${match[2]}`;
    }
    
    // Se terminar com espaço + um dígito de 1-9, normaliza
    const matchFinal = valorTrimmed.match(/^(.+\s)([1-9])$/);
    if (matchFinal) {
      return `${matchFinal[1]}0${matchFinal[2]}`;
    }
    
    return valorTrimmed;
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tabelas } = await req.json();

    const results = {
      visitantes: { inserted: 0, errors: [] as string[] },
      veiculos_moradores: { inserted: 0, errors: [] as string[] },
    };

    // Importar visitantes
    if (tabelas.visitantes && tabelas.visitantes.length > 0) {
      console.log(`📥 Importando ${tabelas.visitantes.length} visitantes...`);
      
      // Processar em lotes de 100
      const batchSize = 100;
      for (let i = 0; i < tabelas.visitantes.length; i += batchSize) {
        const batch = tabelas.visitantes.slice(i, i + batchSize).map((v: any) => ({
          nome: v.nome,
          casa_visitada: normalizarNumeroCasa(v.casa_visitada),
          placa_veiculo: v.placa_veiculo,
          numero_prisma: v.numero_prisma,
          estacionar_vaga_morador: v.estacionar_vaga_morador === 1 || v.estacionar_vaga_morador === true,
          hora_entrada: v.hora_entrada,
          hora_saida: v.hora_saida,
          is_ativo: v.is_ativo === 1 || v.is_ativo === true,
          observacoes: v.observacoes,
          liberado_por: v.liberado_por,
          created_at: v.created_at,
          updated_at: v.updated_at,
        }));

        const { error } = await supabase
          .from("visitantes")
          .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

        if (error) {
          console.error(`❌ Erro no lote ${i / batchSize + 1}:`, error.message);
          results.visitantes.errors.push(`Lote ${i / batchSize + 1}: ${error.message}`);
        } else {
          results.visitantes.inserted += batch.length;
          console.log(`✅ Lote ${i / batchSize + 1} importado (${batch.length} registros)`);
        }
      }
    }

    // Importar veiculos_moradores
    if (tabelas.veiculos_moradores && tabelas.veiculos_moradores.length > 0) {
      console.log(`📥 Importando ${tabelas.veiculos_moradores.length} veículos de moradores...`);
      
      for (const v of tabelas.veiculos_moradores) {
        const { error } = await supabase
          .from("veiculos_moradores")
          .upsert({
            placa_veiculo: v.placa_veiculo,
            casa: normalizarNumeroCasa(v.casa),
            created_at: v.created_at,
            updated_at: v.updated_at,
          }, { onConflict: "id", ignoreDuplicates: false });

        if (error) {
          console.error(`❌ Erro ao importar veículo ${v.placa_veiculo}:`, error.message);
          results.veiculos_moradores.errors.push(`${v.placa_veiculo}: ${error.message}`);
        } else {
          results.veiculos_moradores.inserted++;
        }
      }
    }

    console.log("📊 Resultado da importação:", results);

    return new Response(JSON.stringify({
      success: true,
      message: "Importação concluída",
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("❌ Erro na importação:", errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
