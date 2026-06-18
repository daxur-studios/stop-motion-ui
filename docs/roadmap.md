# Roadmap / Future Ideas

## Feature: TTS narration for replays

- Use Daxur Daemon's local TTS capability (Chatterbox TTS) to generate spoken narration for replay sequences
- Generate two variants per capture: a short version (concise) and a long version (detailed walkthrough)
- Each event/step in the manifest gets an optional narration text field; that text is converted to a TTS audio clip per step

### Open problem: timing sync

- Each step has a visual duration (cursor movement, circle gesture, screenshot transition) and a narration audio duration (TTS clip length)
- These durations are unlikely to match — narration might run longer or shorter than the visual action
- Proposed approach: per step, duration = whichever is longer (visual action vs narration audio) — wait for both to finish before advancing to the next step in the sequence
- Not yet decided: should visual actions ever be sped up/extended to better match narration length (e.g. slow down a cursor move so it doesn't finish way before the voice line), or always just wait at the end if the visual is shorter?
