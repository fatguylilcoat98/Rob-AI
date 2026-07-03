"""AUBS Knowledge Spine — Gradio UI.

User-facing surface of the knowledge subsystem (internally: aubs-rag).
Ask · Add Knowledge · Status, plus an Admin / Debug tab that carries the
raw retrieval detail the old RAG screen used to show.
"""
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import gradio as gr
from query_engine import AubsEngine
from config import DATA_DIR, MEMORY_FILE, AUDIT_LOG

engine = AubsEngine()
NOTES_DIR = DATA_DIR / "personal_notes"

FOOTER = "---\n*Truth · Safety · We Got Your Back — The Good Neighbor Guard*"

# Honest, engine-free privacy lanes. Never claim "on this machine" unless the
# lane proves it; engine names (Groq/Ollama) stay in Admin / Debug only.
LANE_LABELS = {
    "Groq": "Cloud-assisted — your question and retrieved context left this machine",
    "local (Ollama)": "On this machine — nothing left your hardware",
    "local fallback (Ollama)": "On this machine (fallback) — cloud lane failed, local caught it",
    "no-generation / empty-kb": "On this machine — no generation needed (library is empty)",
    "error": "Unavailable — both answering lanes failed",
}

# Plain-language confidence from the retrieval grade.
CONFIDENCE = {
    "grounded": ("High", "Multiple solid sources in your library back this answer."),
    "thin": ("Moderate", "Only one usable source — treat this as a cautious answer."),
    "weak": ("Low", "Nothing in your library matched well; the answer leans on general knowledge."),
    "empty": ("No evidence", "Your library is empty — add knowledge to get grounded answers."),
}


def lane_label(lane: str) -> str:
    return LANE_LABELS.get(lane, lane)


def why_panel(result: dict) -> str:
    grade = result.get("retrieval_grade", {})
    conf, conf_why = CONFIDENCE.get(grade.get("grade"), ("Unknown", grade.get("reason", "")))
    sources = "\n".join(f"- {s}" for s in result["sources"]) or "- none"
    return (
        f"**Confidence:** {conf} — {conf_why}\n\n"
        f"**Privacy:** {lane_label(result['lane'])}\n\n"
        f"**Project scope:** {result['project_filter']}\n\n"
        f"**Sources:**\n{sources}"
    )


def list_projects():
    projects = ["All"]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    projects += sorted(d.name for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith("."))
    return projects


def respond(message, history, project):
    if not message or not message.strip():
        return history, "", gr.update(choices=list_projects(), value=project), gr.update()
    proj = None if project == "All" else project
    result = engine.ask(message.strip(), project=proj)
    # The answer reads naturally; the reasoning lives in the expandable panel below.
    history = history + [{"role": "user", "content": message}, {"role": "assistant", "content": result["answer"]}]
    return history, "", gr.update(choices=list_projects(), value=project), why_panel(result)


def save_as_note(history):
    if not history or len(history) < 2:
        return "No exchange to save yet."
    last_q, last_a = None, None
    for turn in reversed(history):
        if turn["role"] == "assistant" and last_a is None:
            last_a = turn["content"]
        elif turn["role"] == "user" and last_a is not None:
            last_q = turn["content"]
            break
    if not last_q or not last_a:
        return "No complete exchange found."
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    filename = NOTES_DIR / f"aubs_captured_{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    filename.write_text(f"# AUBS Captured Exchange — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n**Question:** {last_q}\n\n**Answer:**\n{last_a}\n", encoding="utf-8")
    return f"Saved to {filename.name}. Click Add to Library to make it searchable."


def run_ingest_from_ui():
    proc = subprocess.run([sys.executable, "aubs.py", "ingest"], cwd=Path(__file__).parent, text=True, capture_output=True, timeout=1800)
    return (proc.stdout + "\n" + proc.stderr).strip()[-6000:]


def get_status():
    try:
        return (
            f"Library size: {engine.collection.count()} pieces of knowledge\n"
            f"Remembered exchanges: {len(MEMORY_FILE.read_text(encoding='utf-8').splitlines()) if MEMORY_FILE.exists() else 0}\n"
            f"Audit trail entries: {len(AUDIT_LOG.read_text(encoding='utf-8').splitlines()) if AUDIT_LOG.exists() else 0}\n"
            f"Answering mode: {'On this machine only' if engine.local_only else 'Cloud-assisted, with on-machine fallback'}\n"
            f"Projects: {', '.join(list_projects()[1:]) or 'none yet'}\n"
            f"Source contract: active — Truth · Safety · We Got Your Back"
        )
    except Exception as e:
        return f"Status error: {e}"


def admin_status():
    """Engine-room view: the technical names live here, not in the product."""
    try:
        return (
            f"internal service: aubs-rag v2\n"
            f"vector store: Chroma ({engine.collection.count()} chunks)\n"
            f"embeddings: all-MiniLM-L6-v2 (HF or ONNX fallback — see embeddings.py)\n"
            f"generation: {'Ollama only (LOCAL_ONLY=1)' if engine.local_only else f'Groq {engine.groq_model} primary, Ollama {engine.ollama_model} fallback'}\n"
            f"memory file: {MEMORY_FILE.name} | audit log: {AUDIT_LOG.name}"
        )
    except Exception as e:
        return f"Admin status error: {e}"


# ── Admin / Debug — the old RAG screen's raw detail lives here now ──

