"""
AUBS RAG v2.0 — Incremental ingestion with stale-proof source hygiene.
- Content SHA256, not mtime-only fingerprints.
- Changed files purge old chunks before re-adding.
- Deleted files purge from Chroma.
- Every ingestion event writes to a local audit log.
"""
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import chromadb
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore

from config import DATA_DIR, CHROMA_DIR, COLLECTION, MANIFEST, EMBED_MODEL, CHUNK_SIZE, CHUNK_OVERLAP, SUPPORTED_EXTENSIONS, IGNORE_DIRS
from embeddings import load_embed_model
from governance import audit


def content_fingerprint(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def should_index(path: Path) -> bool:
    if any(part in IGNORE_DIRS for part in path.parts):
        return False
    if path.name.startswith("."):
        return False
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def rel_path(path: Path) -> str:
    return str(path.relative_to(DATA_DIR))


def add_project_metadata(file_path: str) -> dict:
    rel = Path(file_path).relative_to(DATA_DIR)
    project = rel.parts[0] if len(rel.parts) > 1 else "root"
    return {
        "project": project,
        "source_file": str(rel),
        "source_ext": Path(file_path).suffix.lower(),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }


def load_manifest() -> dict:
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_manifest(manifest: dict):
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")


def purge_file_chunks(collection, source_file: str):
    try:
        collection.delete(where={"source_file": source_file})
        audit("purge_file_chunks", {"source_file": source_file})
    except Exception as e:
        print(f"  Warning: could not purge old chunks for {source_file}: {e}")
        audit("purge_file_chunks_failed", {"source_file": source_file, "error": str(e)})


def main():
    print("=== AUBS v2.0 Incremental Ingestion ===")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted([f for f in DATA_DIR.rglob("*") if f.is_file() and should_index(f)])
    manifest = load_manifest()

    to_process = []
    fingerprints = {}
    for f in files:
        fp = content_fingerprint(f)
        fingerprints[str(f)] = fp
        if manifest.get(str(f), {}).get("sha256") != fp:
            to_process.append(f)

    on_disk = {str(f) for f in files}
    deleted = [path for path in list(manifest.keys()) if path not in on_disk]

    if not to_process and not deleted:
        print("Nothing new, changed, or deleted. Knowledge base is up to date.")
        audit("ingest_noop", {"files_seen": len(files)})
        return

    print("Connecting to Chroma (persistent)...")
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(COLLECTION)

    if deleted:
        print(f"Purging {len(deleted)} deleted file(s) from knowledge base...")
        for old_abs in deleted:
            source = manifest.get(old_abs, {}).get("source_file")
            if source:
                purge_file_chunks(collection, source)
            del manifest[old_abs]
            print(f"  removed: {source or old_abs}")

    if to_process:
        print(f"Processing {len(to_process)} new/changed file(s)...")
        for f in to_process:
            if str(f) in manifest:
                purge_file_chunks(collection, manifest[str(f)].get("source_file", rel_path(f)))
                print(f"  purged old version: {rel_path(f)}")

        print(f"Loading local embedding model: {EMBED_MODEL}")
        embed_model = load_embed_model()
        vector_store = ChromaVectorStore(chroma_collection=collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        splitter = SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

        print("Reading and chunking documents...")
        reader = SimpleDirectoryReader(input_files=[str(f) for f in to_process], file_metadata=add_project_metadata)
        documents = reader.load_data()
        print(f"Loaded {len(documents)} document(s).")

        print("Embedding and adding to knowledge base (CPU work)...")
        VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            embed_model=embed_model,
            transformations=[splitter],
            show_progress=True,
        )

        now = datetime.now(timezone.utc).isoformat()
        for f in to_process:
            manifest[str(f)] = {
                "sha256": fingerprints[str(f)],
                "source_file": rel_path(f),
                "project": rel_path(f).split("/")[0] if "/" in rel_path(f) else "root",
                "size_bytes": f.stat().st_size,
                "indexed_at": now,
            }

    save_manifest(manifest)
    total = collection.count()
    audit("ingest_complete", {"processed": len(to_process), "deleted": len(deleted), "total_chunks": total})
    print(f"\nDone. Total chunks in collection now: {total}")
    print(f"Manifest updated at {MANIFEST}")
    print("Audit log updated. Spine is clean.")


if __name__ == "__main__":
    main()
