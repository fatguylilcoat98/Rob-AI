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

# Honest privacy-lane labels. Never claim "local" unless the lane proves it.
LANE_LABELS = {
    "Groq": "Cloud-assisted (Groq)",
    "local (Ollama)": "Local (Ollama)",
    "local fallback (Ollama)": "Local fallback (Ollama)",
    "no-generation / empty-kb": "Local (no generation — empty library)",
    "error": "Unavailable (both lanes failed)",
}


def lane_label(lane: str) -> str:
    return LANE_LABELS.get(lane, lane)


def list_projects():
    projects = ["All"]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    projects += sorted(d.name for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith("."))
    return projects


def respond(message, history, project):
    if not message or not message.strip():
        return history, "", gr.update(choices=list_projects(), value=project)
    proj = None if project == "All" else project
    result = engine.ask(message.strip(), project=proj)
    grade = result.get("retrieval_grade", {})
    sources_md = "\n".join(f"- {s}" for s in result["sources"]) or "- none"
    response_text = (
        f"{result['answer']}\n\n---\n"
        f"**Privacy lane:** {lane_label(result['lane'])} | "
        f"**Evidence:** {grade.get('grade')} | **Project:** {result['project_filter']}\n\n"
        f"**Sources:**\n{sources_md}"
    )
    history = history + [{"role": "user", "content": message}, {"role": "assistant", "content": response_text}]
    return history, "", gr.update(choices=list_projects(), value=project)


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
            f"Knowledge chunks: {engine.collection.count()}\n"
            f"Memory entries: {len(MEMORY_FILE.read_text(encoding='utf-8').splitlines()) if MEMORY_FILE.exists() else 0}\n"
            f"Audit entries: {len(AUDIT_LOG.read_text(encoding='utf-8').splitlines()) if AUDIT_LOG.exists() else 0}\n"
            f"Generation lane: {'Local only (Ollama)' if engine.local_only else 'Cloud-assisted (Groq) with local fallback (Ollama)'}\n"
            f"Projects: {', '.join(list_projects()[1:]) or 'none yet'}\n"
            f"Status: Source contract active — Truth · Safety · We Got Your Back"
        )
    except Exception as e:
        return f"Status error: {e}"


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


with gr.Blocks(title="AUBS Knowledge Spine", theme=gr.themes.Soft()) as demo:
    gr.Markdown("""
    # AUBS Knowledge Spine
    **Your knowledge. Your hardware. Answers with sources, on your terms.**
    *Truth · Safety · We Got Your Back*
    """)
    with gr.Tabs():
        with gr.TabItem("Ask"):
            project_dd = gr.Dropdown(choices=list_projects(), value="All", label="Scope to project")
            chatbot = gr.Chatbot(label="Knowledge Spine", height=520, type="messages")
            msg = gr.Textbox(placeholder="Ask your knowledge base... phone mic works here", label="Your question", lines=2)
            with gr.Row():
                submit = gr.Button("Ask", variant="primary")
                save_btn = gr.Button("Save exchange as note")
                clear = gr.Button("Clear")
            capture_status = gr.Textbox(label="Capture status", interactive=False)
            submit.click(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd])
            msg.submit(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd])
            save_btn.click(save_as_note, [chatbot], capture_status)
            clear.click(lambda: [], None, chatbot, queue=False)
        with gr.TabItem("Add Knowledge"):
            gr.Markdown("Drop files into `data/` folders, then click below. Changed and deleted files are handled cleanly.")
            ingest_btn = gr.Button("Add to Library", variant="primary")
            ingest_output = gr.Textbox(label="Library update log", lines=16, interactive=False)
            ingest_btn.click(run_ingest_from_ui, outputs=ingest_output)
        with gr.TabItem("Status"):
            status_box = gr.Textbox(label="Knowledge Spine status", lines=10, interactive=False)
            refresh_btn = gr.Button("Refresh Status")
            refresh_btn.click(get_status, outputs=status_box)
        with gr.TabItem("Admin / Debug"):
            gr.Markdown("Operator view — raw retrieval internals (the old RAG screen). Not the product; the product is the Ask tab.")
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