def debug_ask(message, project):
    if not message or not message.strip():
        return "Enter a question first."
    proj = None if project in ("All", "", None) else project
    result = engine.ask(message.strip(), project=proj)
    grade = result.get("retrieval_grade", {})
    sources = "\n".join(f"  - {s}" for s in result["sources"]) or "  - none"
    return (
        f"internal lane: {result['lane']}\n"
        f"retrieval_grade: {grade.get('grade')} ({grade.get('reason')})\n"
        f"top_score: {grade.get('top_score')} | usable_chunks: {grade.get('usable_chunks')}\n"
        f"memory_turns_used: {result.get('memory_turns_used', 0)}\n"
        f"project_filter: {result['project_filter']}\n"
        f"sources:\n{sources}\n\n"
        f"answer:\n{result['answer']}"
    )


def tail_audit(lines=40):
    try:
        if not AUDIT_LOG.exists():
            return "No audit entries yet."
        return "\n".join(AUDIT_LOG.read_text(encoding="utf-8").splitlines()[-int(lines):])
    except Exception as e:
        return f"Audit read error: {e}"


# One OS identity: emerald on near-black, matching AUBS Mission Control.
FORCE_DARK_JS = """
() => {
  const url = new URL(window.location);
  if (url.searchParams.get('__theme') !== 'dark') {
    url.searchParams.set('__theme', 'dark');
    window.location.replace(url);
  }
}
"""

AUBS_CSS = """
body, .gradio-container { background: #050a08 !important; }
.gradio-container { max-width: 960px !important; width: 100% !important; margin: 0 auto !important; padding: 8px 12px !important; box-sizing: border-box !important; }
html, body { overflow-x: hidden !important; }
#aubs-header h1 { color: #4ade80 !important; letter-spacing: 2px; text-shadow: 0 0 18px rgba(74,222,128,.3); }
#aubs-header em { color: #8fa89a; }
footer { display: none !important; }
"""

THEME = gr.themes.Soft(primary_hue="green", neutral_hue="zinc").set(
    body_background_fill_dark="#050a08",
    background_fill_primary_dark="#0b1510",
    background_fill_secondary_dark="#080f0c",
    border_color_primary_dark="#1d3a2a",
    button_primary_background_fill_dark="linear-gradient(135deg, #16a34a, #22c55e)",
    button_primary_text_color_dark="#04120a",
)

with gr.Blocks(title="AUBS Knowledge", theme=THEME, js=FORCE_DARK_JS, css=AUBS_CSS) as demo:
    gr.Markdown("""
    # AUBS Knowledge
    **Ask your own library — every answer says where it came from and how sure it is.**
    *Truth · Safety · We Got Your Back*
    """, elem_id="aubs-header")
    with gr.Tabs():
        with gr.TabItem("Ask"):
            project_dd = gr.Dropdown(choices=list_projects(), value="All", label="Scope to project")
            chatbot = gr.Chatbot(label="Knowledge", height=480, type="messages")
            msg = gr.Textbox(placeholder="Ask anything from your library… phone mic works here", label="Your question", lines=2)
            with gr.Row():
                submit = gr.Button("Ask", variant="primary")
                save_btn = gr.Button("Save exchange as note")
                clear = gr.Button("Clear")
            with gr.Accordion("Why this answer? — confidence, privacy, sources", open=False):
                why_box = gr.Markdown("Ask something first — I'll show the evidence behind the answer here.")
            capture_status = gr.Textbox(label="Capture status", interactive=False, visible=False)
            submit.click(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd, why_box])
            msg.submit(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd, why_box])
            save_btn.click(save_as_note, [chatbot], capture_status).then(
                lambda s: gr.update(visible=bool(s)), capture_status, capture_status)
            clear.click(lambda: [], None, chatbot, queue=False)
        with gr.TabItem("Add Knowledge"):
            gr.Markdown("Drop files into `data/` folders, then click below. Changed and deleted files are handled cleanly.")
            ingest_btn = gr.Button("Add to Library", variant="primary")
            ingest_output = gr.Textbox(label="Library update log", lines=16, interactive=False)
            ingest_btn.click(run_ingest_from_ui, outputs=ingest_output)
        with gr.TabItem("Status"):
            status_box = gr.Textbox(label="Knowledge status", lines=9, interactive=False)
            refresh_btn = gr.Button("Refresh Status")
            refresh_btn.click(get_status, outputs=status_box)
        with gr.TabItem("Admin / Debug"):
            gr.Markdown("Engine room — internal names and raw retrieval output live here, not in the product.")
            admin_box = gr.Textbox(label="Engine status", lines=6, interactive=False)
            admin_btn = gr.Button("Refresh engine status")
            admin_btn.click(admin_status, outputs=admin_box)
            dbg_project = gr.Dropdown(choices=list_projects(), value="All", label="Project filter")
            dbg_q = gr.Textbox(label="Test question", lines=2)
            dbg_btn = gr.Button("Run retrieval probe")
            dbg_out = gr.Textbox(label="Raw engine output", lines=18, interactive=False)
            dbg_btn.click(debug_ask, [dbg_q, dbg_project], dbg_out)
            audit_btn = gr.Button("Tail audit log")
            audit_out = gr.Textbox(label="aubs_audit.jsonl (last 40)", lines=12, interactive=False)
            audit_btn.click(tail_audit, outputs=audit_out)
    gr.Markdown(FOOTER)

if __name__ == "__main__":
    auth_env = os.getenv("GRADIO_AUTH", "")
    auth = tuple(auth_env.split(":", 1)) if ":" in auth_env else None
    demo.launch(server_name="0.0.0.0", server_port=7860, share=False, auth=auth)
