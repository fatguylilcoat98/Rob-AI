# AUBS RAG v2.0 — SOURCE-CONTRACT BEAST

**Your knowledge is the architecture. The model is only the voice.**

AUBS v2 hardens the v1.6 Beast build into a governed personal RAG spine:

- **Local retrieval always**: ChromaDB + CPU embeddings on the Dell.
- **Hybrid generation**: Groq primary, Ollama fallback, LOCAL_ONLY mode when privacy matters.
- **Source Contract**: every answer carries a retrieval grade and citation discipline.
- **Audit Ledger**: asks, ingests, purges, and retrieval metadata write to `aubs_audit.jsonl`.
- **Content-hash ingestion**: SHA256 detects real changes; no stale duplicate chunks.
- **Deleted-file hygiene**: remove a file from `data/`, and its chunks are purged.
- **Project filters**: scope retrieval to `data/veracore`, `data/gng`, etc.
- **UI ingest button**: drop notes into `data/`, click Run Ingest.
- **Doctor command**: quick environment sanity check.

This is still minimal enough for Chris's Dell, but now it has the bones of a serious personal intelligence system.

## Layout

```text
aubs-rag-beast-v2/
  aubs.py              # CLI: doctor/status/projects/ingest/rebuild/ask/ui
  config.py            # all knobs in one place
  governance.py        # audit trail + retrieval/source contract helpers
  ingestion.py         # incremental SHA256 ingestion
  query_engine.py      # retrieval grade + Groq/Ollama generation
  prompts.py           # AUBS behavior contract
  ui.py                # Gradio UI
  data/                # your living knowledge base
  chroma_db/           # persistent vector DB, auto-created
```

## Dell install

Paste this in the **Ubuntu terminal on the Dell**:

```bash
cd /home/chris
unzip aubs-rag-beast-v2.zip -d /home/chris/
cd /home/chris/aubs-rag-beast-v2
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env
```

Put your Groq key in `.env`, save, then:

```bash
python aubs.py doctor
mkdir -p data/veracore data/gng data/voice_notes data/personal_notes
printf '# Test Note\nAUBS is Chris personal governed RAG spine.\n' > data/personal_notes/test.md
python aubs.py ingest
python aubs.py ask "What is AUBS?"
python aubs.py ui
```

Open on phone through Tailscale:

```text
http://YOUR-DELL-TAILSCALE-IP:7860
```

## CLI commands

```bash
python aubs.py doctor       # dependency/config sanity check
python aubs.py status       # chunks, memory, audit, lanes
python aubs.py projects     # list folders under data/
python aubs.py ingest       # incremental ingest
python aubs.py rebuild      # wipe vector DB and rebuild
python aubs.py ask "..."    # terminal question
python aubs.py ask "..." --project veracore
python aubs.py ui           # launch Gradio
```

## What makes Claude lose it

v1.6 was a strong RAG app. v2 adds the thing most personal RAG demos lack:

**a source contract.**

AUBS does not just retrieve chunks and pray. It grades retrieval strength, carries the grade into the prompt, logs the event, cites files, and warns when evidence is thin. That is the beginning of CLASPION/Veracore-style governance inside the personal RAG loop.

## Next v2.1 targets

- Semantic memory vector collection for past conversations.
- Light reranker for bigger knowledge bases.
- CLASPION preflight/postflight contract hooks.
- Veracore verification lane for high-stakes answers.
- Syncthing voice-note folder watcher.
- Source inspector view that opens the exact chunk behind a citation.

**Truth · Safety · We Got Your Back**
