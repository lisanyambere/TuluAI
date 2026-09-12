import type {
  LiveSessionRequest,
  LiveSessionResponse,
  SupportedLanguage,
} from "@tulu/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type LiveVoiceLanguage = SupportedLanguage;

export type LiveVoiceStatus =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "connected"
  | "closing"
  | "ended"
  | "error";

export type LiveCaption = {
  speaker: "Tulu" | "You";
  text: string;
};

type StartOptions = Pick<LiveSessionRequest, "language" | "consentAcknowledged">;

type ServerEvent = Record<string, unknown> & {
  type?: string;
};

type Deferred = {
  resolve: () => void;
  reject: (reason: Error) => void;
};

const SESSION_START_TIMEOUT_MS = 20_000;
const SESSION_REQUEST_TIMEOUT_MS = 30_000;
const ICE_GATHERING_TIMEOUT_MS = 12_000;
const SESSION_CLOSE_TIMEOUT_MS = 15_000;
const MAX_CAPTION_LENGTH = 800;

class LiveVoiceError extends Error {}

function createEventId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tulu-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function getString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function getSessionEndpoint() {
  const configuredBaseUrl = import.meta.env.VITE_AGENT_API_URL?.trim().replace(/\/$/, "");
  return `${configuredBaseUrl ?? ""}/api/live/sessions`;
}

function openingInstructions(language: LiveVoiceLanguage) {
  if (language === "sw") {
    return [
      "Speak first, in clear and natural Kiswahili.",
      "Begin with this complete disclosure: Habari, mimi ni Tulu, msaidizi wa akili bandia wa kupata huduma za kliniki. Mimi si daktari wala huduma ya dharura. Ikiwa mtu yuko katika hatari ya haraka, wasiliana na huduma za dharura za eneo lako sasa. Ninaweza kukusaidiaje leo?",
      "After speaking the disclosure, stop and listen for the caller. Ask one short question at a time.",
    ].join(" ");
  }

  return [
    "Speak first, in clear and natural English.",
    "Begin with this complete disclosure: Hello, I’m Tulu, an AI clinic access assistant. I’m not a doctor or emergency service. If someone is in immediate danger, contact local emergency services now. How can I help you today?",
    "After speaking the disclosure, stop and listen for the caller. Ask one short question at a time.",
  ].join(" ");
}

function isLiveSessionResponse(value: unknown): value is LiveSessionResponse {
  const root = asRecord(value);
  const session = asRecord(root?.session);
  const transport = asRecord(root?.transport);

  return (
    typeof session?.id === "string" &&
    transport?.type === "webrtc" &&
    typeof transport.sdp === "string" &&
    transport.sdp.length > 0
  );
}

function waitForIceGathering(peerConnection: RTCPeerConnection, signal: AbortSignal) {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      finish();
      reject(new LiveVoiceError("The secure voice connection took too long. Please try again."));
    }, ICE_GATHERING_TIMEOUT_MS);

    const handleStateChange = () => {
      if (peerConnection.iceGatheringState !== "complete") return;
      finish();
      resolve();
    };

    const handleAbort = () => {
      finish();
      reject(new DOMException("The call was cancelled.", "AbortError"));
    };

    function finish() {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
      signal.removeEventListener("abort", handleAbort);
    }

    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function friendlyError(error: unknown) {
  if (error instanceof LiveVoiceError) return error.message;

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was blocked. Allow microphone access in your browser, then try again.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone and try again.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Your microphone is being used by another app. Close it there, then try again.";
    }
  }

  if (error instanceof TypeError) {
    return "We couldn’t reach Tulu. Check your internet connection and try again.";
  }

  return "Tulu couldn’t start the voice call. Please try again.";
}

function transcriptFromEvent(event: ServerEvent) {
  const direct = ["delta", "transcript", "text", "content"]
    .map((key) => getString(event, key))
    .find((value) => value !== undefined);

  if (direct !== undefined) return direct;

  const item = asRecord(event.item);
  return getString(item, "transcript") ?? getString(item, "text");
}

function captionSpeaker(event: ServerEvent): LiveCaption["speaker"] {
  const role = getString(event, "role") ?? getString(asRecord(event.item), "role");
  if (role === "user" || role === "caller") return "You";

  const type = event.type ?? "";
  return type.startsWith("session.input_transcript.") ||
    type.includes("input_audio") ||
    type.includes("input.transcription")
    ? "You"
    : "Tulu";
}

