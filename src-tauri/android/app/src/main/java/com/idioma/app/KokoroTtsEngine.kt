package com.idioma.app

import android.content.Context
import android.os.Build
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import dev.ffmpegkit.kokoro.KokoroTTS
import dev.ffmpegkit.kokoro.KokoroVoice
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking

/**
 * On-device Kokoro TTS. The ONNX model (~310 MB) is not packaged in the APK;
 * it is downloaded the first time the user selects this engine.
 *
 * Native synthesis and playback run off the main thread. Progress and
 * completion are posted back to the WebView as JSON via
 * `window.__amigaTtsProgress`.
 */
class KokoroTtsEngine(private val context: Context) {
    private val worker = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "amiga-kokoro-tts").apply { isDaemon = true }
    }
    private val mainHandler = Handler(Looper.getMainLooper())
    private val cancelled = AtomicBoolean(false)
    private val generation = AtomicInteger(0)
    private val downloading = AtomicBoolean(false)
    private var initialized = false
    private var audioTrack: AudioTrack? = null
    private var downloadedBytes = 0L

    fun modelFile(): File = File(context.getExternalFilesDir(null) ?: context.filesDir, MODEL_FILE_NAME)

    fun modelReady(): Boolean {
        val file = modelFile()
        return file.isFile && file.length() >= MIN_MODEL_BYTES
    }

    fun supportedAbi(): Boolean = Build.SUPPORTED_ABIS.contains("arm64-v8a")

    fun statusJson(): String {
        val file = modelFile()
        val ready = modelReady()
        val bytes = when {
            downloading.get() -> downloadedBytes
            file.isFile -> file.length()
            else -> 0L
        }
        return jsonObject(
            "engine" to "kokoro",
            "ready" to ready,
            "downloading" to downloading.get(),
            "supported" to supportedAbi(),
            "bytes" to bytes,
            "totalBytes" to EXPECTED_MODEL_BYTES,
        )
    }

    fun speak(webView: WebView, text: String, langTag: String): String {
        if (text.isBlank()) return "empty"
        cancelled.set(false)
        val gen = generation.incrementAndGet()
        if (!supportedAbi()) return "unsupported-abi"
        worker.execute {
            try {
                if (cancelled.get() || gen != generation.get()) return@execute
                ensureModel(webView, gen)
                if (cancelled.get() || gen != generation.get()) return@execute
                ensureInitialized()
                applyVoiceForLang(langTag)
                if (cancelled.get() || gen != generation.get()) return@execute
                val chunks = splitText(text, 400)
                if (chunks.isEmpty()) {
                    notifyError(webView, "empty")
                    return@execute
                }
                chunks.forEachIndexed { index, chunk ->
                    if (cancelled.get() || gen != generation.get()) return@execute
                    notifyProgress(webView, jsonObject(
                        "state" to "synthesizing",
                        "engine" to "kokoro",
                        "chunk" to index + 1,
                        "chunks" to chunks.size,
                    ))
                    val result = runBlocking { KokoroTTS.speak(chunk) }
                    if (cancelled.get() || gen != generation.get()) return@execute
                    playWav(result.audioData, result.sampleRate, webView, gen, index == chunks.lastIndex)
                }
            } catch (t: Throwable) {
                if (t is InterruptedException || cancelled.get() || gen != generation.get()) return@execute
                Log.w(TAG, "Kokoro speak failed", t)
                notifyError(webView, t.message ?: "kokoro-failed")
            }
        }
        return "ok"
    }

    fun ensureReady(webView: WebView): String {
        if (!supportedAbi()) return "unsupported-abi"
        if (modelReady() && initialized) {
            notifyProgress(webView, jsonObject("state" to "ready", "engine" to "kokoro"))
            return "ready"
        }
        cancelled.set(false)
        val gen = generation.incrementAndGet()
        worker.execute {
            try {
                ensureModel(webView, gen)
                if (cancelled.get() || gen != generation.get()) return@execute
                ensureInitialized()
                if (cancelled.get() || gen != generation.get()) return@execute
                notifyProgress(webView, jsonObject("state" to "ready", "engine" to "kokoro"))
            } catch (t: Throwable) {
                if (t is InterruptedException || cancelled.get() || gen != generation.get()) return@execute
                Log.w(TAG, "Kokoro prepare failed", t)
                notifyError(webView, t.message ?: "kokoro-failed")
            }
        }
        return if (modelReady()) "ready" else "downloading"
    }

    fun stop() {
        cancelled.set(true)
        generation.incrementAndGet()
        try {
            audioTrack?.pause()
        } catch (_: Throwable) {
        }
        try {
            audioTrack?.stop()
        } catch (_: Throwable) {
        }
        try {
            audioTrack?.release()
        } catch (_: Throwable) {
        }
        audioTrack = null
    }

    fun release() {
        stop()
        worker.execute {
            try {
                if (initialized) {
                    KokoroTTS.release()
                    initialized = false
                }
            } catch (t: Throwable) {
                Log.w(TAG, "Kokoro release failed", t)
            }
        }
    }

    private fun ensureInitialized() {
        if (initialized) return
        val path = modelFile().absolutePath
        runBlocking {
            KokoroTTS.initialize(context, path, KokoroVoice.AF_HEART)
        }
        initialized = true
    }

    private fun applyVoiceForLang(langTag: String) {
        val family = langTag.substringBefore('-').lowercase()
        val espeak = when (family) {
            "es" -> "es"
            "zh" -> "cmn"
            else -> "en-us"
        }
        val base = KokoroVoice.AF_HEART
        val voice = if (espeak == base.espeakLang) {
            base
        } else {
            KokoroVoice(base.id, base.name, langTag, espeak, base.gender, base.grade)
        }
        KokoroTTS.setVoice(voice)
    }

    private fun splitText(text: String, maxChunkSize: Int): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.length <= maxChunkSize) return listOf(trimmed)
        val chunks = mutableListOf<String>()
        var index = 0
        while (index < trimmed.length) {
            var end = (index + maxChunkSize).coerceAtMost(trimmed.length)
            if (end < trimmed.length) {
                val slice = trimmed.substring(index, end)
                val lastBreak = listOf(slice.lastIndexOf('。'), slice.lastIndexOf('.'), slice.lastIndexOf(' '), slice.lastIndexOf('\n'))
                    .filter { it > 0 }
                    .maxOrNull()
                if (lastBreak != null) end = index + lastBreak + 1
            }
            val chunk = trimmed.substring(index, end).trim()
            if (chunk.isNotEmpty()) chunks.add(chunk)
            index = if (end <= index) index + 1 else end
        }
        return chunks
    }

    private fun ensureModel(webView: WebView, gen: Int) {
        if (modelReady()) return
        downloading.set(true)
        val dest = modelFile()
        val tmp = File(dest.parentFile, "$MODEL_FILE_NAME.part")
        dest.parentFile?.mkdirs()
        notifyProgress(webView, jsonObject(
            "state" to "downloading",
            "engine" to "kokoro",
            "bytes" to 0L,
            "totalBytes" to EXPECTED_MODEL_BYTES,
        ))

        var lastNotifyAt = 0L
        var downloaded = 0L
        downloadedBytes = 0L
        var total = EXPECTED_MODEL_BYTES
        val conn = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 30_000
            readTimeout = 60_000
            setRequestProperty("User-Agent", "Amiga-Kokoro/1.0")
            connect()
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("download-failed:$code")
            }
            total = conn.contentLengthLong.takeIf { it > 0 } ?: EXPECTED_MODEL_BYTES
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { output ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        if (cancelled.get() || gen != generation.get()) {
                            throw InterruptedException("cancelled")
                        }
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        downloaded += n
                        downloadedBytes = downloaded
                        val now = System.currentTimeMillis()
                        if (now - lastNotifyAt >= 400) {
                            lastNotifyAt = now
                            notifyProgress(webView, jsonObject(
                                "state" to "downloading",
                                "engine" to "kokoro",
                                "bytes" to downloaded,
                                "totalBytes" to total,
                            ))
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
            if (!modelReady()) downloading.set(false)
        }

        if (downloaded < MIN_MODEL_BYTES) {
            tmp.delete()
            throw IllegalStateException("download-incomplete")
        }
        if (dest.exists() && !dest.delete()) {
            throw IllegalStateException("replace-failed")
        }
        if (!tmp.renameTo(dest)) {
            tmp.copyTo(dest, overwrite = true)
            tmp.delete()
        }
        downloading.set(false)
        notifyProgress(webView, jsonObject(
            "state" to "downloaded",
            "engine" to "kokoro",
            "bytes" to dest.length(),
            "totalBytes" to total,
        ))
    }

    private fun playWav(
        wav: ByteArray,
        sampleRate: Int,
        webView: WebView,
        gen: Int,
        notifyComplete: Boolean,
    ) {
        if (wav.size <= WAV_HEADER_BYTES) {
            notifyError(webView, "empty-audio")
            return
        }
        val pcm = wav.copyOfRange(WAV_HEADER_BYTES, wav.size)
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(pcm.size.coerceAtLeast(minBuf))
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        audioTrack = track
        track.write(pcm, 0, pcm.size)
        if (cancelled.get() || gen != generation.get()) {
            track.release()
            if (audioTrack === track) audioTrack = null
            return
        }
        notifyProgress(webView, jsonObject(
            "state" to "playing",
            "engine" to "kokoro",
        ))
        track.play()
        val durationMs = ((pcm.size / 2) * 1000L) / sampleRate.coerceAtLeast(1)
        val deadline = System.currentTimeMillis() + durationMs + 400
        while (System.currentTimeMillis() < deadline) {
            if (cancelled.get() || gen != generation.get()) break
            try {
                Thread.sleep(80)
            } catch (_: InterruptedException) {
                break
            }
        }
        try {
            track.stop()
        } catch (_: Throwable) {
        }
        try {
            track.release()
        } catch (_: Throwable) {
        }
        if (audioTrack === track) audioTrack = null
        if (notifyComplete && !cancelled.get() && gen == generation.get()) {
            notifyDone(webView)
        }
    }

    private fun notifyProgress(webView: WebView, json: String) {
        val escaped = json.replace("\\", "\\\\").replace("'", "\\'")
        mainHandler.post {
            webView.evaluateJavascript(
                "window.__amigaTtsProgress&&window.__amigaTtsProgress('$escaped')",
                null,
            )
        }
    }

    private fun notifyDone(webView: WebView) {
        mainHandler.post {
            webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
        }
    }

    private fun notifyError(webView: WebView, reason: String) {
        notifyProgress(webView, jsonObject(
            "state" to "error",
            "engine" to "kokoro",
            "message" to reason,
        ))
        val safe = reason.replace("\\", "\\\\").replace("'", "\\'")
        mainHandler.post {
            webView.evaluateJavascript(
                "window.__amigaTtsError&&window.__amigaTtsError('$safe')",
                null,
            )
        }
    }

    private fun jsonObject(vararg pairs: Pair<String, Any?>): String {
        val body = pairs.joinToString(",") { (k, v) ->
            val encoded = when (v) {
                null -> "null"
                is Boolean, is Number -> v.toString()
                else -> "\"${v.toString().replace("\\", "\\\\").replace("\"", "\\\"")}\""
            }
            "\"$k\":$encoded"
        }
        return "{$body}"
    }

    companion object {
        private const val TAG = "Amiga/Kokoro"
        const val ENGINE_ID = "kokoro"
        const val MODEL_FILE_NAME = "kokoro.onnx"
        // Official Kokoro-82M ONNX export used by kokoro-android (~310 MB).
        const val MODEL_URL =
            "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx"
        const val EXPECTED_MODEL_BYTES = 325_532_232L
        const val MIN_MODEL_BYTES = 50_000_000L
        private const val WAV_HEADER_BYTES = 44
    }
}
