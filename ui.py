"""AUBS v2.0 Gradio UI — chat, ingest, status, source contract."""
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
        f"**Lane:** {result['lane']} | **Retrieval:** {grade.get('grade')} "
        f"({grade.get('reason')}) | **Project:** {result['project_filter']} | "
        f"**Memory turns:** {result.get('memory_turns_used', 0)}\n\n"
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
    return f"Saved to {filename.name}. Click Run Ingest to make it searchable."


def run_ingest_from_ui():
    proc = subprocess.run([sys.executable, "aubs.py", "ingest"], cwd=Path(__file__).parent, text=True, capture_output=True, timeout=1800)
    return (proc.stdout + "\n" + proc.stderr).strip()[-6000:]


def get_status():
    try:
        return (
            f"Knowledge chunks: {engine.collection.count()}\n"
            f"Memory entries: {len(MEMORY_FILE.read_text(encoding='utf-8').splitlines()) if MEMORY_FILE.exists() else 0}\n"
            f"Audit entries: {len(AUDIT_LOG.read_text(encoding='utf-8').splitlines()) if AUDIT_LOG.exists() else 0}\n"
            f"Generation lane: {'LOCAL ONLY (Ollama)' if engine.local_only else 'Groq primary + Ollama fallback'}\n"
            f"Groq model: {engine.groq_model}\n"
            f"Ollama model: {engine.ollama_model}\n"
            f"Projects: {', '.join(list_projects()[1:]) or 'none yet'}\n"
            f"Status: Source contract active — Truth · Safety · We Got Your Back"
        )
    except Exception as e:
        return f"Status error: {e}"


with gr.Blocks(title="AUBS v2.0 — Source Contract", theme=gr.themes.Soft()) as demo:
    gr.Markdown("""
    # AUBS v2.0 — Source-Contract Beast
    **Your knowledge. Your hardware. Your governed retrieval spine.**  
    *Truth · Safety · We Got Your Back*
    """)
    with gr.Tabs():
        with gr.TabItem("Chat"):
            project_dd = gr.Dropdown(choices=list_projects(), value="All", label="Scope retrieval to project")
            chatbot = gr.Chatbot(label="AUBS", height=520, type="messages")
            msg = gr.Textbox(placeholder="Ask from your knowledge base... phone mic works here", label="Your question", lines=2)
            with gr.Row():
                submit = gr.Button("Send", variant="primary")
                save_btn = gr.Button("Save exchange as note")
                clear = gr.Button("Clear chat")
            capture_status = gr.Textbox(label="Capture status", interactive=False)
            submit.click(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd])
            msg.submit(respond, [msg, chatbot, project_dd], [chatbot, msg, project_dd])
            save_btn.click(save_as_note, [chatbot], capture_status)
            clear.click(lambda: [], None, chatbot, queue=False)
        with gr.TabItem("Ingest"):
            gr.Markdown("Drop files into `data/` folders, then click ingest. Changed/deleted files are handled cleanly.")
            ingest_btn = gr.Button("Run Ingest", variant="primary")
            ingest_output = gr.Textbox(label="Ingest output", lines=16, interactive=False)
            ingest_btn.click(run_ingest_from_ui, outputs=ingest_output)
        with gr.TabItem("Status"):
            status_box = gr.Textbox(label="AUBS Status", lines=10, interactive=False)
            refresh_btn = gr.Button("Refresh Status")
            refresh_btn.click(get_status, outputs=status_box)
    gr.Markdown("---\n*AUBS v2.0 — source contract, audit trail, local retrieval spine.*")

if __name__ == "__main__":
    auth_env = os.getenv("GRADIO_AUTH", "")
    auth = tuple(auth_env.split(":", 1)) if ":" in auth_env else None
    demo.launch(server_name="0.0.0.0", server_port=7860, share=False, auth=auth)