export function useLiveVoiceCall() {
  const [status, setStatus] = useState<LiveVoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<LiveCaption | null>(null);
  const [activityMessage, setActivityMessage] = useState("Ready to call");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const sessionStartedRef = useRef<Deferred | null>(null);
  const sessionClosedRef = useRef<(() => void) | null>(null);
  const pendingInstructionsEventRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const statusRef = useRef<LiveVoiceStatus>("idle");
  const languageRef = useRef<LiveVoiceLanguage>("en");
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const mountedRef = useRef(true);

  const updateStatus = useCallback((nextStatus: LiveVoiceStatus) => {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }, []);

  const releaseResources = useCallback(() => {
    sessionStartedRef.current?.reject(new DOMException("The call was cancelled.", "AbortError"));
    sessionClosedRef.current?.();
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;

    const dataChannel = dataChannelRef.current;
    if (dataChannel) {
      dataChannel.onopen = null;
      dataChannel.onclose = null;
      dataChannel.onerror = null;
      dataChannel.onmessage = null;
      if (dataChannel.readyState !== "closed") dataChannel.close();
    }
    dataChannelRef.current = null;

    const peerConnection = peerConnectionRef.current;
    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      if (peerConnection.connectionState !== "closed") peerConnection.close();
    }
    peerConnectionRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    const remoteAudio = remoteAudioRef.current;
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }

    sessionStartedRef.current = null;
    sessionClosedRef.current = null;
    pendingInstructionsEventRef.current = null;
  }, []);

  const failAttempt = useCallback(
    (message: string, attempt: number) => {
      if (attempt !== attemptRef.current) return;
      releaseResources();
      setError(message);
      setActivityMessage("Voice call unavailable");
      updateStatus("error");
    },
    [releaseResources, updateStatus],
  );

  const updateCaptionFromEvent = useCallback((event: ServerEvent) => {
    const type = event.type ?? "";
    if (!type.includes("transcript") && !type.includes("transcription")) return;

    const text = transcriptFromEvent(event);
    if (!text) return;

    const speakerName = captionSpeaker(event);
    const isDelta = type.endsWith(".delta");

    setCaption((current) => {
      if (!isDelta || current?.speaker !== speakerName) {
        return { speaker: speakerName, text: text.slice(-MAX_CAPTION_LENGTH) };
      }

      return {
        speaker: speakerName,
        text: `${current.text}${text}`.slice(-MAX_CAPTION_LENGTH),
      };
    });
  }, []);

  const handleServerEvent = useCallback(
    (event: ServerEvent, attempt: number) => {
      if (attempt !== attemptRef.current) return;
      const type = event.type ?? "";

      if (type === "session.started") {
        if (statusRef.current === "closing") {
          sessionStartedRef.current?.reject(new DOMException("The call was cancelled.", "AbortError"));
          sessionStartedRef.current = null;
          return;
        }

        const session = asRecord(event.session);
        const newSessionId = getString(session, "id") ?? getString(event, "session_id");
        if (newSessionId) setSessionId(newSessionId);

        sessionStartedRef.current?.resolve();
        sessionStartedRef.current = null;
        updateStatus("connected");
        setActivityMessage("Tulu is getting ready…");

        const channel = dataChannelRef.current;
        if (channel?.readyState === "open") {
          const eventId = createEventId();
          pendingInstructionsEventRef.current = eventId;
          channel.send(
            JSON.stringify({
              type: "session.instructions.append",
              event_id: eventId,
              delegation_id: null,
              content: openingInstructions(languageRef.current),
            }),
          );
        } else {
          setActivityMessage("Connected — you can speak now");
        }
      }

      if (type === "session.instructions.appended") {
        const acknowledgedEventId = getString(event, "client_event_id");
        if (acknowledgedEventId === pendingInstructionsEventRef.current) {
          pendingInstructionsEventRef.current = null;
          const channel = dataChannelRef.current;
          if (channel?.readyState === "open") {
            channel.send(
              JSON.stringify({
                type: "session.commentary.append",
                event_id: createEventId(),
                delegation_id: null,
                content: "Begin the conversation now, following the instructions provided.",
              }),
            );
            setActivityMessage("Tulu is speaking…");
          }
        }
      }

      if (type === "session.closed") {
        sessionClosedRef.current?.();
        sessionClosedRef.current = null;

        if (statusRef.current !== "closing") {
          releaseResources();
          setActivityMessage("Call ended");
          updateStatus("ended");
        }
        return;
      }

      if (type === "error") {
        sessionStartedRef.current?.reject(new LiveVoiceError("Tulu couldn’t continue this call."));
        sessionStartedRef.current = null;
        failAttempt("Tulu had trouble continuing the voice call. Please try again.", attempt);
        return;
      }

      if (type === "session.input_transcript.delta" || type.includes("speech_started")) {
        setActivityMessage("Listening to you…");
      } else if (
        type === "session.output_transcript.delta" ||
        (type.includes("output_audio") &&
          (type.endsWith(".delta") || type.endsWith(".started")))
      ) {
        setActivityMessage("Tulu is speaking…");
      } else if (
        type === "response.done" ||
        type.endsWith("output_audio.done") ||
        type.includes("speech_stopped")
      ) {
        setActivityMessage("Listening — you can speak now");
      }

      updateCaptionFromEvent(event);
    },
    [failAttempt, releaseResources, updateCaptionFromEvent, updateStatus],
  );

  const start = useCallback(
    async ({ language, consentAcknowledged }: StartOptions) => {
      if (!consentAcknowledged) return;

      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      releaseResources();
      languageRef.current = language;
      mutedRef.current = false;
      speakerRef.current = true;
      setMuted(false);
      setSpeaker(true);
      setCaption(null);
      setError(null);
      setSessionId(null);

      try {
        if (!window.isSecureContext) {
          throw new LiveVoiceError("Microphone access requires HTTPS or localhost.");
        }

        if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
          throw new LiveVoiceError("This browser doesn’t support live voice calls. Try a current version of Chrome, Safari, or Edge.");
        }

        updateStatus("requesting-permission");
        setActivityMessage("Waiting for microphone permission…");

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        if (attempt !== attemptRef.current) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = mediaStream;
        mediaStream.getAudioTracks().forEach((track) => {
          track.enabled = !mutedRef.current;
        });

        updateStatus("connecting");
        setActivityMessage("Connecting securely…");

        const abortController = new AbortController();
        requestAbortRef.current = abortController;
        const peerConnection = new RTCPeerConnection();
        peerConnectionRef.current = peerConnection;

        peerConnection.ontrack = (trackEvent) => {
          const remoteStream = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
          const remoteAudio = remoteAudioRef.current;
          if (!remoteAudio) return;

          remoteAudio.srcObject = remoteStream;
          remoteAudio.muted = !speakerRef.current;
          void remoteAudio.play().catch(() => {
            speakerRef.current = false;
            remoteAudio.muted = true;
            setSpeaker(false);
            setActivityMessage("Tap Speaker to hear Tulu");
          });
        };

        peerConnection.onconnectionstatechange = () => {
          if (attempt !== attemptRef.current) return;
          if (
            peerConnection.connectionState === "failed" &&
            (statusRef.current === "connecting" || statusRef.current === "connected")
          ) {
            failAttempt("The voice connection was interrupted. Please try again.", attempt);
          }
        };

        mediaStream.getTracks().forEach((track) => peerConnection.addTrack(track, mediaStream));

        const dataChannel = peerConnection.createDataChannel("oai-events");
        dataChannelRef.current = dataChannel;
        dataChannel.onmessage = (messageEvent) => {
          if (typeof messageEvent.data !== "string") return;
          try {
            handleServerEvent(JSON.parse(messageEvent.data) as ServerEvent, attempt);
          } catch {
            // Ignore malformed or non-JSON diagnostic events.
          }
        };
        dataChannel.onerror = () => {
          if (statusRef.current === "connecting" || statusRef.current === "connected") {
            failAttempt("The voice connection was interrupted. Please try again.", attempt);
          }
        };
        dataChannel.onclose = () => {
          if (attempt !== attemptRef.current || statusRef.current === "closing") return;
          if (statusRef.current === "connecting" || statusRef.current === "connected") {
            releaseResources();
            setActivityMessage("Call ended");
            updateStatus("ended");
          }
        };

        const sessionStarted = new Promise<void>((resolve, reject) => {
          sessionStartedRef.current = { resolve, reject };
        });
        void sessionStarted.catch(() => undefined);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await waitForIceGathering(peerConnection, abortController.signal);

        if (attempt !== attemptRef.current) return;
        const localSdp = peerConnection.localDescription?.sdp;
        if (!localSdp) {
          throw new LiveVoiceError("Tulu couldn’t prepare the voice connection. Please try again.");
        }

        let sessionRequestTimedOut = false;
        const sessionRequestTimeout = window.setTimeout(() => {
          sessionRequestTimedOut = true;
          abortController.abort();
        }, SESSION_REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          const requestBody: LiveSessionRequest = {
            sdp: localSdp,
            language,
            consentAcknowledged: true,
          };
          response = await fetch(getSessionEndpoint(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          });
        } catch (requestError) {
          if (sessionRequestTimedOut) {
            throw new LiveVoiceError("Tulu took too long to start the call. Please try again.");
          }
          throw requestError;
        } finally {
          window.clearTimeout(sessionRequestTimeout);
        }

        if (!response.ok) {
          if (response.status === 429) {
            throw new LiveVoiceError("Tulu is busy right now. Please wait a moment and try again.");
          }

          if (response.status >= 500) {
            throw new LiveVoiceError("Tulu is temporarily unavailable. Please try again shortly.");
          }

          throw new LiveVoiceError("Tulu couldn’t start this call. Please ask the demo team to check the service.");
        }

        const sessionResponse: unknown = await response.json();
        if (!isLiveSessionResponse(sessionResponse)) {
          throw new LiveVoiceError("Tulu received an incomplete connection response. Please try again.");
        }

        setSessionId(sessionResponse.session.id);
        await peerConnection.setRemoteDescription({
          type: "answer",
          sdp: sessionResponse.transport.sdp,
        });

        const sessionStartTimeout = window.setTimeout(() => {
          sessionStartedRef.current?.reject(
            new LiveVoiceError("Tulu took too long to join the call. Please try again."),
          );
          sessionStartedRef.current = null;
        }, SESSION_START_TIMEOUT_MS);

        try {
          await sessionStarted;
        } finally {
          window.clearTimeout(sessionStartTimeout);
        }
      } catch (caughtError) {
        if (attempt !== attemptRef.current) return;
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
        failAttempt(friendlyError(caughtError), attempt);
      }
    },
    [failAttempt, handleServerEvent, releaseResources, updateStatus],
  );

  const end = useCallback(async () => {
    const channel = dataChannelRef.current;
    const hadLiveSession =
      statusRef.current === "connected" || statusRef.current === "connecting";

    updateStatus("closing");
    setActivityMessage("Ending call…");
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (hadLiveSession && channel?.readyState === "open") {
      const sessionClosed = new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, SESSION_CLOSE_TIMEOUT_MS);
        sessionClosedRef.current = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });

      channel.send(
        JSON.stringify({
          type: "session.close",
          event_id: createEventId(),
        }),
      );
      await sessionClosed;
    }

    attemptRef.current += 1;
    releaseResources();
    setActivityMessage("Call ended");
    updateStatus("ended");
  }, [releaseResources, updateStatus]);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    releaseResources();
    mutedRef.current = false;
    speakerRef.current = true;
    setMuted(false);
    setSpeaker(true);
    setCaption(null);
    setError(null);
    setSessionId(null);
    setActivityMessage("Ready to call");
    updateStatus("idle");
  }, [releaseResources, updateStatus]);

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    const channel = dataChannelRef.current;
    if (statusRef.current === "connected" && channel?.readyState === "open") {
      channel.send(
        JSON.stringify({
          type: nextMuted ? "session.input_audio.mute" : "session.input_audio.unmute",
          event_id: createEventId(),
        }),
      );
    }
    setMuted(nextMuted);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const nextSpeaker = !speakerRef.current;
    speakerRef.current = nextSpeaker;
    const remoteAudio = remoteAudioRef.current;
    if (remoteAudio) {
      remoteAudio.muted = !nextSpeaker;
      if (nextSpeaker) {
        void remoteAudio.play().catch(() => {
          setActivityMessage("Your browser blocked audio playback. Tap Speaker once more.");
        });
      }
    }
    setSpeaker(nextSpeaker);
  }, []);

  const changeLanguage = useCallback((language: LiveVoiceLanguage) => {
    languageRef.current = language;

    const channel = dataChannelRef.current;
    if (statusRef.current !== "connected" || channel?.readyState !== "open") return;

    const content =
      language === "sw"
        ? "The caller selected Kiswahili. From now on, speak and respond only in clear, natural Kiswahili. Do not repeat the opening disclosure unless the caller asks."
        : "The caller selected English. From now on, speak and respond only in clear, natural English. Do not repeat the opening disclosure unless the caller asks.";

    channel.send(
      JSON.stringify({
        type: "session.instructions.append",
        event_id: createEventId(),
        delegation_id: null,
        content,
      }),
    );
    setActivityMessage(language === "sw" ? "Kiswahili selected" : "English selected");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      releaseResources();
    };
  }, [releaseResources]);

  return {
    status,
    error,
    caption,
    activityMessage,
    muted,
    speaker,
    sessionId,
    remoteAudioRef,
    start,
    end,
    reset,
    toggleMute,
    toggleSpeaker,
    changeLanguage,
  };
}
