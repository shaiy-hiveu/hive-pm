export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">⚙️ Settings</h1>
        <p className="text-gray-400 mt-1">Configuration and data management</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="font-semibold text-white">Database</h2>
        <p className="text-sm text-gray-400">
          To add products, goals, pillars and sprints — go to your Supabase project and insert rows directly, or use the Table Editor.
        </p>
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
        >
          Open Supabase Dashboard →
        </a>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <h2 className="font-semibold text-white">Notion Sync</h2>
        <p className="text-sm text-gray-400">
          Tasks are fetched live from Notion every time you visit the Products page. No manual sync needed.
        </p>
      </div>
    </div>
  );
}
