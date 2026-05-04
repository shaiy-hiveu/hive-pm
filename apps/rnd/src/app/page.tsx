export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="text-xs font-semibold tracking-widest text-indigo-500 mb-2">HIVE · R&amp;D</p>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">R&amp;D Team Manager</h1>
      <p className="text-sm text-gray-600 leading-relaxed mb-8">
        This service is a separate Next.js app deployed alongside Hive PM. Coming soon: team
        roster, skill matrix, current workload, and availability search — all wired into the
        same Supabase + Notion data sources used by Hive PM.
      </p>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-500">
        <p className="font-semibold text-gray-700 mb-2">Status: scaffold</p>
        <p>This page is the empty starting point of <code className="bg-gray-100 px-1 rounded">apps/rnd</code>. Real features will follow once the deployment is verified.</p>
      </div>
    </div>
  );
}
