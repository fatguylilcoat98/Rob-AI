#!/usr/bin/env python3
"""AUBS v2.0 unified CLI — status · doctor · projects · ingest · rebuild · ask · ui"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from config import DATA_DIR, CHROMA_DIR, MANIFEST, MEMORY_FILE, AUDIT_LOG, GROQ_API_KEY, LOCAL_ONLY, OLLAMA_MODEL, GROQ_MODEL

BASE = Path(__file__).parent


def cmd_status():
    from query_engine import AubsEngine
    engine = AubsEngine()
    print("=== AUBS v2.0 Source-Contract Status ===")
    print(f"Knowledge chunks: {engine.collection.count()}")
    print(f"Memory entries: {len(MEMORY_FILE.read_text(encoding='utf-8').splitlines()) if MEMORY_FILE.exists() else 0}")
    print(f"Audit entries: {len(AUDIT_LOG.read_text(encoding='utf-8').splitlines()) if AUDIT_LOG.exists() else 0}")
    print(f"Default generation lane: {'LOCAL ONLY (Ollama)' if engine.local_only else 'Groq primary + Ollama fallback'}")
    print(f"Groq model: {engine.groq_model}")
    print(f"Ollama model: {engine.ollama_model}")
    print("Spine operational. Source contract active.")


def cmd_doctor():
    print("=== AUBS Doctor ===")
    print(f"Project folder: {BASE}")
    print(f"Data folder exists: {DATA_DIR.exists()} -> {DATA_DIR}")
    print(f"Chroma folder exists: {CHROMA_DIR.exists()} -> {CHROMA_DIR}")
    print(f"Manifest exists: {MANIFEST.exists()} -> {MANIFEST}")
    print(f"Groq key present: {bool(GROQ_API_KEY and GROQ_API_KEY != 'your_key_here')}")
    print(f"LOCAL_ONLY: {LOCAL_ONLY}")
    print("Checking Python imports...")
    mods = ["chromadb", "gradio", "llama_index.core", "sentence_transformers", "groq", "requests"]
    for m in mods:
        try:
            __import__(m.split('.')[0])
            print(f"  OK: {m}")
        except Exception as e:
            print(f"  MISSING/BROKEN: {m} -> {e}")
    print("Doctor complete.")


def cmd_projects():
    DATA_DIR.mkdir(exist_ok=True)
    projects = sorted(d.name for d in DATA_DIR.iterdir() if d.is_dir() and not d.name.startswith('.'))
    if not projects:
        print("No project folders yet. Create folders under data/, like data/veracore/ or data/gng/.")
    else:
        print("AUBS project folders:")
        for p in projects:
            print(f"  • {p}")


def cmd_ask(question: str, project: str = None):
    from query_engine import AubsEngine
    engine = AubsEngine()
    result = engine.ask(question, project=project)
    grade = result.get('retrieval_grade', {})
    print(f"\n[{result['lane']}] | retrieval: {grade.get('grade')} | project: {result['project_filter']} | memory turns: {result.get('memory_turns_used', 0)}\n")
    print(result["answer"])
    print("\nSources:")
    for s in result["sources"]:
        print(f"  • {s}")


def cmd_ui():
    print("Launching AUBS Knowledge Spine on http://0.0.0.0:7860 ...")
    subprocess.run([sys.executable, str(BASE / "ui.py")])


def cmd_ingest():
    from ingestion import main as run_ingestion
    run_ingestion()


def cmd_rebuild():
    confirm = input("This wipes and rebuilds the vector DB + manifest. Type 'yes' to continue: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        return
    if CHROMA_DIR.exists():
        shutil.rmtree(CHROMA_DIR)
        print("Removed chroma_db/")
    if MANIFEST.exists():
        MANIFEST.unlink()
        print("Removed ingest_manifest.json")
    cmd_ingest()


def main():
    parser = argparse.ArgumentParser(description="AUBS v2.0 — governed personal RAG spine")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("status")
    sub.add_parser("doctor")
    sub.add_parser("projects")
    sub.add_parser("ui")
    sub.add_parser("ingest")
    sub.add_parser("rebuild")
    ask_p = sub.add_parser("ask")
    ask_p.add_argument("question", nargs="+")
    ask_p.add_argument("--project", "-p", default=None)
    args = parser.parse_args()
    if args.command == "status": cmd_status()
    elif args.command == "doctor": cmd_doctor()
    elif args.command == "projects": cmd_projects()
    elif args.command == "ui": cmd_ui()
    elif args.command == "ingest": cmd_ingest()
    elif args.command == "rebuild": cmd_rebuild()
    elif args.command == "ask": cmd_ask(" ".join(args.question), project=args.project)
    else: parser.print_help()

if __name__ == "__main__":
    main()
