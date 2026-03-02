'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';

interface EvalItem {
  year: number;
  predicted: string | null;
  actual: string | null;
  status: 'OK' | 'FAIL' | 'SKIPPED' | 'NO_GROUND_TRUTH';
  note?: string;
}

interface EvalResult {
  items: EvalItem[];
  totalOk: number;
  totalFail: number;
  totalSkipped: number;
  totalNoGroundTruth?: number;
  accuracy: string;
  fromYear?: number;
  toYear?: number;
  note?: string;
}

export default function EvaluasiPage() {
  const { t } = useI18n();
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromYear, setFromYear] = useState(2025);
  const [toYear, setToYear] = useState(2029);

  async function runEvaluation() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromYear, toYear }),
      });
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-blue-300 bg-clip-text text-transparent mb-4">📊 {t.evalTitle}</h1>
      <p className="text-slate-400 mb-6">{t.evalDesc}</p>

      {/* Year range inputs */}
      <div className="flex items-center gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">From Year</label>
          <input type="number" value={fromYear} onChange={e => setFromYear(parseInt(e.target.value) || 2025)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-24 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">To Year</label>
          <input type="number" value={toYear} onChange={e => setToYear(parseInt(e.target.value) || 2029)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white w-24 focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <button
        onClick={runEvaluation}
        disabled={loading}
        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
      >
        {loading ? '...' : t.runEval}
      </button>

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-500/30 rounded p-3 text-red-300 text-sm">{error}</div>
      )}

      {result && (
        <div className="mt-6">
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-green-900/20 border border-green-500/10 p-3 rounded-lg text-center">
              <div className="text-xs text-slate-500">{t.ok}</div>
              <div className="text-2xl font-bold text-green-400">{result.totalOk}</div>
            </div>
            <div className="bg-red-900/20 border border-red-500/10 p-3 rounded-lg text-center">
              <div className="text-xs text-slate-500">{t.fail}</div>
              <div className="text-2xl font-bold text-red-400">{result.totalFail}</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-3 rounded-lg text-center">
              <div className="text-xs text-slate-500">{t.skipped}</div>
              <div className="text-2xl font-bold text-slate-400">{result.totalSkipped}</div>
            </div>
            <div className="bg-blue-900/20 border border-blue-500/10 p-3 rounded-lg text-center">
              <div className="text-xs text-slate-500">{t.accuracy}</div>
              <div className="text-2xl font-bold text-blue-400">{result.accuracy}</div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-indigo-950/30">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-400">{t.year}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.predicted}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.actual}</th>
                  <th className="px-4 py-3 text-left text-slate-400">{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.year} className="border-b border-white/5 hover:bg-indigo-900/10">
                    <td className="px-4 py-2 text-slate-300">{item.year}</td>
                    <td className="px-4 py-2 font-mono text-sm text-slate-400">{item.predicted || '-'}</td>
                    <td className="px-4 py-2 font-mono text-sm text-slate-300">{item.actual || '-'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          item.status === 'OK'
                            ? 'bg-green-900/30 text-green-400'
                            : item.status === 'FAIL'
                            ? 'bg-red-900/30 text-red-400'
                            : item.status === 'NO_GROUND_TRUTH'
                            ? 'bg-yellow-900/30 text-yellow-400'
                            : 'bg-white/5 text-slate-500'
                        }`}
                      >
                        {item.status === 'NO_GROUND_TRUTH' ? 'NO GT' : item.status}
                      </span>
                      {item.note && <span className="ml-2 text-[10px] text-slate-500">{item.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.note && <p className="mt-2 text-sm text-slate-500">{result.note}</p>}
        </div>
      )}
    </div>
  );
}
