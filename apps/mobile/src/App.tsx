import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Delete,
  Grid3X3,
  Headphones,
  Languages,
  MessageSquareText,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";

type CallStage = "idle" | "dialing" | "active" | "ended";

type KeyDefinition = {
  value: string;
  letters?: string;
};

const DEMO_NUMBER = "254000000000";
const KEYS: KeyDefinition[] = [
  { value: "1", letters: "" },
  { value: "2", letters: "ABC" },
  { value: "3", letters: "DEF" },
  { value: "4", letters: "GHI" },
  { value: "5", letters: "JKL" },
  { value: "6", letters: "MNO" },
  { value: "7", letters: "PQRS" },
  { value: "8", letters: "TUV" },
  { value: "9", letters: "WXYZ" },
  { value: "*" },
  { value: "0", letters: "+" },
  { value: "#" },
];

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const isDigitsOnly = /^\d+$/.test(value);

  if (isDigitsOnly && digits.startsWith("254")) {
    const country = digits.slice(0, 3);
    const rest = digits.slice(3);
    const groups = rest.match(/.{1,3}/g) ?? [];
    return `+${country}${groups.length ? ` ${groups.join(" ")}` : ""}`;
  }

  if (isDigitsOnly && digits.startsWith("0")) {
    const rest = digits.slice(4).match(/.{1,3}/g) ?? [];
    return [digits.slice(0, 4), ...rest].filter(Boolean).join(" ");
  }

  return value.match(/.{1,3}/g)?.join(" ") ?? value;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function Keypad({ onKey, compact = false }: { onKey: (key: string) => void; compact?: boolean }) {
  return (
    <div
      className={compact ? "keypad keypad--compact" : "keypad"}
      role="group"
      aria-label={compact ? "In-call keypad" : "Phone keypad"}
    >
      {KEYS.map((key) => (
        <button
          className="keypad__key"
          key={key.value}
          type="button"
          onClick={() => onKey(key.value)}
          aria-label={key.letters ? `${key.value}, ${key.letters}` : key.value}
        >
          <span className="keypad__number">{key.value}</span>
          <span className="keypad__letters">{key.letters || "\u00a0"}</span>
        </button>
      ))}
    </div>
  );
}

function Waveform({ muted }: { muted: boolean }) {
  return (
    <div className={muted ? "waveform waveform--paused" : "waveform"} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} />
      ))}
    </div>
  );
}

