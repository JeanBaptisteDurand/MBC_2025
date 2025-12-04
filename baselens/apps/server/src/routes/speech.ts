// ============================================
// Speech-to-Text Route using OpenAI Whisper
// ============================================

import { Router, Request, Response } from "express";
import { logger } from "../logger.js";
import { getOpenAIClient } from "../ai/openai.js";
import { File } from "buffer";

const router: ReturnType<typeof Router> = Router();

// ============================================
// POST /api/speech/transcribe - Transcribe audio to text
// ============================================

router.post("/transcribe", async (req, res) => {
  try {
    // Get the raw audio data from request body
    // Frontend sends audio as base64 encoded string with mimeType
    const { audio, mimeType = "audio/webm" } = req.body;

    if (!audio) {
      return res.status(400).json({
        error: "Missing audio data",
        message: "Please provide base64 encoded audio data",
      });
    }

    logger.info(`[Speech] Transcription request received`);
    logger.debug(`[Speech] MIME type: ${mimeType}`);

    // Decode base64 audio
    const audioBuffer = Buffer.from(audio, "base64");
    logger.info(`[Speech] Audio size: ${audioBuffer.length} bytes`);

    // Determine file extension from mime type
    const extensionMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
      "audio/m4a": "m4a",
    };

    const extension = extensionMap[mimeType] || "webm";

    // Create a File object for the OpenAI API
    const audioFile = new File([audioBuffer], `audio.${extension}`, {
      type: mimeType,
    });

    const client = getOpenAIClient();
    const startTime = Date.now();

    logger.info(`[Speech] Sending to OpenAI Whisper API...`);

    // Call OpenAI's transcription API
    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en", // Can be made configurable
      response_format: "json",
    });

    const duration = Date.now() - startTime;
    logger.info(`[Speech] ✅ Transcription complete (${duration}ms)`);
    logger.info(`[Speech] Result: "${transcription.text}"`);

    return res.json({
      success: true,
      text: transcription.text,
      duration,
    });
  } catch (error: any) {
    logger.error("[Speech] ❌ Transcription failed:", error);

    // Handle specific OpenAI errors
    if (error?.status === 400) {
      return res.status(400).json({
        error: "Invalid audio",
        message: "The audio file could not be processed. Please try again.",
      });
    }

    return res.status(500).json({
      error: "Transcription failed",
      message: process.env.NODE_ENV === "development" ? error.message : "An error occurred during transcription",
    });
  }
});

export default router;
