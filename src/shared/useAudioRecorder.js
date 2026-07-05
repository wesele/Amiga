/**
 * Browser/Tauri WebView microphone recorder.
 * Returns base64 webm/opus audio suitable for multimodal API upload.
 */
export function useAudioRecorder() {
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {Blob[]} */
  let chunks = [];

  async function ensurePermission() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not available in this environment");
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  async function start() {
    await stopTracks();
    chunks = [];
    await ensurePermission();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.start();
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    recorder = null;
  }

  /**
   * @returns {Promise<{ base64: string, format: string, blob: Blob }>}
   */
  function stop() {
    return new Promise((resolve, reject) => {
      if (!recorder) {
        reject(new Error("Not recording"));
        return;
      }
      const active = recorder;
      active.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: active.mimeType || "audio/webm" });
          if (blob.size < 800) {
            reject(new Error("Recording too short"));
            stopTracks();
            return;
          }
          const base64 = await blobToBase64(blob);
          const format = blob.type.includes("webm") ? "webm" : "wav";
          stopTracks();
          resolve({ base64, format, blob });
        } catch (err) {
          stopTracks();
          reject(err);
        }
      };
      active.onerror = () => {
        stopTracks();
        reject(new Error("Recording failed"));
      };
      if (active.state !== "inactive") active.stop();
    });
  }

  function cancel() {
    chunks = [];
    stopTracks();
  }

  return { start, stop, cancel };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Failed to read audio"));
        return;
      }
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error("Failed to read audio"));
    reader.readAsDataURL(blob);
  });
}
