'use client';

/**
 * Lightweight formula/substitution block — plain styled Unicode text, no
 * KaTeX/MathJax dependency. All formulas here use standard Unicode math
 * symbols (Δ λ ° × ≤ →) which render correctly in any browser without extra
 * libraries, keeping this simple, stable, and trivially testable — the
 * explicit trade-off requested over adding a math-typesetting library.
 */
export default function FormulaBlock({
  title,
  formula,
  variables,
  substitution,
  result,
  interpretation,
}: {
  title: string;
  formula: string;
  variables?: string;
  substitution?: string;
  result?: string;
  interpretation?: string;
}) {
  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3 mb-3">
      <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1.5">{title}</div>
      <div className="font-mono text-sm text-white bg-black/30 rounded px-2 py-1.5 mb-1.5 overflow-x-auto whitespace-nowrap">
        {formula}
      </div>
      {variables && <p className="text-[11px] text-slate-400 mb-1">{variables}</p>}
      {substitution && (
        <div className="font-mono text-xs text-emerald-300 bg-black/20 rounded px-2 py-1 mb-1 overflow-x-auto whitespace-nowrap">
          {substitution}
        </div>
      )}
      {result && <div className="font-mono text-xs text-amber-300 mb-1">{result}</div>}
      {interpretation && <p className="text-[11px] text-slate-500 italic leading-relaxed">{interpretation}</p>}
    </div>
  );
}
