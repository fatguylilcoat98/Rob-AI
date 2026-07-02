"""
AUBS v2.0 config — one place for knobs.
Truth · Safety · We Got Your Back
"""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = BASE_DIR / os.getenv("AUBS_DATA_DIR", "data")
CHROMA_DIR = BASE_DIR / os.getenv("AUBS_CHROMA_DIR", "chroma_db")
COLLECTION = os.getenv("AUBS_COLLECTION", "aubs_knowledge")
MANIFEST = BASE_DIR / os.getenv("AUBS_MANIFEST", "ingest_manifest.json")
AUDIT_LOG = BASE_DIR / os.getenv("AUBS_AUDIT_LOG", "aubs_audit.jsonl")
MEMORY_FILE = BASE_DIR / os.getenv("AUBS_MEMORY_FILE", "chat_memory.jsonl")

EMBED_MODEL = os.getenv("AUBS_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
CHUNK_SIZE = int(os.getenv("AUBS_CHUNK_SIZE", "512"))
CHUNK_OVERLAP = int(os.getenv("AUBS_CHUNK_OVERLAP", "64"))
TOP_K = int(os.getenv("AUBS_TOP_K", "7"))
MIN_SCORE = float(os.getenv("AUBS_MIN_SCORE", "0.18"))
MEMORY_TURNS = int(os.getenv("AUBS_MEMORY_TURNS", "4"))

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
LOCAL_ONLY = os.getenv("LOCAL_ONLY", "0") == "1"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".pdf", ".docx", ".csv", ".json", ".html"
}
IGNORE_DIRS = {".git", "venv", ".venv", "__pycache__", "chroma_db"}
