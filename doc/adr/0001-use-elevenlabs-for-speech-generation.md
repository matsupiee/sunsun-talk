# 0001: Use ElevenLabs for speech generation

## Status

Accepted

## Date

2026-07-23

## Context

The app generates short character replies with the OpenAI API and plays generated audio in the browser. The previous speech path used OpenAI TTS directly from the `/api/talk` route.

The product goal changed to use ElevenLabs Voice Cloning so the spoken response can use a cloned voice managed in ElevenLabs. Voice cloning itself is a separate setup step that produces a `voice_id`; runtime conversation requests should reuse that configured voice instead of creating or updating a voice clone per request.

## Decision

Replace the OpenAI TTS speech-generation service with an ElevenLabs text-to-speech service.

The Worker now calls ElevenLabs `text-to-speech/:voice_id` when both `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are configured. OpenAI remains responsible for text reply generation. The API response can now report `mode: "elevenlabs"` when generated speech is returned.

The following environment variables define the ElevenLabs speech path:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`, optional, defaulting to `eleven_multilingual_v2`
- `ELEVENLABS_OUTPUT_FORMAT`, optional, defaulting to `mp3_44100_128`

If ElevenLabs credentials are missing, `/api/talk` still returns text without generated audio. If ElevenLabs speech generation fails, the route preserves the text reply and returns a warning rather than failing the whole conversation.

## Consequences

The app can now use a voice cloned through ElevenLabs while keeping the existing browser audio playback contract.

Deployments must configure ElevenLabs secrets before generated speech is available. Local development can use `.dev.vars` for the same values.

Voice style is primarily controlled by the cloned ElevenLabs voice and model settings. The old OpenAI-specific voice instruction prompt is no longer part of runtime speech generation.

The app does not perform voice-clone creation itself. This keeps runtime conversation latency and authorization simpler, but it means voice creation, consent, and voice lifecycle management stay in ElevenLabs.
