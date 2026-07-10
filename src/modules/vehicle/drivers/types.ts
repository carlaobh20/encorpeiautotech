/**
 * Um "driver" descreve como extrair dados de um veículo específico.
 * Adicionar suporte a BYD, Volvo, BMW etc. = criar um novo arquivo
 * de driver. Nenhum outro código muda.
 */

export interface PidDefinition {
  mode: string;   // ex.: '01' (dados atuais), '22' (proprietário UDS)
  pid: string;    // ex.: '0D'
  /** Fórmula de decodificação sobre os bytes A,B,C,D da resposta. */
  parse: string;  // ex.: 'A', '(A*256+B)/100', 'A*100/255'
}

export interface VehicleDriver {
  id: string;
  displayName: string;
  batteryCapacityKwh: number;
  nominalKmPerKwh: number;
  pids: Record<string, PidDefinition | null>;
}
