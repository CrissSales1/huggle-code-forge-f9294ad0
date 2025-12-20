import z from "zod";

// Esquemas para validação dos dados do sistema

export const VisitanteSchema = z.object({
  id: z.number().optional(),
  nome: z.string().min(1, "Nome é obrigatório"),
  casa_visitada: z.string().min(1, "Casa visitada é obrigatória"),
  placa_veiculo: z.string().min(1, "Placa do veículo é obrigatória"),
  numero_prisma: z.number().optional(),
  estacionar_vaga_morador: z.boolean().default(false),
  observacoes: z.string().optional(),
  liberado_por: z.string().optional(),
  hora_entrada: z.string().optional(),
  hora_saida: z.string().optional(),
  is_ativo: z.boolean().default(true),
});

export const CadastroVisitanteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  casa_visitada: z.string().min(1, "Casa visitada é obrigatória"),
  placa_veiculo: z.string().min(7, "Placa do veículo é obrigatória").max(7, "Placa deve ter 7 caracteres").refine((val) => {
    const placaLimpa = val.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    
    // Formato placa antiga: ABC1234 (3 letras + 4 números)
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    // Formato placa Mercosul: ABC1A23 (3 letras + 1 número + 1 letra + 2 números)
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  }, "Formato de placa inválido. Use ABC1234 ou ABC1A23"),
  numero_prisma: z.number().min(1, "Prisma é obrigatório"),
  estacionar_vaga_morador: z.boolean().default(false),
  observacoes: z.string().optional(),
  liberado_por: z.string().optional(),
});

export const RegistrarSaidaSchema = z.object({
  id: z.number().min(1, "ID do visitante é obrigatório"),
});

export const EditarVisitanteSchema = z.object({
  id: z.number().min(1, "ID do visitante é obrigatório"),
  nome: z.string().min(1, "Nome é obrigatório"),
  casa_visitada: z.string().min(1, "Casa visitada é obrigatória"),
  placa_veiculo: z.string().min(1, "Placa do veículo é obrigatória").refine((val) => {
    const placaLimpa = val.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    
    // Formato placa antiga: ABC1234 (3 letras + 4 números)
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    // Formato placa Mercosul: ABC1A23 (3 letras + 1 número + 1 letra + 2 números)
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  }, "Formato de placa inválido. Use ABC1234 ou ABC1A23"),
  estacionar_vaga_morador: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).optional(),
  observacoes: z.string().optional().nullable(),
  liberado_por: z.string().optional().nullable(),
});

export const ConfiguracoesSistemaSchema = z.object({
  total_vagas_visitantes: z.number().min(1, "Total de vagas deve ser maior que 0"),
  total_prismas_magneticos: z.number().min(1, "Total de prismas deve ser maior que 0"),
});

export const FiltroRelatorioSchema = z.object({
  data_inicial: z.string().optional(),
  data_final: z.string().optional(),
  nome: z.string().optional(),
  casa_visitada: z.string().optional(),
  placa_veiculo: z.string().optional(),
  pagina: z.number().min(1).default(1),
  limite: z.number().min(1).max(1000).default(100),
});

export const PrismaMagneticoSchema = z.object({
  id: z.number(),
  numero: z.number(),
  is_em_uso: z.boolean(),
  visitante_id: z.number().optional(),
});

export const VeiculoMoradorSchema = z.object({
  id: z.number().optional(),
  placa_veiculo: z.string().min(7, "Placa do veículo é obrigatória").max(7, "Placa deve ter 7 caracteres").refine((val) => {
    const placaLimpa = val.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  }, "Formato de placa inválido. Use ABC1234 ou ABC1A23"),
  casa: z.string().min(1, "Casa é obrigatória"),
});

export const CadastroVeiculoMoradorSchema = z.object({
  placa_veiculo: z.string().min(7, "Placa do veículo é obrigatória").max(7, "Placa deve ter 7 caracteres").refine((val) => {
    const placaLimpa = val.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placaLimpa.length !== 7) return false;
    
    const formatoAntigo = /^[A-Z]{3}[0-9]{4}$/;
    const formatoMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    
    return formatoAntigo.test(placaLimpa) || formatoMercosul.test(placaLimpa);
  }, "Formato de placa inválido. Use ABC1234 ou ABC1A23"),
  casa: z.string().min(1, "Casa é obrigatória"),
});

// Tipos derivados dos esquemas
export type VisitanteType = z.infer<typeof VisitanteSchema>;
export type CadastroVisitanteType = z.infer<typeof CadastroVisitanteSchema>;
export type RegistrarSaidaType = z.infer<typeof RegistrarSaidaSchema>;
export type EditarVisitanteType = z.infer<typeof EditarVisitanteSchema>;
export type ConfiguracoesSistemaType = z.infer<typeof ConfiguracoesSistemaSchema>;
export type FiltroRelatorioType = z.infer<typeof FiltroRelatorioSchema>;
export type PrismaMagneticoType = z.infer<typeof PrismaMagneticoSchema>;
export type VeiculoMoradorType = z.infer<typeof VeiculoMoradorSchema>;
export type CadastroVeiculoMoradorType = z.infer<typeof CadastroVeiculoMoradorSchema>;

// Tipos para estatísticas do dashboard
export interface DashboardStats {
  vagas_visitantes_disponiveis: number;
  prismas_magneticos_disponiveis: number;
  total_visitantes_ativos: number;
}

export interface VisitanteAtivo extends VisitanteType {
  tempo_permanencia_horas: number;
  alerta_permanencia_prolongada: boolean;
}

export interface RelatorioResultado {
  visitantes: VisitanteType[];
  total_registros: number;
  pagina_atual: number;
  total_paginas: number;
  limite_por_pagina: number;
}
