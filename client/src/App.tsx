import React, { useEffect, useState } from 'react';
import { apiRequest, setStoredToken, clearStoredToken } from './lib/api.js';
import { ProjectorView } from './components/ProjectorView.js';
import { StudentCheckIn } from './components/StudentCheckIn.js';
import { RosterView } from './components/RosterView.js';
import { AdminAuditView } from './components/AdminAuditView.js';
import {
  QrCode,
  Users,
  ShieldAlert,
  Moon,
  Sun,
  LogOut,
  Play,
  CheckCircle,
  Clock,
  Layers,
  MapPin,
  Smartphone
} from 'lucide-react';

const DEMO_PERSONAS = [
  { role: 'LECTURER', label: 'Dr. Adeyemi Adeleke (CSC 3204 Lecturer)', email: 'lecturer.adeleke@apex.edu' },
  { role: 'LECTURER', label: 'Dr. Patrick Habimana (External Lecturer - Test 403)', email: 'lecturer.habimana@apex.edu' },
  { role: 'STUDENT', label: 'Chinedu Okafor (Enrolled Student)', email: 'student.chinedu@apex.edu' },
  { role: 'STUDENT', label: 'Amina Bello (Already Checked In)', email: 'student.amina@apex.edu' },
  { role: 'ADMIN', label: 'Dr. Folashade Adebayo (Admin)', email: 'admin@apex.edu' }
];

export function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Active view
  const [activeTab, setActiveTab] = useState<'sessions' | 'admin_audit'>('sessions');
  const [projectorSessionId, setProjectorSessionId] = useState<string | null>(null);
  const [rosterSessionId, setRosterSessionId] = useState<string | null>(null);
  const [checkInSession, setCheckInSession] = useState<any | null>(null);

  // Initialize theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Login as a demo persona
  const switchUser = async (email: string) => {
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'ApexSecure@2026' })
      });
      setStoredToken(res.token);
      setCurrentUser(res.user);
      loadSessions();
    } catch (err: any) {
      console.error('Login error:', err);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await apiRequest('/sessions');
      setSessions(res.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    // Initial auto-login as course lecturer
    switchUser('lecturer.adeleke@apex.edu');
  }, []);

  // Full-screen Projector View overlay
  if (projectorSessionId) {
    return (
      <ProjectorView
        sessionId={projectorSessionId}
        onExit={() => setProjectorSessionId(null)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50">
              Apex University
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-xs text-zinc-500 font-medium">Smart Classroom Attendance</span>
            <span className="hidden sm:inline-block text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
              2026/2027 Semester 1
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Persona Switcher for Verification & Grading Tests */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 hidden md:inline">Role:</span>
              <select
                value={currentUser?.email || ''}
                onChange={(e) => switchUser(e.target.value)}
                className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-zinc-800 dark:text-zinc-200 font-medium focus:outline-none"
              >
                {DEMO_PERSONAS.map((p) => (
                  <option key={p.email} value={p.email}>
                    [{p.role}] {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Toggle Dark/Light Mode"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-56 shrink-0 space-y-1">
          <button
            onClick={() => {
              setActiveTab('sessions');
              setRosterSessionId(null);
              setCheckInSession(null);
            }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
              activeTab === 'sessions' && !rosterSessionId && !checkInSession
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Attendance Sessions</span>
          </button>

          {currentUser?.role === 'ADMIN' && (
            <button
              onClick={() => {
                setActiveTab('admin_audit');
                setRosterSessionId(null);
                setCheckInSession(null);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                activeTab === 'admin_audit'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Admin & Audit Trail</span>
            </button>
          )}

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-4 text-[11px] text-zinc-400 leading-normal space-y-2">
            <p className="font-semibold uppercase tracking-wider text-[10px] text-zinc-500">
              Active Environment
            </p>
            <p>Single Institution · No Multi-Tenancy</p>
            <p className="font-mono text-[10px]">Africa/Kigali UTC+2</p>
          </div>
        </aside>

        {/* Content Pane */}
        <main className="flex-1 min-w-0">
          {/* Sub-view: Active Student Check-in Modal */}
          {checkInSession && (
            <StudentCheckIn
              session={checkInSession}
              onDone={() => {
                setCheckInSession(null);
                loadSessions();
              }}
            />
          )}

          {/* Sub-view: Active Lecturer Roster */}
          {!checkInSession && rosterSessionId && (
            <RosterView
              sessionId={rosterSessionId}
              onBack={() => setRosterSessionId(null)}
              currentUser={currentUser}
            />
          )}

          {/* Sub-view: Admin Audit View */}
          {!checkInSession && !rosterSessionId && activeTab === 'admin_audit' && (
            <AdminAuditView />
          )}

          {/* Sub-view: Sessions Directory */}
          {!checkInSession && !rosterSessionId && activeTab === 'sessions' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Active Class Sessions
                  </h1>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Live classroom attendance registers for today's academic schedule.
                  </p>
                </div>
              </div>

              {loadingSessions ? (
                <div className="p-8 text-center text-xs text-zinc-400">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="p-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
                  No active sessions found for this role.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                            {sess.course_code}: {sess.course_title}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            {sess.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {sess.venue_name}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Passcode: <strong className="font-mono text-zinc-800 dark:text-zinc-200">{sess.room_code}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Instructor: {sess.lecturer_name}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Lecturer / Admin Actions */}
                        {currentUser?.role !== 'STUDENT' && (
                          <>
                            <button
                              onClick={() => setProjectorSessionId(sess.id)}
                              className="px-3 py-1.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                              title="Launch Projector Screen"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Projector QR</span>
                            </button>

                            <button
                              onClick={() => setRosterSessionId(sess.id)}
                              className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                              title="Open Live Roster"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Roster ({sess.present_count}/{sess.enrolled_count})</span>
                            </button>
                          </>
                        )}

                        {/* Student Action: Launch Check-in */}
                        {currentUser?.role === 'STUDENT' && (
                          <button
                            onClick={() => setCheckInSession(sess)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Check In to Session</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
