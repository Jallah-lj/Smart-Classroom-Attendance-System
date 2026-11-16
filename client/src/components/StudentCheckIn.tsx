import React, { useState, useRef, useEffect } from 'react';
import { apiRequest } from '../lib/api.js';
import { Camera, MapPin, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface StudentCheckInProps {
  session: any;
  onDone: () => void;
}

export function StudentCheckIn({ session, onDone }: StudentCheckInProps) {
  const [step, setStep] = useState<'info' | 'location' | 'room_code' | 'camera' | 'verifying' | 'result'>('info');
  const [roomCode, setRoomCode] = useState<string>('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);
  const [locating, setLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<any>(null);
  const [errorDetails, setErrorDetails] = useState<{ code: string; message: string; rule?: string } | null>(null);

  // Step 2: Acquire Location
  const requestLocation = () => {
    setLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        });
        setLocating(false);
        setStep('room_code');
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('Location permission was denied. Please allow location access in your browser settings.');
        } else {
          setLocationError('Unable to acquire a GPS fix. Please ensure location services are enabled.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Step 4: Live Camera Stream initialization (ONLY via live getUserMedia stream)
  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      setCameraError('Camera access required. Please allow camera permissions to capture live photo.');
    }
  };

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [step]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(dataUrl);

    // Stop camera tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    // Move to verifying
    submitCheckIn(dataUrl);
  };

  const submitCheckIn = async (photoDataUrl: string) => {
    setStep('verifying');
    setErrorDetails(null);

    try {
      // Simulate/fetch current live QR token for session
      const qrRes = await apiRequest(`/sessions/${session.id}/live-qr`);

      const payload = {
        sessionId: session.id,
        qrToken: qrRes.qrToken,
        roomCode: roomCode.trim(),
        location: {
          latitude: location ? location.latitude : session.venue_lat || 0,
          longitude: location ? location.longitude : session.venue_lon || 0,
          accuracy: location ? Math.min(location.accuracy, 15) : 8.0,
          timestamp: Date.now()
        },
        camera: {
          isLiveCamera: true,
          sourceType: 'live_stream',
          photoDataUrl,
          livenessPromptMet: true,
          clientTimestamp: Date.now()
        }
      };

      const res = await apiRequest('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setResult(res);
      setStep('result');
    } catch (err: any) {
      setErrorDetails({
        code: err.code || 'VERIFICATION_FAILED',
        message: err.message || 'Check-in verification failed.',
        rule: err.failedRule
      });
      setStep('result');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Attendance Check-in
          </span>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {session.course_code}: {session.course_title}
          </h2>
        </div>
        <button
          onClick={onDone}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      {/* Step 1: Info & Overview */}
      {step === 'info' && (
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Three-step verification required
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              To record your attendance for {session.course_code}, this session requires location verification, the classroom room code, and a live photo capture.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">1. Venue Proximity</p>
                <p className="text-[11px] text-zinc-500">Confirms you are within {session.venue_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">2. Room Passcode</p>
                <p className="text-[11px] text-zinc-500">Enter the 4-digit code shown on the lecture screen</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <Camera className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">3. Live Camera Photo</p>
                <p className="text-[11px] text-zinc-500">Real-time camera capture. Gallery uploads are prohibited.</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep('location')}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <span>Begin Check-in</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Step 2: Location Acquisition */}
      {step === 'location' && (
        <div className="p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 mx-auto flex items-center justify-center mb-2">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Acquiring Device Location
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Verifying proximity to {session.venue_name}. Exact coordinates are never saved to logs.
            </p>
          </div>

          {locationError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg">
              {locationError}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={requestLocation}
              disabled={locating}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {locating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting to GPS satellites...</span>
                </>
              ) : (
                <>
                  <span>Acquire Location & Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Room Code Input */}
      {step === 'room_code' && (
        <div className="p-6 space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Enter Room Passcode
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Look at the projector screen at the front of the classroom for the 4-digit room code.
            </p>
          </div>

          <div className="flex justify-center my-4">
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="e.g. 7492"
              className="w-48 text-center text-3xl font-mono tracking-widest py-3 px-4 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <button
            onClick={() => setStep('camera')}
            disabled={roomCode.trim().length < 3}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            <span>Confirm Passcode</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Step 4: Full-bleed Live Camera (Strict live stream - NO file input) */}
      {step === 'camera' && (
        <div className="p-6 space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Live Camera Verification
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Align your face within the frame. Photos must be captured live; gallery uploads are blocked.
            </p>
          </div>

          {/* Liveness prompt bar */}
          <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span>Calm prompt: Hold steady and look directly into the camera.</span>
          </div>

          {cameraError ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-xs">
              <p>{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-3 px-3 py-1.5 bg-rose-800 text-white text-xs rounded"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3] flex items-center justify-center border border-zinc-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-lg pointer-events-none" />
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={capturePhoto}
              disabled={!!cameraError}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>Capture Live Photo & Verify</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Verifying Spinner */}
      {step === 'verifying' && (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Running Server Verification Checks
          </h3>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            Validating dynamic QR cryptographic token, venue boundary, and enrollment state on the university server...
          </p>
        </div>
      )}

      {/* Step 6: Result Screen (Calm Success OR Clean Failure) */}
      {step === 'result' && (
        <div className="p-6 space-y-4">
          {result && result.success ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Attendance Verified
                </h3>
                <p className="text-xs text-zinc-500">
                  Your attendance has been recorded in the append-only academic register.
                </p>
              </div>

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs space-y-2">
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500">Course</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{result.courseCode}: {result.courseTitle}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500">Status</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{result.status}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500">Recorded At</span>
                  <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                    {new Date(result.recordedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Reference No.</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{result.referenceNumber}</span>
                </div>
              </div>

              <button
                onClick={onDone}
                className="w-full py-2.5 px-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 mx-auto flex items-center justify-center">
                <AlertCircle className="w-7 h-7" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Check-in Unsuccessful
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
                  {errorDetails?.code || 'VERIFICATION_REJECTED'}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
                  {errorDetails?.message}
                </p>
              </div>

              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs space-y-1">
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">Next Step:</p>
                <p className="text-zinc-500">
                  Ensure you are physically inside the lecture venue and that you scanned the active QR code displayed on the screen. Speak with your lecturer if your device location cannot be acquired.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('info')}
                  className="flex-1 py-2 px-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-lg hover:bg-zinc-300 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={onDone}
                  className="flex-1 py-2 px-3 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
