/**
 * PrometheusTestResults — Visual test results panel
 */

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface Props {
  tests: TestResult[];
  passRate: number;
}

export function PrometheusTestResults({ tests, passRate }: Props) {
  return (
    <div className="rounded-xl p-4 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold flex items-center gap-2" style={{ color: "var(--ps-cream-80)" }}>
          🧪 Testes
        </div>
        <span className="text-[11px] font-bold ps-mono" style={{
          color: passRate >= 90 ? "hsl(142 70% 45%)" : passRate >= 70 ? "hsl(45 100% 50%)" : "hsl(0 70% 50%)",
        }}>
          {passRate}% pass
        </span>
      </div>

      <div className="space-y-1.5">
        {tests.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span>{t.passed ? "✅" : "❌"}</span>
            <span style={{ color: "var(--ps-cream-60)" }}>{t.name}</span>
            {t.detail && (
              <span className="ml-auto text-[9px]" style={{ color: "var(--ps-cream-25)" }}>{t.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
