import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      console.error('❌ Nenhuma imagem enviada');
      return new Response(
        JSON.stringify({ error: 'Imagem não enviada' }),
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
