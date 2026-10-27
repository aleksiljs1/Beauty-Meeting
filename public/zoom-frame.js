"use strict";

(() => {
  // Zoom's own error code/message (no secrets in it), shown so a failed join can be diagnosed.
  const zoomReason = (failure) => {
    const code = failure?.errorCode ?? failure?.result?.errorCode;
    const text = failure?.errorMessage ?? failure?.reason ?? failure?.result?.errorMessage;
    console.error("[zoom-frame] Zoom error", failure);
    return code || text ? ` (Zoom: ${[code, text].filter(Boolean).join(" – ")})` : "";
  };

  const VERSION = "6.5.0";
  // Web SDK error when a participant joins before the host started (join before host is off).
  const MEETING_NOT_STARTED = 3008;
  const message = document.getElementById("message");
  const errorElement = document.getElementById("error");

  let joinStarted = false;

  function notifyParent(type, details = {}) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { type, ...details },
        window.location.origin,
      );
    }
  }

  function showError(text) {
    message.textContent = "Nuk mund të lidhemi me Zoom.";
    errorElement.textContent = text;
    errorElement.hidden = false;
    notifyParent("BEAUTY_ZOOM_FRAME_ERROR", { message: text });
  }

  // Zoom returns to this frame after leaving a meeting.
  if (new URLSearchParams(window.location.search).get("left") === "1") {
    message.textContent = "U larguat nga takimi.";
    notifyParent("BEAUTY_ZOOM_LEFT");
    return;
  }

  const zoom = window.ZoomMtg;

  if (!zoom) {
    showError("SDK i Zoom nuk u ngarkua. Kontrolloni lidhjen dhe CSP.");
    return;
  }

  message.textContent = "Zoom u ngarkua. Në pritje të autorizimit...";
  notifyParent("BEAUTY_ZOOM_FRAME_READY");

  window.addEventListener("message", (event) => {
    // Accept classroom details only from the parent page on this exact origin.
    if (event.origin !== window.location.origin || event.source !== window.parent) {
      return;
    }
    
    if (!event.data || event.data.type !== "BEAUTY_ZOOM_JOIN" || joinStarted) {
      return;
    }

    const config = event.data.payload;

    if (!config || typeof config !== "object") {
      showError("Konfigurimi i klasës është i pavlefshëm.");
      return;
    }

    const {
      mode,
      signature,
      meetingNumber,
      password,
      userName,
      zak,
    } = config;

    const isHost = mode === "host";
    const validMeetingNumber = /^\d{9,12}$/.test(String(meetingNumber ?? ""));

    if (
      (mode !== "host" && mode !== "student") ||
      typeof signature !== "string" ||
      signature.length > 8192 ||
      !validMeetingNumber ||
      typeof userName !== "string" ||
      !userName.trim() ||
      userName.length > 100 ||
      (password != null && typeof password !== "string") ||
      (isHost && (typeof zak !== "string" || !zak))
    ) {
      showError("Të dhënat e autorizimit të klasës janë të pavlefshme.");
      return;
    }

    joinStarted = true;
    message.textContent = "Po përgatitet klasa live...";

    try {
      // Load the Zoom interface only after the server-authorized join request.
      zoom.setZoomJSLib(`https://source.zoom.us/${VERSION}/lib`, "/av");
      zoom.preLoadWasm();
      zoom.prepareWebSDK();
    } catch {
      showError("Përgatitja e Zoom SDK dështoi.");
      joinStarted = false;
      return;
    }

    message.textContent = "Po lidhemi me klasën...";

    try {
      zoom.init({
        leaveUrl: `${window.location.origin}/zoom-frame.html?left=1`,
        patchJsMedia: true,
        disableCORP: !window.crossOriginIsolated,

        success: () => {
          zoom.join({
            signature,
            meetingNumber: String(meetingNumber),
            passWord: password || "",
            userName: userName.trim(),

            ...(isHost ? { zak } : {}),

            success: () => {
              document.getElementById("status").hidden = true;
              notifyParent("BEAUTY_ZOOM_JOINED", { mode });
            },

            error: (failure) => {
              if ((failure?.errorCode ?? failure?.result?.errorCode) === MEETING_NOT_STARTED) {
                showError("Mësuesja nuk e ka nisur ende klasën. Provoni përsëri pas pak.");
                joinStarted = false;
                return;
              }
              showError(`Zoom nuk mundi të të fusë në takim. Kontrolloni autorizimin dhe konfigurimin.${zoomReason(failure)}`);
              joinStarted = false;
            },
          });
        },

        error: (failure) => {
          showError(`Inicializimi i Zoom dështoi.${zoomReason(failure)}`);
          joinStarted = false;
        },
      });
    } catch {
      showError("Ndodhi një gabim gjatë nisjes së Zoom.");
      joinStarted = false;
    }
  });
})();
