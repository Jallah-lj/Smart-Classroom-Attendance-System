import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { CheckCircle, AlertTriangle, XCircle, Search, Edit3, Image as ImageIcon, ShieldAlert, ArrowLeft } from 'lucide-react';

interface RosterViewProps {
  sessionId: string;
  onBack: () => void;
  currentUser: any;
}

export function RosterView({ sessionId, onBack, currentUser }: RosterViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal states
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoData, setPhotoData] = useState<any>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Correction form
  const [newStatus, setNewStatus] = useState<'PRESENT' | 'REVOKED' | 'FLAGGED'>('REVOKED');
  const [reasonCode, setReasonCode] = useState('STUDENT_DISPUTE_UPHELD');
  const [reasonDetail, setReasonDetail] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadRoster = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/attendance/sessions/${sessionId}/roster`);
      setData(res);
    } catch (err: any) {
      setActionMessage(err.message || 'Failed to load roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, [sessionId]);

  const viewPhoto = async (student: any) => {
    if (!student.record_id) return;
    setPhotoError(null);
    setPhotoData(null);
    setSelectedRecord(student);
    setPhotoModalOpen(true);

    try {
      const res = await apiRequest(`/attendance/sessions/${sessionId}/photos/${student.record_id}`);
      setPhotoData(res);
    } catch (err: any) {
      setPhotoError(err.message || 'Access Denied: You do not have permission to view verification photos for this session.');
    }
  };

  const openCorrection = (student: any) => {
    if (!student.record_id) return;
    setSelectedRecord(student);
    setNewStatus(student.effective_status === 'PRESENT' ? 'REVOKED' : 'PRESENT');
    setReasonCode('STUDENT_DISPUTE_UPHELD');
    setReasonDetail('');
    setCorrectionModalOpen(true);
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord || !reasonDetail.trim()) return;

    setCorrectionSubmitting(true);
    try {
      await apiRequest(`/attendance/sessions/${sessionId}/corrections`, {
        method: 'POST',
        body: JSON.stringify({
          recordId: selectedRecord.record_id,
          newStatus,
          reasonCode,
          reasonDetail: reasonDetail.trim()
        })
      });

      setCorrectionModalOpen(false);
      setActionMessage(`Attendance corrected to ${newStatus} for ${selectedRecord.full_name}.`);
      await loadRoster();
    } catch (err: any) {
      setActionMessage(`Correction failed: ${err.message}`);
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const filteredStudents = data?.students?.filter((s: any) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.matric_number.toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'ALL') return matchesSearch;
    return matchesSearch && s.effective_status === statusFilter;
  }) || [];

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-zinc-500">
        Loading classroom roster...
      </div>
    );
  }

  const session = data?.session;

  return (
    <div className="space-y-6">
      {/* Header & Meta */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sessions</span>
          </button>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {session?.courseCode}: {session?.courseTitle}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Session: <span className="font-mono">{session?.sessionCode}</span> · Venue: {session?.venueName} · Room Code: <span className="font-mono font-bold">{session?.roomCode}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400 block font-semibold">Attendance Rate</span>
            <span className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {filteredStudents.filter((s: any) => s.effective_status === 'PRESENT').length} / {data?.students?.length || 0}
            </span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 rounded-lg text-xs flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-blue-600 font-bold ml-2">×</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search student name or matric..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-zinc-500">Filter:</span>
          {['ALL', 'PRESENT', 'FLAGGED', 'ABSENT', 'REVOKED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* High-density Roster Table */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-[11px] font-semibold z-10">
              <tr>
                <th className="py-2.5 px-4">Student Name</th>
                <th className="py-2.5 px-4">Matriculation No.</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Verification Check</th>
                <th className="py-2.5 px-4">Recorded Time</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-sans">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-400">
                    No student registrations match this filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student: any) => {
                  const status = student.effective_status;
                  return (
                    <tr
                      key={student.student_id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {student.full_name}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {student.matric_number}
                      </td>
                      <td className="py-2.5 px-4">
                        {status === 'PRESENT' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Present</span>
                          </span>
                        )}
                        {status === 'FLAGGED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                            <AlertTriangle className="w-3 h-3 text-orange-600" />
                            <span>Flagged</span>
                          </span>
                        )}
                        {status === 'ABSENT' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            <XCircle className="w-3 h-3 text-zinc-400" />
                            <span>Absent</span>
                          </span>
                        )}
                        {status === 'REVOKED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Revoked</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-500">
                        {student.verification_status ? (
                          <span className="font-mono text-[11px]">
                            {student.verification_status}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-500 tabular-nums">
                        {student.recorded_at ? (
                          new Date(student.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-2">
                        {student.record_id && (
                          <>
                            <button
                              onClick={() => viewPhoto(student)}
                              className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded text-[11px] font-medium inline-flex items-center gap-1"
                              title="Inspect Live Camera Capture"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>Photo</span>
                            </button>
                            <button
                              onClick={() => openCorrection(student)}
                              className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded text-[11px] font-medium inline-flex items-center gap-1"
                              title="Submit Audited Correction"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Correct</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo View Modal */}
      {photoModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Verification Photo
                </h3>
                <p className="text-[11px] text-zinc-500">{selectedRecord?.full_name} ({selectedRecord?.matric_number})</p>
              </div>
              <button
                onClick={() => setPhotoModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 font-bold"
              >
                ×
              </button>
            </div>

            {photoError ? (
              <div className="p-4 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>Access Restriction</span>
                </div>
                <p>{photoError}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 aspect-[4/3] flex items-center justify-center">
                  <div className="text-center p-4 space-y-2">
                    <ImageIcon className="w-8 h-8 text-zinc-400 mx-auto" />
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Live Camera Stream Frame</p>
                    <p className="text-[10px] text-zinc-400 font-mono break-all">{photoData?.photoPath}</p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Notice: Under Section 5 privacy guidelines, verification photos are strictly accessible only by the assigned course lecturer and designated system auditors. No biometric facial recognition is performed.
                </p>
              </div>
            )}

            <button
              onClick={() => setPhotoModalOpen(false)}
              className="w-full py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Audited Attendance Correction Modal */}
      {correctionModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCorrectionSubmit}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Submit Audited Attendance Correction
                </h3>
                <p className="text-[11px] text-zinc-500">Student: {selectedRecord?.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-500 mb-1 font-medium">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e: any) => setNewStatus(e.target.value)}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="REVOKED">REVOKED</option>
                  <option value="FLAGGED">FLAGGED</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-500 mb-1 font-medium">Reason Code</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded font-mono text-[11px]"
                >
                  <option value="STUDENT_DISPUTE_UPHELD">STUDENT_DISPUTE_UPHELD</option>
                  <option value="LECTURER_OBSERVED_LEAVING">LECTURER_OBSERVED_LEAVING</option>
                  <option value="DEVICE_FAILURE_OVERRIDE">DEVICE_FAILURE_OVERRIDE</option>
                  <option value="MEDICAL_EXCUSE">MEDICAL_EXCUSE</option>
                  <option value="ADMINISTRATIVE_CORRECTION">ADMINISTRATIVE_CORRECTION</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-500 mb-1 font-medium">Mandatory Justification Detail</label>
                <textarea
                  required
                  rows={3}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="Provide explicit context (e.g. Student presented medical certificate from University Clinic)."
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-[11px] text-amber-800 dark:text-amber-300">
                Notice: Attendance records are append-only. This correction is permanently recorded in the append-only corrections log and cannot be undone or erased.
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrectionModalOpen(false)}
                className="flex-1 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={correctionSubmitting || reasonDetail.trim().length < 5}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {correctionSubmitting ? 'Recording...' : 'Commit Correction'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
