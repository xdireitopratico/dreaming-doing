/**
 * AetherForge — Condition Expression Evaluator
 * Avalia expressões condicionais para o Condition Node (sem Math.random!)
 * 
 * Suporta operadores: ==, !=, >, <, >=, <=, contains, not_contains, 
 *                     starts_with, ends_with, regex, is_empty, is_not_empty,
 *                     in, not_in, typeof
 * 
 * Máx: ~75 linhas (anti-monolítico)
 */

export interface ConditionConfig {
  expression?: string;       // Ex: "input.value > 10"
  field?: string;            // Campo do input a avaliar
  operator?: string;         // Operador de comparação
  compare_value?: string;    // Valor de comparação
  case_sensitive?: boolean;  // Default: false
}

export interface ConditionResult {
  branch: "true" | "false";
  evaluated: boolean;
  expression: string;
  field_value: any;
  compare_value: any;
  operator: string;
}

/**
 * Resolve nested field from object: "response.data.count" → obj.response.data.count
 */
function resolveField(obj: any, path: string): any {
  if (!path || !obj) return obj;
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function coerce(val: any): any {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null" || val === "undefined") return null;
  const num = Number(val);
  return isNaN(num) ? val : num;
}

/**
 * Evalua condição com operador explícito (seguro, sem eval)
 */
export function evaluateCondition(input: any, config: ConditionConfig): ConditionResult {
  const field = config.field || "response";
  const operator = config.operator || "==";
  const caseSensitive = config.case_sensitive ?? false;

  let fieldValue = resolveField(input, field);
  let compareValue: any = coerce(config.compare_value ?? "");

  // String normalization
  const strField = caseSensitive ? String(fieldValue ?? "") : String(fieldValue ?? "").toLowerCase();
  const strCompare = caseSensitive ? String(compareValue ?? "") : String(compareValue ?? "").toLowerCase();

  let result = false;

  switch (operator) {
    case "==":  result = coerce(fieldValue) == compareValue; break;
    case "!=":  result = coerce(fieldValue) != compareValue; break;
    case ">":   result = Number(fieldValue) > Number(compareValue); break;
    case "<":   result = Number(fieldValue) < Number(compareValue); break;
    case ">=":  result = Number(fieldValue) >= Number(compareValue); break;
    case "<=":  result = Number(fieldValue) <= Number(compareValue); break;
    case "contains":     result = strField.includes(strCompare); break;
    case "not_contains": result = !strField.includes(strCompare); break;
    case "starts_with":  result = strField.startsWith(strCompare); break;
    case "ends_with":    result = strField.endsWith(strCompare); break;
    case "regex":        try { result = new RegExp(String(compareValue)).test(String(fieldValue)); } catch { result = false; } break;
    case "is_empty":     result = fieldValue == null || fieldValue === "" || (Array.isArray(fieldValue) && fieldValue.length === 0); break;
    case "is_not_empty": result = fieldValue != null && fieldValue !== "" && !(Array.isArray(fieldValue) && fieldValue.length === 0); break;
    case "in":           try { const arr = JSON.parse(String(compareValue)); result = Array.isArray(arr) && arr.includes(fieldValue); } catch { result = false; } break;
    case "typeof":       result = typeof fieldValue === compareValue; break;
    default:             result = !!fieldValue; // truthy fallback
  }

  const expression = config.expression || `${field} ${operator} ${config.compare_value ?? ""}`;

  return {
    branch: result ? "true" : "false",
    evaluated: true,
    expression,
    field_value: fieldValue,
    compare_value: compareValue,
    operator,
  };
}
