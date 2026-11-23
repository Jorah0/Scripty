# Scripty — AI Script Studio

A Windows desktop app for writing, revising and performing scripts with AI. Use one AI for quick work, or several together in a **Writers' Room**.

![logo](build/icon.png)

## What it does

| Area | Features |
|---|---|
| **AI engines** | Claude, ChatGPT, Gemini, Ollama (local), LM Studio (local), OpenRouter, Groq, Mistral, DeepSeek, Grok, Together AI, and any custom OpenAI-compatible server. Streaming output, a stop button, and a model list fetched from each provider. |
| **Single or multi-AI** | **Single AI**, or a **Writers' Room** with three strategies: *Draft & Merge* (every AI drafts in parallel, then a lead AI merges the best parts), *Relay* (Outline → Draft → Critique → Polish, with a different AI per stage), *Compete & Judge* (every AI drafts, a judge scores them and picks a winner). All drafts stay viewable side by side. |
| **Tasks** | Create from scratch · Revise an existing script · Fix & Polish (keeps the author's voice) · Continue · Adapt source material into a new format. |
| **21 script types** | YouTube, Shorts/TikTok/Reels, ASMR, podcast, audio drama, screenplay, TV episode, stage play, commercial, sales letter/VSL, explainer, tutorial, documentary, voiceover, audiobook, meditation/sleep story, speech, livestream run-of-show, interview, comedy sketch, game dialogue, and written pieces. Each type has its own conventions, speaking rate, typical length and element options (e.g. ASMR triggers, YouTube hooks/CTAs). |
| **Brief** | Title, ideas (with AI brainstorm), focus, audience, tone chips, tags, point of view, rating, language (25), number of people and character notes, extra instructions, and toggles for SFX, music, pauses, visual notes and timestamps. **Prompt preview** shows the exact prompt and lets you edit it. |
| **Length** | Set a target in minutes, seconds, words or pages. Scripty converts it at that type's speaking rate (or your own WPM), shows typical ranges and sweet spots, and tracks runtime live (pauses included). One-click **Trim/Expand to target**. Also shows speaker share, readability and sentence length. |
| **Assist** | Applies to a selection or the whole script: Rewrite, Shorten, Expand, Punch up, Simplify, Fix grammar, Funnier, More emotional, Add SFX cues, Stronger hook, Add CTA, Better dialogue, custom instructions, retone, translate, convert to another script type. Extras: script doctor, titles, description & tags, thumbnail ideas, chapters, logline, and "ask about this script". |
| **Sound effects** | Any `[SFX: …]` or `[MUSIC: …]` cue becomes a clickable chip in **Perform** mode. 40 built-in sounds are synthesized live (rain, thunder, knocks, footsteps, tapping, crinkling, page turns, whoosh, applause, …). Add your own audio files with keywords, and override the match for any cue. |
| **Perform** | **Table read** with text-to-speech, a voice and pitch per character, and sound cues played in order. Full-screen **teleprompter** (speed, size, mirror mode). |
| **Safety net** | Autosave, plus a snapshot before every AI change. One-click undo and a full version history. |
| **Import / export** | Import TXT, MD, Fountain, SRT/VTT, HTML, RTF and Scripty projects. Export PDF, HTML, TXT, Markdown, Fountain, timed SRT subtitles, and project JSON. |

## Cue syntax

```
ALEX: Lines look like this.            ← speaker lines (or screenplay-style NAME on its own line)
(whispering)                            ← performance direction
[SFX: rain on the window]               ← clickable sound effect
[MUSIC: soft piano fades in]            ← music cue
[PAUSE 3s]                              ← timed pause (counted in runtime)
VISUAL: B-roll of the city at night     ← visual note (not counted as spoken)
## [01:30] Section title                ← section heading
```

## Install and run

- **Use the app:** run `dist\Scripty Setup 1.0.0.exe` (installer with Start-menu and desktop shortcuts) or `dist\Scripty-Portable-1.0.0.exe` (no install).
- **Connect an AI:** open the **AI** page (left rail), paste an API key, then press **Models** and **Test**. Keys are encrypted with Windows DPAPI. Keys in environment variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` are picked up automatically.
- **Free and local:** install [Ollama](https://ollama.com), run `ollama pull llama3.2`, and choose Ollama.

## Develop

```
npm install
npm start          # run the app
npm run verify     # unit tests + launch self-check (must pass)
npm run icon       # re-render the logo (Python + Pillow)
npm run dist       # build the installer and portable exe into dist/
```

`node --test` covers the core logic (length math, prompts, cue parsing, sound matching, provider requests and stream parsing). `electron . --smoke` launches the real app, runs an in-app self-test across every view, and fails on any console error. Add `--shot=<dir>` to save screenshots.

Data (projects, settings, sound library) lives in `%APPDATA%\Scripty`.
