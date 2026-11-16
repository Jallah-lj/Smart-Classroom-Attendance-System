import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { ShieldAlert, MapPin, Database, Activity, RefreshCw } from 'lucide-react';

export function AdminAuditView() {
  const [activeTab, setActiveTab] = useState<'audit' | 'venues' | 'security'>('audit');
  const [logs, setLogs] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsRes, venuesRes, statusRes] = await Promise.all([
        apiRequest('/admin/audit-logs'),
        apiRequest('/admin/venues'),
        apiRequest('/admin/system-status')
      ]);
      setLogs(logsRes.logs || []);
      setVenues(venuesRes.venues || []);
      setStatusInfo(statusRes);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Non-negotiable Fundamental Security Limitation Warning */}
      <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs space-y-1">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Section 5 Fundamental Security Notice: Physical Presence Proof Limitation</span>
        </div>
        <p className="leading-relaxed text-amber-800 dark:text-amber-300">
          Browsers, web applications, and consumer mobile operating systems cannot definitively prove physical human presence in a classroom. Geolocation coordinates can be spoofed or degraded indoors, and camera streams can be manipulated. All automated check-in signals are corroborated server-side evidence, not legal proof. Disputed attendance must be reviewed by the presiding course lecturer.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Append-Only Audit Trail</span>
        </button>

        <button
          onClick={() => setActiveTab('venues')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'venues'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Surveyed Venues & Geofences</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === 'security'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Immutability & Integrity Guard</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
          <span>Loading telemetry and audit logs...</span>
        </div>
      ) : (
        <>
          {activeTab === 'audit' && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-[11px] font-semibold z-10">
                    <tr>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Target Entity</th>
                      <th className="py-2.5 px-4">Sanitized Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-sans">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                        <td className="py-2 px-4 tabular-nums text-zinc-500 font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                          {log.actor_name || 'System / Anonymous'}
                        </td>
                        <td className="py-2 px-4">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            {log.actor_role}
                          </span>
                        </td>
                        <td className="py-2 px-4 font-mono font-semibold text-zinc-800 dark:text-zinc-200 text-[11px]">
                          {log.action}
                        </td>
                        <td className="py-2 px-4 text-zinc-500 font-mono text-[11px]">
                          {log.target_entity}
                        </td>
                        <td className="py-2 px-4 font-mono text-[10px] text-zinc-500 max-w-xs truncate">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'venues' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venues.map((venue) => (
                <div key={venue.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      {venue.code}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {venue.session_count} total sessions
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{venue.name}</h3>
                    <p className="text-xs text-zinc-500">{venue.building} · {venue.campus}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Center Coordinates</span>
                      <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200 text-[11px]">
                        {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Surveyed Geofence</span>
                      <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200 text-[11px]">
                        Radius: {venue.radius_meters}m (Max Acc: {venue.max_accuracy_meters}m)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Database Append-Only Security Grants & Triggers
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  The following 4 tables are strictly append-only, enforced by PostgreSQL triggers and schema-level security grants. Any attempt by application roles or API endpoints to execute UPDATE or DELETE operations is rejected at the database engine level with SQLSTATE 55000:
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {['attendance_records', 'verification_events', 'attendance_corrections', 'audit_logs'].map((tbl) => (
                    <div key={tbl} className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                      <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">{tbl}</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">INSERT ONLY</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2 text-xs">
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">System Telemetry Snapshot</h4>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <span className="text-zinc-400 block">Enrolled Students</span>
                    <span className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{statusInfo?.stats?.total_students || 0}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Verified Present Records</span>
                    <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{statusInfo?.stats?.total_present_records || 0}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Audited Corrections</span>
                    <span className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">{statusInfo?.stats?.total_corrections || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