function App() {
  const [stage, setStage] = useState<CallStage>("idle");
  const [number, setNumber] = useState("");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showCaption, setShowCaption] = useState(true);
  const [language, setLanguage] = useState<"EN" | "SW">("EN");
  const [dialedDuringCall, setDialedDuringCall] = useState("");
  const stageFocusRef = useRef<HTMLDivElement>(null);
  const inCallKeypadRef = useRef<HTMLDivElement>(null);
  const keypadToggleRef = useRef<HTMLButtonElement>(null);
  const previousStage = useRef<CallStage>(stage);
  const previousKeypadVisibility = useRef(showKeypad);

  const displayNumber = useMemo(() => formatPhoneNumber(number), [number]);
  const destinationName = number === DEMO_NUMBER ? "Tulu" : "Tulu demo line";

  const appendNumber = useCallback((key: string) => {
    setNumber((current) => (current.length >= 15 ? current : `${current}${key}`));
  }, []);

  const resetControls = useCallback(() => {
    setMuted(false);
    setSpeaker(true);
    setShowKeypad(false);
    setShowCaption(true);
    setDialedDuringCall("");
  }, []);

  const startCall = useCallback(() => {
    if (!number) return;
    resetControls();
    setDuration(0);
    setStage("dialing");
  }, [number, resetControls]);

  const endCall = useCallback(() => {
    setShowKeypad(false);
    setStage("ended");
  }, []);

  const startAgain = useCallback(() => {
    resetControls();
    setDuration(0);
    setStage("idle");
  }, [resetControls]);

  useEffect(() => {
    if (stage !== "dialing") return;
    const connectionTimer = window.setTimeout(() => setStage("active"), 1750);
    return () => window.clearTimeout(connectionTimer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "active") return;
    const timer = window.setInterval(() => setDuration((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    const priorStage = previousStage.current;
    previousStage.current = stage;
    if (priorStage === stage) return;

    const frame = window.requestAnimationFrame(() => stageFocusRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);

  useEffect(() => {
    const wasVisible = previousKeypadVisibility.current;
    previousKeypadVisibility.current = showKeypad;
    if (wasVisible === showKeypad) return;

    const frame = window.requestAnimationFrame(() => {
      if (showKeypad) inCallKeypadRef.current?.focus();
      else keypadToggleRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showKeypad]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (stage === "idle") {
        if (/^[0-9*#]$/.test(event.key)) appendNumber(event.key);
        if (event.key === "Backspace") setNumber((current) => current.slice(0, -1));
        if (event.key === "Enter" && number) startCall();
      }

      if ((stage === "dialing" || stage === "active") && event.key === "Escape") {
        endCall();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appendNumber, endCall, number, stage, startCall]);

  const handleInCallKey = (key: string) => {
    setDialedDuringCall((current) => `${current}${key}`.slice(-8));
    if (key === "1") setLanguage("SW");
    if (key === "2") setLanguage("EN");
  };

  return (
    <main className="app-shell">
      <section className="story-panel" aria-labelledby="story-heading">
        <div className="story-panel__brand">
          <BrandMark />
          <span>TuluAI</span>
        </div>
        <div>
          <p className="eyebrow">Tulu</p>
          <h1 id="story-heading">Healthcare access starts with a conversation.</h1>
          <p className="story-panel__copy">
            A caller-first preview of the voice agent helping remote communities check before they travel.
          </p>
          <div className="story-panel__steps" aria-label="Demo steps">
            <span>01 · Dial</span>
            <span>02 · Connect</span>
            <span>03 · Ask</span>
          </div>
        </div>
        <p className="story-panel__note">
          Interface prototype · No real phone call, medical advice, or emergency request is placed.
        </p>
      </section>

      <section className="phone-stage" aria-label="Tulu call simulator">
        <div className={`phone-surface phone-surface--${stage}`}>
          <div className="ambient ambient--one" />
          <div className="ambient ambient--two" />

          <header className="phone-header">
            <div className="phone-header__brand">
              <BrandMark />
              <span>Tulu</span>
            </div>
            <div className="demo-pill">
              <span /> Demo call
            </div>
          </header>

          {stage === "idle" && (
            <div
              className="dialer-view stage-panel"
              ref={stageFocusRef}
              tabIndex={-1}
              aria-label="Demo dialer ready"
            >
              <div className="dialer-view__number" aria-live="polite">
                <span className={number ? "number-display" : "number-display number-display--empty"}>
                  {number ? displayNumber : "Enter number"}
                </span>
                {number ? (
                  <button
                    type="button"
                    className="clear-number"
                    onClick={() => setNumber("")}
                    aria-label="Clear phone number"
                  >
                    Clear
                  </button>
                ) : (
                  <button
                    type="button"
                    className="demo-number"
                    onClick={() => setNumber(DEMO_NUMBER)}
                  >
                    Use demo line · +254 000 000 000
                  </button>
                )}
              </div>

              <Keypad onKey={appendNumber} />

              <div className="dialer-actions">
                <span className="dialer-actions__spacer" />
                <button
                  type="button"
                  className="call-button"
                  onClick={startCall}
                  disabled={!number}
                  aria-label="Start demo call"
                >
                  <Phone aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => setNumber((current) => current.slice(0, -1))}
                  disabled={!number}
                  aria-label="Delete last digit"
                >
                  <Delete aria-hidden="true" />
                </button>
              </div>

              <nav className="dialer-nav" aria-label="Phone navigation">
                <button type="button" className="dialer-nav__item dialer-nav__item--active">
                  <Grid3X3 aria-hidden="true" />
                  <span>Keypad</span>
                </button>
                <button type="button" className="dialer-nav__item" disabled>
                  <Clock3 aria-hidden="true" />
                  <span>Recents</span>
                </button>
                <button type="button" className="dialer-nav__item" disabled>
                  <UserRound aria-hidden="true" />
                  <span>Contacts</span>
                </button>
              </nav>
            </div>
          )}

          {(stage === "dialing" || stage === "active") && (
            <div
              className="call-view stage-panel"
              ref={stageFocusRef}
              tabIndex={-1}
              aria-label={stage === "dialing" ? "Demo call is connecting" : "Simulated call connected"}
            >
              <div className="call-status" aria-live={stage === "dialing" ? "polite" : undefined}>
                {stage === "dialing" ? (
                  <span className="call-status__connecting">
                    <span /> Calling…
                  </span>
                ) : (
                  <>
                    <span className="sr-only" role="status">Simulated call connected</span>
                    <span
                      className="call-status__timer"
                      aria-label={`Elapsed demo call time ${formatDuration(duration)}`}
                    >
                      {formatDuration(duration)}
                    </span>
                  </>
                )}
              </div>

              <div className="call-identity">
                <div className="call-identity__avatar" aria-hidden="true">
                  <BrandMark />
                  {stage === "dialing" && <span className="call-identity__ring" />}
                </div>
                <p>{destinationName}</p>
                <span>{displayNumber} · Browser simulation</span>
              </div>

              <div className="conversation-zone">
                {showKeypad ? (
                  <div
                    className="in-call-keypad"
                    ref={inCallKeypadRef}
                    tabIndex={-1}
                    aria-label="In-call keypad. Press 1 for Kiswahili or 2 for English."
                  >
                    <div className="in-call-keypad__header">
                      <div>
                        <span>Keypad</span>
                        <strong>{dialedDuringCall || "\u00a0"}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowKeypad(false)}
                        aria-label="Hide in-call keypad"
                      >
                        <ChevronDown aria-hidden="true" />
                        <span>Hide</span>
                      </button>
                    </div>
                    <Keypad onKey={handleInCallKey} compact />
                    <p>1 · Kiswahili&nbsp;&nbsp; 2 · English&nbsp;&nbsp; Other tones are demo only</p>
                  </div>
                ) : (
                  <div className="agent-presence">
                    <div className={muted ? "agent-orb agent-orb--muted" : "agent-orb"}>
                      <Waveform muted={muted} />
                    </div>
                    <div>
                      <strong>
                        {muted
                          ? "Demo mute is on"
                          : stage === "dialing"
                            ? "Preparing demo call"
                            : "Simulated call connected"}
                      </strong>
                      <span>
                        {stage === "dialing"
                          ? "No real call is being placed"
                          : "No live microphone or audio in this build"}
                      </span>
                    </div>
                  </div>
                )}

                {stage === "active" && showCaption && !showKeypad && (
                  <div className="caption-card">
                    <div className="caption-card__label">
                      <MessageSquareText aria-hidden="true" />
                      Demo caption
                    </div>
                    <p>
                      {language === "EN"
                        ? "Hello, you’re connected to the Tulu interface demo."
                        : "Hujambo, umeunganishwa na mfano wa Tulu."}
                    </p>
                  </div>
                )}
              </div>

              <div className="call-controls" role="group" aria-label="Simulated call controls">
                <button
                  type="button"
                  className={muted ? "control-button control-button--active" : "control-button"}
                  onClick={() => setMuted((current) => !current)}
                  aria-pressed={muted}
                >
                  <span>{muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}</span>
                  <small>{muted ? "Unmute" : "Mute"}</small>
                </button>
                <button
                  type="button"
                  className={showKeypad ? "control-button control-button--active" : "control-button"}
                  onClick={() => setShowKeypad((current) => !current)}
                  aria-pressed={showKeypad}
                  ref={keypadToggleRef}
                >
                  <span><Grid3X3 aria-hidden="true" /></span>
                  <small>Keypad</small>
                </button>
                <button
                  type="button"
                  className={speaker ? "control-button control-button--active" : "control-button"}
                  onClick={() => setSpeaker((current) => !current)}
                  aria-pressed={speaker}
                >
                  <span>{speaker ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}</span>
                  <small>Speaker</small>
                </button>
                <button
                  type="button"
                  className={showCaption ? "control-button control-button--active" : "control-button"}
                  onClick={() => setShowCaption((current) => !current)}
                  aria-pressed={showCaption}
                >
                  <span><MessageSquareText aria-hidden="true" /></span>
                  <small>Captions</small>
                </button>
                <button
                  type="button"
                  className="control-button"
                  onClick={() => setLanguage((current) => (current === "EN" ? "SW" : "EN"))}
                >
                  <span><Languages aria-hidden="true" /></span>
                  <small>{language}</small>
                </button>
                <button type="button" className="control-button" disabled>
                  <span><Headphones aria-hidden="true" /></span>
                  <small>Person</small>
                </button>
              </div>

              <button type="button" className="end-call-button" onClick={endCall} aria-label="End demo call">
                <PhoneOff aria-hidden="true" />
              </button>
            </div>
          )}

          {stage === "ended" && (
            <div
              className="ended-view stage-panel"
              ref={stageFocusRef}
              tabIndex={-1}
              aria-label="Demo call ended"
            >
              <div className="ended-view__icon">
                <ShieldCheck aria-hidden="true" />
              </div>
              <p className="eyebrow">Demo complete</p>
              <h2>Call ended</h2>
              <p>
                You explored the caller interface for {formatDuration(duration)}. No real call or healthcare request was placed.
              </p>
              <div className="ended-view__receipt">
                <span>Destination</span>
                <strong>{destinationName}</strong>
                <span>Outcome</span>
                <strong>Interface preview only</strong>
              </div>
              <button type="button" className="start-again-button" onClick={startAgain}>
                <RotateCcw aria-hidden="true" />
                Start another demo
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
