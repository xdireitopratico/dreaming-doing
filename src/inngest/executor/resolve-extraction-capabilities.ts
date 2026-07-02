/**
 * Re-export do resolver canônico (Gate G1) — SSOT em supabase/functions/_shared.
 */
export {
  API_MODELS_PATH,
  evaluateExtractionCapabilities,
  resolveExtractionCapabilities,
  type CapabilityFailureCode,
  type ExtractionCapabilityInputs,
  type ExtractionCapabilitiesFail,
  type ExtractionCapabilitiesOk,
  type ExtractionCapabilitiesResult,
  type ExtractionDepth,
  type ResolvedExtractionLlm,
} from "../../../supabase/functions/_shared/resolve-extraction-capabilities.ts";