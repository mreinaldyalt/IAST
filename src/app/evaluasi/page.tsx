'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';

interface EvalItem {
  year: number;
  predicted: string | null;
  actual: string;
  status: 'OK' | 'FAIL' | 'SKIPPED';
  note?: string;
}

interface EvalResult {
  items: EvalItem[];
  totalOk: number;
  totalFail: number;
  totalSkipped: number;
  accuracy: string;
  note?: string;
}

export default function EvaluasiPage() {
  const { t } = useI18n();
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runEvaluation() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: {} }),
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-indigo-300 mb-4">📊 {t.evalTitle}</h1>
      <p className="text-slate-400 mb-6">{t.evalDesc}</p>

      <button
        onClick={runEvaluation}
        disabled={loading}
        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-md hover:bg-indigo-500 disabled:opacity-50 transition-colors"
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

          <div className="bg-[#161b22] rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full">
              <thead className="bg-indigo-900/20">
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
                    <td className="px-4 py-2 font-mono text-sm text-slate-300">{item.actual}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          item.status === 'OK'
                            ? 'bg-green-900/30 text-green-400'
                            : item.status === 'FAIL'
                            ? 'bg-red-900/30 text-red-400'
                            : 'bg-white/5 text-slate-500'
                        }`}
                      >
                        {item.status}
                      </span>
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
