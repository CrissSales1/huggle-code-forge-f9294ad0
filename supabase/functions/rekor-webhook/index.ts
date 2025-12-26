import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Webhook recebido do Rekor Scout');
    console.log('Method:', req.method);
    console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));

    // Ler o body da requisição
    const body = await req.json();
    console.log('📝 Body recebido:', JSON.stringify(body));

    // Ignorar heartbeats silenciosamente
    if (body.data_type === 'heartbeat') {
      console.log('💓 Heartbeat recebido, ignorando...');
      return new Response(
        JSON.stringify({ success: true, message: 'Heartbeat recebido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extrair dados da placa - suporta múltiplos formatos
    let placa = '';
    let confidence = 0;
    let formatoDetectado = '';
    let timestampReal: string | null = null; // Timestamp real da detecção (quando disponível)

    // ========== FORMATO SECOND TUBE (INSTANTÂNEO) ==========
    // Dados enviados diretamente do Rekor Scout local via upload_second_tube_post_url
    // Este formato é o mais rápido - detecção instantânea sem agrupamento
    
    // Formato 1: alpr_results do Second Tube (INSTANTÂNEO - prioridade máxima)
    if (body.data_type === 'alpr_results' && body.results && Array.isArray(body.results) && body.results.length > 0) {
      const result = body.results[0];
      placa = result?.plate || '';
      confidence = result?.confidence || 0;
      formatoDetectado = '⚡ SECOND TUBE - alpr_results (instantâneo)';
      
      // Usar epoch_time do resultado para timestamp real
      if (result?.epoch_time) {
        timestampReal = new Date(result.epoch_time).toISOString();
        console.log(`⏱️ Timestamp real da detecção: ${timestampReal}`);
      }
    }
    // Formato 2: results array sem data_type (Second Tube alternativo)
    else if (!body.data_type && body.results && Array.isArray(body.results) && body.results.length > 0) {
      const result = body.results[0];
      placa = result.plate || result.candidates?.[0]?.plate || '';
      confidence = result.score || result.confidence || result.candidates?.[0]?.confidence || 0;
      formatoDetectado = '⚡ SECOND TUBE - results array (instantâneo)';
      
      // Usar epoch_time se disponível
      if (result?.epoch_time) {
        timestampReal = new Date(result.epoch_time).toISOString();
      }
    }
    
    // ========== FORMATO REKOR CLOUD (AGRUPADO - COM DELAY) ==========
    // Dados enviados pelo Rekor Scout Cloud após agrupamento
    
    // Formato 3: Rekor Scout Cloud com alpr_group
    else if (body.data_type === 'alpr_group') {
      // Primeiro tenta best_plate_number (campo principal no alpr_group)
      if (body.best_plate_number && typeof body.best_plate_number === 'string') {
        placa = body.best_plate_number;
        confidence = body.best_confidence || 0;
        formatoDetectado = '☁️ CLOUD - alpr_group (agrupado)';
      }
      // Fallback para best_plate.plate se best_plate_number não existir
      else if (body.best_plate) {
        if (typeof body.best_plate === 'object' && body.best_plate !== null) {
          placa = body.best_plate.plate || '';
          confidence = body.best_plate.confidence || body.best_confidence || 0;
        } else if (typeof body.best_plate === 'string') {
          placa = body.best_plate;
          confidence = body.best_confidence || 0;
        }
        formatoDetectado = '☁️ CLOUD - alpr_group/best_plate';
      }
      
      // Usar epoch_start para timestamp real da PRIMEIRA detecção do grupo
      if (body.epoch_start) {
        timestampReal = new Date(body.epoch_start).toISOString();
        console.log(`⏱️ Timestamp real (epoch_start): ${timestampReal}`);
      }
    }
    
    // ========== FORMATOS ALTERNATIVOS ==========
    
    // Formato 4: Formato direto com plate
    else if (body.plate && typeof body.plate === 'string') {
      placa = body.plate;
      confidence = body.score || body.confidence || 0;
      formatoDetectado = 'plate direto';
      
      if (body.epoch_time) {
        timestampReal = new Date(body.epoch_time).toISOString();
      }
    }
    // Formato 5: best_plate como objeto (sem alpr_group)
    else if (body.best_plate) {
      if (typeof body.best_plate === 'object' && body.best_plate !== null) {
        placa = body.best_plate.plate || '';
        confidence = body.best_plate.confidence || body.confidence || 0;
      } else if (typeof body.best_plate === 'string') {
        placa = body.best_plate;
        confidence = body.confidence || 0;
      }
      formatoDetectado = 'best_plate';
    }

    console.log(`📋 Formato detectado: ${formatoDetectado || 'desconhecido'}`);
    console.log(`📋 Data type: ${body.data_type || 'não especificado'}`);

    // Validar que placa é string antes de processar
    if (typeof placa !== 'string') {
      placa = String(placa || '');
    }

    // Normalizar placa (remover espaços e caracteres especiais, uppercase)
    placa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

    console.log(`🔍 Placa extraída: ${placa}, Confiança: ${confidence}`);

    if (!placa) {
      console.log('⚠️ Nenhuma placa encontrada no payload');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Nenhuma placa encontrada no payload',
          received: body 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Conectar ao Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar tempo de deduplicação configurado
    let tempoDeduplicacaoSegundos = 30; // valor padrão
    const { data: config, error: configError } = await supabase
      .from('configuracoes_sistema')
      .select('tempo_deduplicacao_segundos')
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.warn('⚠️ Erro ao buscar configuração, usando padrão de 30s:', configError.message);
    } else if (config?.tempo_deduplicacao_segundos) {
      tempoDeduplicacaoSegundos = config.tempo_deduplicacao_segundos;
      console.log(`⚙️ Tempo de deduplicação configurado: ${tempoDeduplicacaoSegundos}s`);
    }

    // DEDUPLICAÇÃO: Verificar se já detectou essa placa no período configurado
    const tempoDeduplicacao = tempoDeduplicacaoSegundos * 1000; // converter para ms
    const timestampLimite = new Date(Date.now() - tempoDeduplicacao).toISOString();
    
    console.log(`🔍 Verificando duplicatas para placa ${placa} desde ${timestampLimite}...`);
    
    const { data: deteccaoRecente, error: dedupeError } = await supabase
      .from('lpr_deteccoes')
      .select('id, timestamp')
      .eq('placa_detectada', placa)
      .gte('timestamp', timestampLimite)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dedupeError) {
      console.error('⚠️ Erro ao verificar duplicatas:', dedupeError);
      // Continua mesmo com erro na verificação
    }

    if (deteccaoRecente) {
      const tempoDecorrido = Math.round((Date.now() - new Date(deteccaoRecente.timestamp).getTime()) / 1000);
      console.log(`⏭️ Placa ${placa} já detectada há ${tempoDecorrido}s (limite: ${tempoDeduplicacaoSegundos}s), ignorando duplicata...`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Detecção duplicada ignorada (mesma placa nos últimos ${tempoDeduplicacaoSegundos}s)`,
          placa: placa,
          deteccao_anterior_id: deteccaoRecente.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se é morador
    console.log('🔎 Verificando se placa é de morador...');
    const { data: veiculoMorador, error: veiculoError } = await supabase
      .from('veiculos_moradores')
      .select('*')
      .eq('placa_veiculo', placa)
      .maybeSingle();

    if (veiculoError) {
      console.error('❌ Erro ao buscar veículo:', veiculoError);
    }

    const isMorador = !!veiculoMorador;
    const casaMorador = veiculoMorador?.casa || null;

    console.log(`📋 Resultado: É morador? ${isMorador}, Casa: ${casaMorador}`);

    // Salvar detecção no banco - usar timestamp real se disponível
    const timestampFinal = timestampReal || new Date().toISOString();
    console.log(`⏱️ Timestamp a salvar: ${timestampFinal} (real: ${!!timestampReal})`);
    
    const deteccao = {
      placa_detectada: placa,
      confidence: confidence,
      timestamp: timestampFinal,
      is_morador: isMorador,
      casa_morador: casaMorador,
    };

    console.log('💾 Salvando detecção:', JSON.stringify(deteccao));

    const { data: insertedData, error: insertError } = await supabase
      .from('lpr_deteccoes')
      .insert(deteccao)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao salvar detecção:', insertError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Erro ao salvar detecção', 
          error: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Detecção salva com sucesso:', JSON.stringify(insertedData));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Detecção processada com sucesso',
        placa: placa,
        is_morador: isMorador,
        casa: casaMorador,
        id: insertedData.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
