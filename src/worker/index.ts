import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import {
  CadastroVisitanteSchema,
  RegistrarSaidaSchema,
  EditarVisitanteSchema,
  ConfiguracoesSistemaSchema,
  FiltroRelatorioSchema,
  CadastroVeiculoMoradorSchema,
  type VisitanteType,
  type VisitanteAtivo,
  type DashboardStats,
  type ConfiguracoesSistemaType,
  type PrismaMagneticoType,
  type VeiculoMoradorType,
} from "@/shared/types";

type Env = CloudflareBindings & {
  REKOR_SCOUT_WEBHOOK_TOKEN?: string;
  REKOR_SCOUT_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Middleware CORS
app.use("/*", cors());

// Health check endpoint
app.get("/api/health", async (c) => {
  try {
    const db = c.env?.DB;
    let dbStatus = "unknown";
    
    if (db) {
      try {
        await db.prepare("SELECT 1").first();
        dbStatus = "connected";
      } catch (err) {
        dbStatus = "error";
      }
    } else {
      dbStatus = "not_available";
    }
    
    return c.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      environment: "development",
      database: dbStatus,
      bindings: {
        DB: !!c.env?.DB,
        R2_BUCKET: !!c.env?.R2_BUCKET,
        REKOR_SCOUT_WEBHOOK_TOKEN: !!(c.env as any).REKOR_SCOUT_WEBHOOK_TOKEN
      }
    });
  } catch (error) {
    return c.json({ 
      status: "error", 
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Utilitário para formatar data/hora no timezone do Brasil
const formatDateTime = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const getBrasiliaDateTime = () => {
  return formatDateTime(new Date());
};

const parseDateTime = (dateTimeStr: string) => {
  const isoString = dateTimeStr.replace(' ', 'T') + '-03:00';
  return new Date(isoString);
};

// Helper function para validação de placa brasileira
const isValidPlaca = (text: string): boolean => {
  if (!text) return false;
  const normalized = text.replace(/[^A-Z0-9]/g, '').toUpperCase();
  if (normalized.length !== 7) return false;
  const oldPattern = /^[A-Z]{3}[0-9]{4}$/;
  const newPattern = /^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$/;
  return oldPattern.test(normalized) || newPattern.test(normalized);
};

// ENDPOINT DE RECONHECIMENTO DE PLACAS VIA PLATE RECOGNIZER (usado no cadastro)
app.post("/api/vision/detect-plate", async (c) => {
  try {
    const body = await c.req.json();
    const { imageBase64 } = body;
    
    if (!imageBase64) {
      return c.json({ error: "Imagem não fornecida" }, 400);
    }
    
    const plateRecognizerApiKey = c.env.PLATE_RECOGNIZER_API_KEY;
    
    if (!plateRecognizerApiKey) {
      console.error('❌ API Key do Plate Recognizer não configurada.');
      return c.json({ 
        error: "Plate Recognizer não configurado",
        details: "Configure a secret PLATE_RECOGNIZER_API_KEY no painel do Mocha"
      }, 500);
    }
    
    console.log('📸 Enviando imagem para Plate Recognizer API...');
    
    try {
      const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${plateRecognizerApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload: imageBase64,
          regions: ['br'],
        }),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Erro da API do Plate Recognizer (${response.status}):`, errorData);
        return c.json({ 
          error: "Erro no serviço de reconhecimento de placas",
          details: errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`
        }, response.status);
      }
      
      const plateRecognizerResult = await response.json() as any;
      console.log('📝 Resposta do Plate Recognizer:', JSON.stringify(plateRecognizerResult, null, 2));
      
      let detectedPlate: string | null = null;
      let confidence: number | undefined = undefined;
      
      // Parse da resposta do Plate Recognizer
      // Formato: { results: [{ plate: "ABC1234", score: 0.95, region: { code: "br" } }] }
      if (plateRecognizerResult.results && Array.isArray(plateRecognizerResult.results) && plateRecognizerResult.results.length > 0) {
        const bestResult = plateRecognizerResult.results[0];
        if (bestResult.plate) {
          const rawPlate = bestResult.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
          confidence = bestResult.score;
          
          if (isValidPlaca(rawPlate)) {
            detectedPlate = rawPlate;
            console.log(`✅ PLACA VÁLIDA RECONHECIDA: ${detectedPlate} (Confiança: ${confidence ? (confidence * 100).toFixed(1) + '%' : 'N/A'})`);
          } else {
            console.log(`⚠️ Placa detectada mas formato inválido: ${rawPlate}`);
          }
        }
      }
      
      if (!detectedPlate) {
        console.log(`❌ Nenhuma placa válida detectada na imagem`);
      }
      
      return c.json({ 
        placa: detectedPlate,
        success: !!detectedPlate,
        debug_info: {
          provider: 'Plate Recognizer',
          confidence: confidence ? (confidence * 100).toFixed(1) + '%' : 'N/A',
          raw_response_keys: Object.keys(plateRecognizerResult)
        }
      });
      
    } catch (fetchError) {
      console.error("❌ Erro na requisição ao Plate Recognizer:", fetchError);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return c.json({ 
          error: "Timeout na requisição",
          details: "O serviço de reconhecimento demorou muito para responder (mais de 30 segundos)"
        }, 504);
      }
      
      return c.json({ 
        error: "Falha na comunicação com o serviço de reconhecimento",
        details: fetchError instanceof Error ? fetchError.message : String(fetchError)
      }, 500);
    }
    
  } catch (error) {
    console.error("❌ Erro crítico no reconhecimento de placa:", error);
    return c.json({ 
      error: "Erro ao processar imagem",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// WEBHOOK DO REKOR SCOUT - Recebe detecções de placas
app.post("/api/rekorscout/webhook", async (c) => {
  try {
    console.log('🎯 WEBHOOK REKOR SCOUT CHAMADO!');
    console.log('📅 Timestamp:', new Date().toISOString());
    console.log('🔍 Headers:', JSON.stringify(Object.fromEntries(c.req.raw.headers.entries())));
    
    // Autenticação opcional do webhook
    const incomingToken = c.req.header('X-Rekor-Token') || c.req.header('Authorization')?.replace('Bearer ', '');
    if (c.env.REKOR_SCOUT_WEBHOOK_TOKEN && incomingToken !== c.env.REKOR_SCOUT_WEBHOOK_TOKEN) {
      console.warn('❌ Requisição de webhook não autorizada ou token inválido.');
      return c.json({ error: "Unauthorized" }, 401);
    }
    
    const payload = await c.req.json();
    console.log('📝 Payload recebido do Rekor Scout:', JSON.stringify(payload, null, 2));

    let detectedPlate: string | null = null;
    let confidence: number | undefined = undefined;

    // Tentar extrair placa de diferentes formatos possíveis do Rekor Scout
    // Formato 1: payload.results[0].plate
    if (payload.results && Array.isArray(payload.results) && payload.results.length > 0) {
      const bestResult = payload.results[0];
      if (bestResult.plate) {
        detectedPlate = bestResult.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        confidence = bestResult.score || bestResult.confidence;
      }
    } 
    // Formato 2: payload.lpr_data.plate
    else if (payload.lpr_data && payload.lpr_data.plate) {
      detectedPlate = payload.lpr_data.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      confidence = payload.lpr_data.confidence || payload.lpr_data.score;
    }
    // Formato 3: payload.plate (direto)
    else if (payload.plate) {
      detectedPlate = payload.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      confidence = payload.confidence || payload.score;
    }
    // Formato 4: payload.license_plate
    else if (payload.license_plate) {
      detectedPlate = payload.license_plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      confidence = payload.confidence || payload.score;
    }

    if (detectedPlate && isValidPlaca(detectedPlate)) {
      console.log(`✅ PLACA VÁLIDA RECEBIDA: ${detectedPlate} (Confiança: ${confidence ? (confidence * 100).toFixed(1) + '%' : 'N/A'})`);
      
      const db = c.env.DB;
      const agora = getBrasiliaDateTime();

      // Verificar se é morador
      const veiculoMorador = await db
        .prepare("SELECT casa FROM veiculos_moradores WHERE placa_veiculo = ?")
        .bind(detectedPlate)
        .first() as { casa: string } | null;

      // Salvar detecção
      await db
        .prepare(`
          INSERT INTO lpr_deteccoes (placa_detectada, timestamp, is_morador, casa_morador, confidence, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          detectedPlate,
          agora,
          veiculoMorador ? 1 : 0,
          veiculoMorador?.casa || null,
          confidence || null,
          agora
        )
        .run();

      console.log(`💾 Detecção salva no banco: ${detectedPlate} - Morador: ${!!veiculoMorador}`);

      return c.json({ 
        success: true, 
        message: "Placa processada com sucesso", 
        placa: detectedPlate,
        is_morador: !!veiculoMorador,
        casa: veiculoMorador?.casa || null
      });
    } else {
      console.warn(`⚠️ Placa recebida (${detectedPlate}) mas não é válida ou não detectada.`);
      console.warn('📝 Estrutura do payload:', Object.keys(payload));
      return c.json({ 
        success: false, 
        message: "Placa inválida ou não detectada no payload",
        debug: {
          payload_keys: Object.keys(payload),
          detected_value: detectedPlate
        }
      }, 200);
    }
  } catch (error) {
    console.error("❌ Erro ao processar webhook do Rekor Scout:", error);
    return c.json({ 
      error: "Erro interno do servidor ao processar webhook",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Endpoint para buscar a última detecção LPR
app.get("/api/lpr/latest-detection", async (c) => {
  try {
    const db = c.env.DB;
    
    const deteccao = await db
      .prepare(`
        SELECT * FROM lpr_deteccoes 
        ORDER BY timestamp DESC 
        LIMIT 1
      `)
      .first() as any;
    
    if (!deteccao) {
      return c.json(null);
    }

    return c.json({
      placa: deteccao.placa_detectada,
      morador: deteccao.is_morador ? {
        id: deteccao.id,
        placa_veiculo: deteccao.placa_detectada,
        casa: deteccao.casa_morador
      } : null,
      timestamp: deteccao.timestamp,
      confidence: deteccao.confidence
    });
  } catch (error) {
    console.error("Erro ao buscar última detecção:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para buscar histórico de detecções
app.get("/api/lpr/detections", async (c) => {
  try {
    const db = c.env.DB;
    const limite = parseInt(c.req.query("limite") || "10");
    
    const deteccoes = await db
      .prepare(`
        SELECT * FROM lpr_deteccoes 
        ORDER BY timestamp DESC 
        LIMIT ?
      `)
      .bind(limite)
      .all() as { results: any[] };
    
    const resultado = deteccoes.results.map(det => ({
      placa: det.placa_detectada,
      morador: det.is_morador ? {
        id: det.id,
        placa_veiculo: det.placa_detectada,
        casa: det.casa_morador
      } : null,
      timestamp: det.timestamp,
      confidence: det.confidence
    }));

    return c.json(resultado);
  } catch (error) {
    console.error("Erro ao buscar detecções:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para limpar histórico de detecções
app.delete("/api/lpr/detections", async (c) => {
  try {
    const db = c.env.DB;
    await db.prepare("DELETE FROM lpr_deteccoes").run();
    return c.json({ success: true, message: "Histórico de detecções limpo com sucesso" });
  } catch (error) {
    console.error("Erro ao limpar detecções:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para obter estatísticas do dashboard
app.get("/api/dashboard/stats", async (c) => {
  try {
    const db = c.env?.DB;
    
    if (!db) {
      return c.json({
        vagas_visitantes_disponiveis: 10,
        prismas_magneticos_disponiveis: 20,
        total_visitantes_ativos: 0,
      });
    }
    
    let config: ConfiguracoesSistemaType;
    
    try {
      config = await db
        .prepare("SELECT total_vagas_visitantes, total_prismas_magneticos FROM configuracoes_sistema LIMIT 1")
        .first() as ConfiguracoesSistemaType;
    } catch (dbError) {
      config = {
        total_vagas_visitantes: 10,
        total_prismas_magneticos: 20
      };
    }
    
    if (!config) {
      config = {
        total_vagas_visitantes: 10,
        total_prismas_magneticos: 20
      };
    }
    
    let visitantesOcupandoVagas = { count: 0 };
    let prismasEmUso = { count: 0 };
    let totalVisitantesAtivos = { count: 0 };
    
    try {
      visitantesOcupandoVagas = await db
        .prepare("SELECT COUNT(*) as count FROM visitantes WHERE is_ativo = 1 AND estacionar_vaga_morador = 0")
        .first() as { count: number };
      
      prismasEmUso = await db
        .prepare("SELECT COUNT(*) as count FROM prismas_magneticos WHERE is_em_uso = 1")
        .first() as { count: number };
      
      totalVisitantesAtivos = await db
        .prepare("SELECT COUNT(*) as count FROM visitantes WHERE is_ativo = 1")
        .first() as { count: number };
    } catch (countError) {
      console.error("Erro ao contar dados no banco:", countError);
    }
    
    const stats: DashboardStats = {
      vagas_visitantes_disponiveis: config.total_vagas_visitantes - visitantesOcupandoVagas.count,
      prismas_magneticos_disponiveis: config.total_prismas_magneticos - prismasEmUso.count,
      total_visitantes_ativos: totalVisitantesAtivos.count,
    };
    
    return c.json(stats);
  } catch (error) {
    console.error("Erro ao obter estatísticas:", error);
    return c.json({ 
      error: "Erro interno do servidor", 
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Endpoint para obter visitantes ativos
app.get("/api/visitantes/ativos", async (c) => {
  try {
    const db = c.env?.DB;
    
    if (!db) {
      return c.json([]);
    }
    
    const visitantes = await db
      .prepare(`
        SELECT v.*, p.numero as numero_prisma
        FROM visitantes v
        LEFT JOIN prismas_magneticos p ON p.visitante_id = v.id
        WHERE v.is_ativo = 1
        ORDER BY v.hora_entrada DESC
      `)
      .all() as { results: (VisitanteType & { numero_prisma?: number })[] };
    
    const visitantesAtivos: VisitanteAtivo[] = visitantes.results.map(visitante => {
      const agora = new Date();
      const horaEntradaStr = visitante.hora_entrada!;
      const horaEntrada = parseDateTime(horaEntradaStr);
      const tempoPermanenciaMs = agora.getTime() - horaEntrada.getTime();
      const tempoPermanenciaHoras = Math.max(0, tempoPermanenciaMs / (1000 * 60 * 60));
      
      return {
        ...visitante,
        numero_prisma: visitante.numero_prisma,
        tempo_permanencia_horas: tempoPermanenciaHoras,
        alerta_permanencia_prolongada: tempoPermanenciaHoras > 24,
      };
    });
    
    return c.json(visitantesAtivos);
  } catch (error) {
    console.error("Erro ao obter visitantes ativos:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para obter prismas disponíveis
app.get("/api/prismas/disponiveis", async (c) => {
  try {
    const db = c.env?.DB;
    
    if (!db) {
      const defaultPrismas = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        numero: i + 1,
        is_em_uso: false,
        visitante_id: undefined
      }));
      return c.json(defaultPrismas);
    }
    
    const prismas = await db
      .prepare("SELECT * FROM prismas_magneticos WHERE is_em_uso = 0 ORDER BY numero")
      .all() as { results: PrismaMagneticoType[] };
    
    return c.json(prismas.results);
  } catch (error) {
    console.error("Erro ao obter prismas disponíveis:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para cadastrar visitante
app.post("/api/visitantes", zValidator("json", CadastroVisitanteSchema), async (c) => {
  try {
    const db = c.env.DB;
    const data = c.req.valid("json");
    const agora = getBrasiliaDateTime();
    
    const prisma = await db
      .prepare("SELECT * FROM prismas_magneticos WHERE numero = ? AND is_em_uso = 0")
      .bind(data.numero_prisma)
      .first();
    
    if (!prisma) {
      return c.json({ error: "Prisma não disponível" }, 400);
    }
    
    const resultado = await db
      .prepare(`
        INSERT INTO visitantes (nome, casa_visitada, placa_veiculo, numero_prisma, estacionar_vaga_morador, observacoes, liberado_por, hora_entrada, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(data.nome, data.casa_visitada, data.placa_veiculo, data.numero_prisma, data.estacionar_vaga_morador ? 1 : 0, data.observacoes || null, data.liberado_por || null, agora, agora)
      .run();
    
    const visitanteId = resultado.meta.last_row_id;
    
    await db
      .prepare("UPDATE prismas_magneticos SET is_em_uso = 1, visitante_id = ? WHERE numero = ?")
      .bind(visitanteId, data.numero_prisma)
      .run();
    
    return c.json({ success: true, id: visitanteId });
  } catch (error) {
    console.error("Erro ao cadastrar visitante:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para registrar saída de visitante
app.post("/api/visitantes/saida", zValidator("json", RegistrarSaidaSchema), async (c) => {
  try {
    const db = c.env.DB;
    const data = c.req.valid("json");
    const agora = getBrasiliaDateTime();
    
    await db
      .prepare("UPDATE visitantes SET is_ativo = 0, hora_saida = ?, updated_at = ? WHERE id = ?")
      .bind(agora, agora, data.id)
      .run();
    
    await db
      .prepare("UPDATE prismas_magneticos SET is_em_uso = 0, visitante_id = NULL WHERE visitante_id = ?")
      .bind(data.id)
      .run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao registrar saída:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para editar dados de visitante
app.put("/api/visitantes/:id", async (c) => {
  try {
    const db = c.env.DB;
    const rawData = await c.req.json();
    const agora = getBrasiliaDateTime();
    
    let data;
    try {
      data = EditarVisitanteSchema.parse(rawData);
    } catch (validationError) {
      if (validationError && typeof validationError === 'object' && 'issues' in validationError) {
        const issues = (validationError as any).issues;
        const errorMessages = issues.map((issue: any) => {
          const path = issue.path.join('.');
          return `${path ? path + ': ' : ''}${issue.message}`;
        });
        return c.json({ 
          error: `Dados inválidos: ${errorMessages.join('; ')}`,
          validation_errors: issues
        }, 400);
      }
      return c.json({ error: "Dados inválidos" }, 400);
    }
    
    const visitanteExistente = await db
      .prepare("SELECT * FROM visitantes WHERE id = ?")
      .bind(data.id)
      .first();
    
    if (!visitanteExistente) {
      return c.json({ error: "Visitante não encontrado" }, 404);
    }
    
    const visitanteTyped = visitanteExistente as any;
    const estacionarVagaMoradorAtual = Boolean(visitanteTyped.estacionar_vaga_morador);
    
    const dadosFinais = {
      nome: data.nome,
      casa_visitada: data.casa_visitada,
      placa_veiculo: data.placa_veiculo,
      estacionar_vaga_morador: data.estacionar_vaga_morador !== undefined ? Boolean(data.estacionar_vaga_morador) : estacionarVagaMoradorAtual,
      observacoes: data.observacoes !== undefined ? data.observacoes : visitanteTyped.observacoes,
      liberado_por: data.liberado_por !== undefined ? data.liberado_por : visitanteTyped.liberado_por
    };
    
    const resultado = await db
      .prepare("UPDATE visitantes SET nome = ?, casa_visitada = ?, placa_veiculo = ?, estacionar_vaga_morador = ?, observacoes = ?, liberado_por = ?, updated_at = ? WHERE id = ?")
      .bind(
        dadosFinais.nome, 
        dadosFinais.casa_visitada, 
        dadosFinais.placa_veiculo, 
        dadosFinais.estacionar_vaga_morador ? 1 : 0, 
        dadosFinais.observacoes || null, 
        dadosFinais.liberado_por || null, 
        agora, 
        data.id
      )
      .run();
    
    if (resultado.meta.changes === 0) {
      return c.json({ error: "Nenhuma alteração foi feita" }, 400);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao editar visitante:", error);
    return c.json({ 
      error: "Erro ao editar visitante",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Endpoint para buscar visitantes existentes
app.get("/api/visitantes/buscar", async (c) => {
  try {
    const db = c.env.DB;
    const termo = c.req.query("termo") || "";
    
    if (termo.length < 2) {
      return c.json([]);
    }
    
    const visitantes = await db
      .prepare(`
        SELECT DISTINCT nome, casa_visitada, placa_veiculo, observacoes, liberado_por
        FROM visitantes
        WHERE nome LIKE ? OR placa_veiculo LIKE ?
        ORDER BY updated_at DESC
        LIMIT 10
      `)
      .bind(`%${termo}%`, `%${termo}%`)
      .all() as { results: VisitanteType[] };
    
    return c.json(visitantes.results);
  } catch (error) {
    console.error("Erro ao buscar visitantes:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para obter relatórios
app.post("/api/relatorios", zValidator("json", FiltroRelatorioSchema), async (c) => {
  try {
    const db = c.env.DB;
    const filtros = c.req.valid("json");
    
    let countSql = "SELECT COUNT(*) as total FROM visitantes v WHERE 1=1";
    let sql = "SELECT v.* FROM visitantes v WHERE 1=1";
    
    const params: any[] = [];
    const countParams: any[] = [];
    
    if (filtros.data_inicial) {
      sql += " AND DATE(v.hora_entrada) >= ?";
      countSql += " AND DATE(v.hora_entrada) >= ?";
      params.push(filtros.data_inicial);
      countParams.push(filtros.data_inicial);
    }
    
    if (filtros.data_final) {
      sql += " AND DATE(v.hora_entrada) <= ?";
      countSql += " AND DATE(v.hora_entrada) <= ?";
      params.push(filtros.data_final);
      countParams.push(filtros.data_final);
    }
    
    if (filtros.nome) {
      sql += " AND v.nome LIKE ?";
      countSql += " AND v.nome LIKE ?";
      params.push(`%${filtros.nome}%`);
      countParams.push(`%${filtros.nome}%`);
    }
    
    if (filtros.casa_visitada) {
      sql += " AND v.casa_visitada LIKE ?";
      countSql += " AND v.casa_visitada LIKE ?";
      params.push(`%${filtros.casa_visitada}%`);
      countParams.push(`%${filtros.casa_visitada}%`);
    }
    
    if (filtros.placa_veiculo) {
      sql += " AND v.placa_veiculo LIKE ?";
      countSql += " AND v.placa_veiculo LIKE ?";
      params.push(`%${filtros.placa_veiculo}%`);
      countParams.push(`%${filtros.placa_veiculo}%`);
    }
    
    const totalResult = await db
      .prepare(countSql)
      .bind(...countParams)
      .first() as { total: number };
    
    const totalRegistros = totalResult.total || 0;
    const limite = filtros.limite || 100;
    const pagina = filtros.pagina || 1;
    const offset = (pagina - 1) * limite;
    const totalPaginas = Math.ceil(totalRegistros / limite);
    
    sql += " ORDER BY v.hora_entrada DESC LIMIT ? OFFSET ?";
    params.push(limite, offset);
    
    const visitantes = await db
      .prepare(sql)
      .bind(...params)
      .all() as { results: VisitanteType[] };
    
    return c.json({
      visitantes: visitantes.results,
      total_registros: totalRegistros,
      pagina_atual: pagina,
      total_paginas: totalPaginas,
      limite_por_pagina: limite,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para obter configurações
app.get("/api/configuracoes", async (c) => {
  try {
    const db = c.env.DB;
    
    const config = await db
      .prepare("SELECT * FROM configuracoes_sistema LIMIT 1")
      .first() as ConfiguracoesSistemaType;
    
    if (!config) {
      return c.json({ error: "Configurações não encontradas" }, 404);
    }
    
    return c.json(config);
  } catch (error) {
    console.error("Erro ao obter configurações:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para atualizar configurações
app.put("/api/configuracoes", zValidator("json", ConfiguracoesSistemaSchema), async (c) => {
  try {
    const db = c.env.DB;
    const data = c.req.valid("json");
    const agora = getBrasiliaDateTime();
    
    const configAtual = await db
      .prepare("SELECT total_prismas_magneticos FROM configuracoes_sistema LIMIT 1")
      .first() as { total_prismas_magneticos: number } | null;
    
    if (!configAtual) {
      return c.json({ error: "Configurações não encontradas" }, 404);
    }
    
    await db
      .prepare("UPDATE configuracoes_sistema SET total_vagas_visitantes = ?, total_prismas_magneticos = ?, updated_at = ?")
      .bind(data.total_vagas_visitantes, data.total_prismas_magneticos, agora)
      .run();
    
    if (configAtual.total_prismas_magneticos !== data.total_prismas_magneticos) {
      const prismasExistentes = await db
        .prepare("SELECT numero FROM prismas_magneticos ORDER BY numero")
        .all() as { results: Array<{ numero: number }> };
      
      const numerosExistentes = prismasExistentes.results.map(p => p.numero);
      const totalAtual = numerosExistentes.length;
      
      if (data.total_prismas_magneticos > totalAtual) {
        const prismasParaCriar = data.total_prismas_magneticos - totalAtual;
        const proximoNumero = numerosExistentes.length > 0 ? Math.max(...numerosExistentes) + 1 : 1;
        
        for (let i = 0; i < prismasParaCriar; i++) {
          await db
            .prepare("INSERT INTO prismas_magneticos (numero, created_at, updated_at) VALUES (?, ?, ?)")
            .bind(proximoNumero + i, agora, agora)
            .run();
        }
      } else if (data.total_prismas_magneticos < totalAtual) {
        const prismasParaRemover = totalAtual - data.total_prismas_magneticos;
        const prismasLivres = await db
          .prepare("SELECT numero FROM prismas_magneticos WHERE is_em_uso = 0 ORDER BY numero DESC LIMIT ?")
          .bind(prismasParaRemover)
          .all() as { results: Array<{ numero: number }> };
        
        for (const prisma of prismasLivres.results) {
          await db
            .prepare("DELETE FROM prismas_magneticos WHERE numero = ? AND is_em_uso = 0")
            .bind(prisma.numero)
            .run();
        }
      }
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para estatísticas detalhadas
app.get("/api/estatisticas", async (c) => {
  try {
    const db = c.env.DB;
    const periodo = c.req.query("periodo") || "30";
    const diasAtras = parseInt(periodo);
    
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasAtras);
    const dataInicioStr = formatDateTime(dataInicio).split(' ')[0];
    
    const totalVisitantes = await db
      .prepare("SELECT COUNT(*) as count FROM visitantes WHERE DATE(hora_entrada) >= ?")
      .bind(dataInicioStr)
      .first() as { count: number };

    const mediaPorDia = Math.round(totalVisitantes.count / diasAtras);

    const tempoMedioQuery = await db
      .prepare(`
        SELECT AVG(
          CASE 
            WHEN hora_saida IS NOT NULL THEN 
              (julianday(hora_saida) - julianday(hora_entrada)) * 24
            ELSE 
              (julianday('now', 'localtime') - julianday(hora_entrada)) * 24
          END
        ) as tempo_medio
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
      `)
      .bind(dataInicioStr)
      .first() as { tempo_medio: number };

    const tempoMedioHoras = tempoMedioQuery.tempo_medio || 0;
    const tempoMedioPermanencia = `${Math.floor(tempoMedioHoras)}h${Math.floor((tempoMedioHoras % 1) * 60)}min`;

    const configQuery = await db
      .prepare("SELECT total_vagas_visitantes FROM configuracoes_sistema LIMIT 1")
      .first() as { total_vagas_visitantes: number };
    
    const totalVagas = configQuery?.total_vagas_visitantes || 10;
    const taxaOcupacaoMedia = Math.round((totalVisitantes.count / (diasAtras * totalVagas)) * 100);

    const visitantesPorDia = await db
      .prepare(`
        SELECT DATE(hora_entrada) as data, COUNT(*) as visitantes
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        GROUP BY DATE(hora_entrada)
        ORDER BY data
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ data: string; visitantes: number }> };

    const horariosPico = await db
      .prepare(`
        SELECT CAST(strftime('%H', hora_entrada) AS INTEGER) as hora, COUNT(*) as visitantes
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        GROUP BY hora
        ORDER BY hora
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ hora: number; visitantes: number }> };

    const distribuicaoTempo = await db
      .prepare(`
        SELECT 
          CASE 
            WHEN (julianday(COALESCE(hora_saida, datetime('now', 'localtime'))) - julianday(hora_entrada)) * 24 < 1 THEN '0-1h'
            WHEN (julianday(COALESCE(hora_saida, datetime('now', 'localtime'))) - julianday(hora_entrada)) * 24 < 2 THEN '1-2h'
            WHEN (julianday(COALESCE(hora_saida, datetime('now', 'localtime'))) - julianday(hora_entrada)) * 24 < 4 THEN '2-4h'
            WHEN (julianday(COALESCE(hora_saida, datetime('now', 'localtime'))) - julianday(hora_entrada)) * 24 < 8 THEN '4-8h'
            WHEN (julianday(COALESCE(hora_saida, datetime('now', 'localtime'))) - julianday(hora_entrada)) * 24 < 24 THEN '8-24h'
            ELSE '24h+'
          END as faixa,
          COUNT(*) as quantidade
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        GROUP BY faixa
        ORDER BY quantidade DESC
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ faixa: string; quantidade: number }> };

    const visitantesPorDiaSemana = await db
      .prepare(`
        SELECT 
          CASE strftime('%w', hora_entrada)
            WHEN '0' THEN 'Dom'
            WHEN '1' THEN 'Seg'
            WHEN '2' THEN 'Ter'
            WHEN '3' THEN 'Qua'
            WHEN '4' THEN 'Qui'
            WHEN '5' THEN 'Sex'
            WHEN '6' THEN 'Sáb'
          END as dia,
          COUNT(*) as visitantes
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        GROUP BY strftime('%w', hora_entrada)
        ORDER BY strftime('%w', hora_entrada)
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ dia: string; visitantes: number }> };

    const visitantesRecorrentes = await db
      .prepare(`
        SELECT nome, casa_visitada, COUNT(*) as total_visitas
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        GROUP BY nome, casa_visitada
        HAVING COUNT(*) > 1
        ORDER BY total_visitas DESC
        LIMIT 5
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ nome: string; casa_visitada: string; total_visitas: number }> };

    const maiorTempoPermanencia = await db
      .prepare(`
        SELECT 
          nome,
          casa_visitada,
          hora_entrada,
          CASE 
            WHEN hora_saida IS NOT NULL THEN 
              (julianday(hora_saida) - julianday(hora_entrada)) * 24
            ELSE 
              (julianday(datetime('now', '-3 hours')) - julianday(hora_entrada)) * 24
          END as horas,
          CASE 
            WHEN hora_saida IS NOT NULL THEN 
              CASE
                WHEN (julianday(hora_saida) - julianday(hora_entrada)) * 24 < 0.017 THEN 
                  CAST(((julianday(hora_saida) - julianday(hora_entrada)) * 24 * 60) AS INTEGER) || 'min'
                ELSE
                  printf('%dh%02dmin', 
                    CAST((julianday(hora_saida) - julianday(hora_entrada)) * 24 AS INTEGER),
                    CAST(((julianday(hora_saida) - julianday(hora_entrada)) * 24 * 60) % 60 AS INTEGER)
                  )
              END
            ELSE 
              CASE
                WHEN (julianday(datetime('now', '-3 hours')) - julianday(hora_entrada)) * 24 < 0.017 THEN 
                  CAST(((julianday(datetime('now', '-3 hours')) - julianday(hora_entrada)) * 24 * 60) AS INTEGER) || 'min'
                ELSE
                  printf('%dh%02dmin', 
                    CAST((julianday(datetime('now', '-3 hours')) - julianday(hora_entrada)) * 24 AS INTEGER),
                    CAST(((julianday(datetime('now', '-3 hours')) - julianday(hora_entrada)) * 24 * 60) % 60 AS INTEGER)
                  )
              END
          END as tempo_permanencia
        FROM visitantes 
        WHERE DATE(hora_entrada) >= ?
        ORDER BY horas DESC
        LIMIT 5
      `)
      .bind(dataInicioStr)
      .all() as { results: Array<{ nome: string; casa_visitada: string; hora_entrada: string; tempo_permanencia: string }> };

    const alertasQuery = await db
      .prepare(`
        SELECT nome, hora_entrada, casa_visitada
        FROM visitantes 
        WHERE is_ativo = 1 
        AND (julianday('now', 'localtime') - julianday(hora_entrada)) * 24 > 24
      `)
      .all() as { results: Array<{ nome: string; hora_entrada: string; casa_visitada: string }> };

    const alertas = alertasQuery.results.map(visitante => ({
      titulo: `Permanência prolongada detectada`,
      descricao: `${visitante.nome} está há mais de 24 horas no condomínio`,
      detalhes: `Casa: ${visitante.casa_visitada} | Entrada: ${new Date(visitante.hora_entrada).toLocaleString('pt-BR')}`
    }));

    const estatisticas = {
      totalVisitantes: totalVisitantes.count,
      mediaPorDia,
      tempoMedioPermanencia,
      taxaOcupacaoMedia: Math.min(taxaOcupacaoMedia, 100),
      visitantesPorDia: visitantesPorDia.results,
      horariosPico: horariosPico.results,
      distribuicaoTempo: distribuicaoTempo.results.map(item => ({
        name: item.faixa,
        quantidade: item.quantidade
      })),
      visitantesPorDiaSemana: visitantesPorDiaSemana.results,
      visitantesRecorrentes: visitantesRecorrentes.results,
      maiorTempoPermanencia: maiorTempoPermanencia.results,
      alertas: alertas
    };

    return c.json(estatisticas);
  } catch (error) {
    console.error("Erro ao obter estatísticas:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoint para limpar banco de dados
app.delete("/api/dados", async (c) => {
  try {
    const db = c.env.DB;
    await db.prepare("DELETE FROM visitantes").run();
    await db.prepare("DELETE FROM lpr_deteccoes").run();
    await db.prepare("UPDATE prismas_magneticos SET is_em_uso = 0, visitante_id = NULL").run();
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao limpar banco de dados:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// Endpoints de veículos de moradores
app.post("/api/moradores/veiculos", zValidator("json", CadastroVeiculoMoradorSchema), async (c) => {
  try {
    const db = c.env.DB;
    const data = c.req.valid("json");
    const agora = getBrasiliaDateTime();
    
    const veiculoExistente = await db
      .prepare("SELECT * FROM veiculos_moradores WHERE placa_veiculo = ?")
      .bind(data.placa_veiculo)
      .first();
    
    if (veiculoExistente) {
      return c.json({ error: "Esta placa já está cadastrada" }, 400);
    }
    
    const resultado = await db
      .prepare("INSERT INTO veiculos_moradores (placa_veiculo, casa, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(data.placa_veiculo, data.casa, agora, agora)
      .run();
    
    return c.json({ success: true, id: resultado.meta.last_row_id });
  } catch (error) {
    console.error("Erro ao cadastrar veículo de morador:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

app.get("/api/moradores/veiculos", async (c) => {
  try {
    const db = c.env.DB;
    const veiculos = await db
      .prepare("SELECT * FROM veiculos_moradores ORDER BY casa, placa_veiculo")
      .all() as { results: VeiculoMoradorType[] };
    return c.json(veiculos.results);
  } catch (error) {
    console.error("Erro ao listar veículos de moradores:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

app.get("/api/moradores/verificar", async (c) => {
  try {
    const db = c.env.DB;
    const placa = c.req.query("placa");
    
    if (!placa) {
      return c.json({ error: "Placa não fornecida" }, 400);
    }
    
    const veiculo = await db
      .prepare("SELECT * FROM veiculos_moradores WHERE placa_veiculo = ?")
      .bind(placa.toUpperCase())
      .first() as VeiculoMoradorType | null;
    
    return c.json({ 
      morador: veiculo,
      is_morador: !!veiculo 
    });
  } catch (error) {
    console.error("Erro ao verificar veículo:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

app.put("/api/moradores/veiculos/:id", zValidator("json", CadastroVeiculoMoradorSchema), async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const agora = getBrasiliaDateTime();
    
    const veiculoExistente = await db
      .prepare("SELECT * FROM veiculos_moradores WHERE id = ?")
      .bind(id)
      .first();
    
    if (!veiculoExistente) {
      return c.json({ error: "Veículo não encontrado" }, 404);
    }
    
    const placaEmUso = await db
      .prepare("SELECT * FROM veiculos_moradores WHERE placa_veiculo = ? AND id != ?")
      .bind(data.placa_veiculo, id)
      .first();
    
    if (placaEmUso) {
      return c.json({ error: "Esta placa já está cadastrada em outro veículo" }, 400);
    }
    
    await db
      .prepare("UPDATE veiculos_moradores SET placa_veiculo = ?, casa = ?, updated_at = ? WHERE id = ?")
      .bind(data.placa_veiculo, data.casa, agora, id)
      .run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao editar veículo de morador:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

app.delete("/api/moradores/veiculos/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");
    
    const veiculoExistente = await db
      .prepare("SELECT * FROM veiculos_moradores WHERE id = ?")
      .bind(id)
      .first();
    
    if (!veiculoExistente) {
      return c.json({ error: "Veículo não encontrado" }, 404);
    }
    
    await db
      .prepare("DELETE FROM veiculos_moradores WHERE id = ?")
      .bind(id)
      .run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir veículo de morador:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

export default app;
