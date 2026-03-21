'use client';

import { useEffect, useState } from 'react';

interface CollectionCount {
  name: string;
  count: number;
}

interface DashboardStats {
  connected: boolean;
  commandsCount: number;
  runsCount: number;
  errorRunsCount: number;
  collections: CollectionCount[];
  error?: string;
}

const hebrewCollectionNames: Record<string, string> = {
  CHESHBONIT: 'חשבוניות',
  MUCARIM: 'מוצרים',
  SHARATIM: 'שירותים',
  YADANIIM: 'ידניים',
  GY: "גן ילדים",
  HASAOT: 'הסעות',
  HASNET: 'השנת',
  HASMASLULIM: 'המסלולים',
  MISROT: 'משרות',
  MISROTGY: "משרות ג'י",
  MOADON: 'מועדון',
  MUTAVIM: 'מוטבים',
  SHEFI: 'שפי',
  noseme: 'נושאים',
  mosdot: 'מוסדות',
  runs: 'ריצות',
  COMMANDS: 'פקודות',
  run_logs: 'לוגים',
  run_results: 'תוצאות',
  run_hashvha: 'השוואות',
};

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white border border-[#d1d9e0] rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      <p className="text-sm text-[#636c76]">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((data: DashboardStats) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setStats({
          connected: false,
          commandsCount: 0,
          runsCount: 0,
          errorRunsCount: 0,
          collections: [],
        });
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-[#636c76] text-lg">טוען נתונים...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">דשבורד</h1>
        <p className="text-[#636c76] text-sm">מערכת פקודות תשלום - עיריית נתיבות, מחלקת חינוך</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="חיבור MongoDB"
          value={stats?.connected ? 'מחובר' : 'מנותק'}
          color={stats?.connected ? 'text-[#1a7f37]' : 'text-[#cf222e]'}
          icon={stats?.connected ? '✅' : '❌'}
        />
        <StatCard
          label="סה״כ פקודות"
          value={stats?.commandsCount ?? 0}
          color="text-[#0969da]"
          icon="📋"
        />
        <StatCard
          label="ריצות שבוצעו"
          value={stats?.runsCount ?? 0}
          color="text-[#1a7f37]"
          icon="▶️"
        />
        <StatCard
          label="ריצות עם שגיאות"
          value={stats?.errorRunsCount ?? 0}
          color="text-[#cf222e]"
          icon="⚠️"
        />
      </div>

      {/* Collections table */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa]">
          <h2 className="text-base font-semibold text-[#1f2328]">אוספי נתונים</h2>
          <p className="text-xs text-[#636c76] mt-1">מספר רשומות בכל קולקשן</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#d1d9e0]">
                <th className="text-right px-6 py-3 text-xs font-medium text-[#636c76] uppercase tracking-wider">
                  שם אוסף
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-[#636c76] uppercase tracking-wider">
                  שם בעברית
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-[#636c76] uppercase tracking-wider">
                  מספר רשומות
                </th>
              </tr>
            </thead>
            <tbody>
              {stats?.collections.map((col, idx) => (
                <tr
                  key={col.name}
                  className={`border-b border-[#d1d9e0] hover:bg-[#eaeef2] transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-[#f6f8fa]'
                  }`}
                >
                  <td className="px-6 py-3 text-sm font-mono text-[#0969da]">{col.name}</td>
                  <td className="px-6 py-3 text-sm text-[#1f2328]">
                    {hebrewCollectionNames[col.name] ?? col.name}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        col.count > 0
                          ? 'bg-[#ddf4ff] text-[#0969da]'
                          : 'bg-[#f0f3f6] text-[#8c959f]'
                      }`}
                    >
                      {col.count.toLocaleString('he-IL')}
                    </span>
                  </td>
                </tr>
              ))}
              {(!stats?.collections || stats.collections.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-[#636c76] text-sm">
                    אין נתונים זמינים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
