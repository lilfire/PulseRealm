import { useState, useEffect, useRef, useCallback } from "react";
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { getSpeedDependentStrideFactor } from "../utils/wearable";

interface CalibrationPoint {
  speedKmh: number;
  strideFactor: number;
}

interface SpeedGroup {
  label: string;
  targetSpeed: number;
  icon: string;
}

const SPEED_GROUPS: SpeedGroup[] = [
  { label: "Slow Walk", targetSpeed: 3, icon: "\u{1F6B6}" },
  { label: "Brisk Walk", targetSpeed: 5, icon: "\u{1F6B6}\u200D\u2640\uFE0F" },
  { label: "Jog", targetSpeed: 8, icon: "\u{1F3C3}" },
  { label: "Run", targetSpeed: 12, icon: "\u{1F3C3}\u200D\u2642\uFE0F" },
  { label: "Fast Run", targetSpeed: 15, icon: "\u26A1" },
];

const SAMPLE_DURATION_SEC = 30;

interface Props {
  hubUrl: string;
  onClose: () => void;
}

type CalibrationStep = "connecting" | "waiting-client" | "calibrating" | "results";

export function CalibrationPanel({ hubUrl, onClose }: Props) {
  const [step, setStep] = useState<CalibrationStep>("connecting");
  const [heightCm, setHeightCm] = useState(170);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentGroup, setCurrentGroup] = useState(0);
  const [sampling, setSampling] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [collectedPoints, setCollectedPoints] = useState<CalibrationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const connectionRef = useRef<HubConnection | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep sessionIdRef in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      const conn = connectionRef.current;
      const sid = sessionIdRef.current;
      if (conn && conn.state === HubConnectionState.Connected && sid) {
        conn.invoke("CancelCalibration", sid).catch(() => {});
        conn.stop().catch(() => {});
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    setStep("connecting");
    setError(null);

    try {
      const connection = new HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect()
        .build();

      // Listen for events
      connection.on("CalibrationClientJoined", (sid: string, _clientId: string, clientHeightCm: number) => {
        setSessionId(sid);
        setHeightCm(clientHeightCm);
        setStep("calibrating");
      });

      connection.on("CalibrationSampleResult", (_sid: string, point: CalibrationPoint) => {
        setCollectedPoints((prev) => [...prev, point]);
        setSampling(false);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      });

      connection.on("CalibrationSaved", () => {
        setSaved(true);
      });

      connection.on("CalibrationClientLeft", () => {
        setError("Wearable client disconnected.");
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setSampling(false);
        setStep("waiting-client");
      });

      await connection.start();
      connectionRef.current = connection;

      // Create calibration session
      const code = await connection.invoke<string>("CreateCalibrationSession");
      setJoinCode(code);

      // Extract session ID from connection (server returns just the join code,
      // we'll track it via events). We need the session ID for subsequent calls.
      // For now, use the join code as a lookup key — the server maps it internally.
      // Actually, the server returns the join code from CreateCalibrationSession.
      // We need to get the session ID. Let's store the code and derive session from events.
      // The hub methods accept sessionId, which we need. Let's adjust: we'll store
      // the session by adding a return value or by having the server send it back.
      // For simplicity, we'll enhance the approach: CalibrationClientJoined sends sessionId.

      setStep("waiting-client");
    } catch (err) {
      console.error("CalibrationPanel connection failed:", err);
      setError("Could not connect to the server. Please try again.");
      setStep("connecting");
    }
  }, [hubUrl]);

  const startSample = useCallback(async () => {
    const conn = connectionRef.current;
    const sid = sessionIdRef.current;
    if (!conn || !sid) return;

    try {
      setError(null);
      const group = SPEED_GROUPS[currentGroup];
      await conn.invoke("StartCalibrationSample", sid, group.targetSpeed);
      setSampling(true);
      setCountdown(SAMPLE_DURATION_SEC);

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = null;
            // End sample
            conn.invoke("EndCalibrationSample", sid).catch((err: unknown) => {
              console.error("CalibrationPanel end sample failed:", err);
              setError("Something went wrong. Please try again.");
              setSampling(false);
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("CalibrationPanel start sample failed:", err);
      setError("Something went wrong. Please try again.");
    }
  }, [currentGroup]);

  const skipGroup = useCallback(() => {
    if (currentGroup < SPEED_GROUPS.length - 1) {
      setCurrentGroup((prev) => prev + 1);
    } else {
      setStep("results");
    }
  }, [currentGroup]);

  const nextGroup = useCallback(() => {
    if (currentGroup < SPEED_GROUPS.length - 1) {
      setCurrentGroup((prev) => prev + 1);
    } else {
      setStep("results");
    }
  }, [currentGroup]);

  const saveCalibration = useCallback(async () => {
    const conn = connectionRef.current;
    const sid = sessionIdRef.current;
    if (!conn || !sid) return;

    try {
      await conn.invoke("SaveCalibration", sid);
    } catch (err) {
      console.error("CalibrationPanel save failed:", err);
      setError("Could not save calibration data. Please try again.");
    }
  }, []);

  const handleClose = useCallback(() => {
    const conn = connectionRef.current;
    const sid = sessionIdRef.current;
    if (conn && conn.state === HubConnectionState.Connected && sid) {
      conn.invoke("CancelCalibration", sid).catch(() => {});
      conn.stop().catch(() => {});
    }
    onClose();
  }, [onClose]);

  // Auto-start session on mount
  useEffect(() => { startSession(); }, [startSession]);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: "#f3f4f6", fontSize: "1.3rem" }}>Stride Calibration</h2>
          <button onClick={handleClose} style={closeBtnStyle}>&times;</button>
        </div>

        {error && (
          <div style={{ background: "rgba(255, 92, 117, 0.15)", border: "1px solid #FF5C75", borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: "#FF5C75", fontSize: "0.85rem" }}>
            {error}
            <button onClick={startSession} style={{ ...secondaryBtnStyle, marginLeft: 8, padding: "4px 12px", fontSize: "0.8rem" }}>Retry</button>
          </div>
        )}

        {step === "connecting" && !error && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <p style={{ color: "#9ca3af" }}>Connecting to server...</p>
          </div>
        )}

        {step === "waiting-client" && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <p style={{ color: "#9ca3af", marginBottom: 12 }}>
              Open the PulseRealm app on the wearable and enter this code:
            </p>
            <div style={{ fontSize: "2.5rem", fontWeight: 700, fontFamily: "var(--mono)", color: "#33DFFF", letterSpacing: "0.15em", marginBottom: 16 }}>
              {joinCode}
            </div>
            <p style={{ color: "#666", fontSize: "0.8rem" }}>
              Waiting for wearable to connect...
            </p>
          </div>
        )}

        {step === "calibrating" && (() => {
          // Issue #18 — extract .find() result once, reuse below
          const recordedPoint = collectedPoints.find((p) => p.speedKmh === SPEED_GROUPS[currentGroup].targetSpeed);
          return (
          <div>
            {/* Progress */}
            <div style={{ display: "flex", marginBottom: 16 }}>
              {SPEED_GROUPS.map((_g, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  marginRight: i < SPEED_GROUPS.length - 1 ? 4 : 0,
                  background: i < currentGroup ? "#33DFFF"
                    : i === currentGroup ? (sampling ? "#FF5C75" : "rgba(51, 223, 255, 0.4)")
                    : "#2e303a",
                  transition: "background 0.3s",
                }} />
              ))}
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: 4 }}>{SPEED_GROUPS[currentGroup].icon}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f3f4f6", marginBottom: 4 }}>
                {SPEED_GROUPS[currentGroup].label}
              </div>
              <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "var(--mono)", color: "#33DFFF", marginBottom: 8 }}>
                {SPEED_GROUPS[currentGroup].targetSpeed} km/h
              </div>

              {!sampling && !recordedPoint && (
                <>
                  <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: 16 }}>
                    Set the treadmill to {SPEED_GROUPS[currentGroup].targetSpeed} km/h, then press Start.
                  </p>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button onClick={startSample} style={primaryBtnStyle}>Start</button>
                    <button onClick={skipGroup} style={{ ...secondaryBtnStyle, marginLeft: 8 }}>Skip</button>
                  </div>
                </>
              )}

              {sampling && (
                <div>
                  <div style={{
                    width: 80, height: 80, borderRadius: "50%", margin: "0 auto 12px",
                    border: "3px solid #FF5C75", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.8rem", fontWeight: 700, fontFamily: "var(--mono)", color: "#FF5C75",
                  }}>
                    {countdown}
                  </div>
                  <p style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
                    Recording... keep walking/running at {SPEED_GROUPS[currentGroup].targetSpeed} km/h
                  </p>
                </div>
              )}

              {!sampling && recordedPoint && (
                <div>
                  <div style={{ color: "#22c55e", fontWeight: 600, fontSize: "1rem", marginBottom: 8 }}>
                    Sample recorded
                  </div>
                  <div style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: 16 }}>
                    Stride factor: {recordedPoint.strideFactor.toFixed(4)}
                    {" "}({(heightCm * recordedPoint.strideFactor).toFixed(1)} cm)
                  </div>
                  <button onClick={nextGroup} style={primaryBtnStyle}>
                    {currentGroup < SPEED_GROUPS.length - 1 ? "Next Speed" : "View Results"}
                  </button>
                </div>
              )}
            </div>

            {/* Collected points so far */}
            {collectedPoints.length > 0 && (
              <div style={{ marginTop: 20, borderTop: "1px solid #2e303a", paddingTop: 12 }}>
                <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: 6 }}>Collected samples:</div>
                {collectedPoints.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 2 }}>
                    <span>{p.speedKmh} km/h</span>
                    <span>{(heightCm * p.strideFactor).toFixed(1)} cm (factor: {p.strideFactor.toFixed(4)})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {step === "results" && (
          <div>
            <p style={{ color: "#9ca3af", marginBottom: 16, textAlign: "center" }}>
              {collectedPoints.length >= 2
                ? "Calibration complete! Review your personal stride curve below."
                : "Not enough samples collected (minimum 2 required)."}
            </p>

            {/* Results table */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#666", borderBottom: "1px solid #2e303a", paddingBottom: 4, marginBottom: 6 }}>
                <span>Speed</span>
                <span>Your Stride</span>
                <span>Default Stride</span>
              </div>
              {collectedPoints.map((p, i) => {
                const defaultFactor = getSpeedDependentStrideFactor(p.speedKmh);
                const diff = ((p.strideFactor - defaultFactor) / defaultFactor) * 100;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#f3f4f6", marginBottom: 4, alignItems: "baseline" }}>
                    <span style={{ color: "#9ca3af" }}>{p.speedKmh} km/h</span>
                    <span style={{ fontFamily: "var(--mono)" }}>{(heightCm * p.strideFactor).toFixed(1)} cm</span>
                    <span style={{ fontFamily: "var(--mono)", color: "#666" }}>
                      {(heightCm * defaultFactor).toFixed(1)} cm
                      <span style={{ color: diff >= 0 ? "#33DFFF" : "#FF5C75", marginLeft: 4, fontSize: "0.75rem" }}>
                        {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {!saved ? (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  onClick={saveCalibration}
                  style={primaryBtnStyle}
                  disabled={collectedPoints.length < 2}
                >
                  Save to Device
                </button>
                <button onClick={handleClose} style={{ ...secondaryBtnStyle, marginLeft: 8 }}>Discard</button>
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#22c55e", fontWeight: 600, marginBottom: 12 }}>
                  Calibration saved to wearable device
                </div>
                <button onClick={handleClose} style={primaryBtnStyle}>Done</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles (Chrome 74 compatible — no flexbox gap) ──────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  background: "rgba(0, 0, 0, 0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  background: "#16171d",
  border: "1px solid #2e303a",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 480,
  maxHeight: "90vh",
  overflowY: "auto",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#666",
  fontSize: "1.5rem",
  cursor: "pointer",
  padding: "4px 8px",
  lineHeight: 1,
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#33DFFF",
  color: "#111",
  border: "none",
  borderRadius: 6,
  padding: "8px 24px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#9ca3af",
  border: "1px solid #2e303a",
  borderRadius: 6,
  padding: "8px 24px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};
