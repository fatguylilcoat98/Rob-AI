"""
AUBS RAG v2.0 — Source-contract query engine.
Retrieval stays local. Generation is Groq primary + Ollama fallback.
Adds retrieval grading, audit logging, safer abstention, and project scoping.
"""
import json
import logging
from datetime import datetime, timezone

import chromadb
import requests
from groq import Groq
from llama_index.core import VectorStoreIndex
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

from config import CHROMA_DIR, COLLECTION, MEMORY_FILE, EMBED_MODEL, TOP_K, MEMORY_TURNS, GROQ_API_KEY, GROQ_MODEL, LOCAL_ONLY, OLLAMA_URL, OLLAMA_MODEL, MIN_SCORE
from prompts import AUBS_SYSTEM_PROMPT, build_query_prompt, build_memory_prompt
from governance import audit, retrieval_grade, source_contract_text

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("AUBS")


class AubsEngine:
    def __init__(self):
        self.groq_api_key = GROQ_API_KEY
        self.groq_model = GROQ_MODEL
        self.local_only = LOCAL_ONLY
        self.ollama_url = OLLAMA_URL
        self.ollama_model = OLLAMA_MODEL
        self.memory_file = MEMORY_FILE
        self.memory_file.parent.mkdir(parents=True, exist_ok=True)
        self.memory_file.touch(exist_ok=True)

        logger.info("Loading embedding model (CPU)...")
        self.embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL)
        logger.info("Connecting to knowledge base (Chroma)...")
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self.collection = client.get_or_create_collection(COLLECTION)
        vector_store = ChromaVectorStore(chroma_collection=self.collection)
        self.index = VectorStoreIndex.from_vector_store(vector_store, embed_model=self.embed_model)
        logger.info(f"Knowledge base ready — {self.collection.count()} chunks loaded.")

    def _load_recent_memory(self, limit: int = MEMORY_TURNS) -> list:
        try:
            lines = self.memory_file.read_text(encoding="utf-8").splitlines()[-limit:]
            return [json.loads(line)["text"] for line in lines if line.strip()]
        except Exception as e:
            logger.warning(f"Could not load memory: {e}")
            return []

    def _append_memory(self, question: str, answer: str, sources: list):
        entry = {"timestamp": datetime.now(timezone.utc).isoformat(), "text": build_memory_prompt(question, answer, sources)}
        try:
            with open(self.memory_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"Failed to append memory: {e}")

    def retrieve(self, question: str, project: str = None):
        if self.collection.count() == 0:
            return [], [], {"grade": "empty", "top_score": 0.0, "usable_chunks": 0, "reason": "Knowledge base has zero chunks. Run python aubs.py ingest."}

        if project and project.lower() not in ("all", "none", ""):
            filters = MetadataFilters(filters=[ExactMatchFilter(key="project", value=project)])
            retriever = self.index.as_retriever(similarity_top_k=TOP_K, filters=filters)
        else:
            retriever = self.index.as_retriever(similarity_top_k=TOP_K)

        nodes = retriever.retrieve(question)
        grade = retrieval_grade(nodes)
        context_blocks, sources = [], []
        for node in nodes:
            score = float(node.score or 0.0)
            src = node.metadata.get("source_file", "unknown")
            project_name = node.metadata.get("project", "unknown")
            if score >= MIN_SCORE:
                context_blocks.append(f"[source: {src} | project: {project_name} | score: {score:.3f}]\n{node.get_content()}")
            sources.append(f"{src} (project: {project_name}, score: {score:.3f})")
        return context_blocks, sources, grade

    def generate_groq(self, prompt: str) -> str:
        if not self.groq_api_key or self.groq_api_key == "your_key_here":
            raise RuntimeError("GROQ_API_KEY is missing or still set to placeholder.")
        client = Groq(api_key=self.groq_api_key)
        resp = client.chat.completions.create(
            model=self.groq_model,
            messages=[{"role": "system", "content": AUBS_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            max_tokens=1300,
            temperature=0.25,
        )
        return resp.choices[0].message.content.strip()

    def generate_ollama(self, prompt: str) -> str:
        resp = requests.post(
            f"{self.ollama_url}/api/chat",
            json={"model": self.ollama_model, "messages": [{"role": "system", "content": AUBS_SYSTEM_PROMPT}, {"role": "user", "content": prompt}], "stream": False, "options": {"temperature": 0.25}},
            timeout=300,
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()

    def ask(self, question: str, project: str = None) -> dict:
        context_blocks, sources, grade = self.retrieve(question, project=project)
        recent_memory = self._load_recent_memory()
        contract = source_contract_text(grade)
        prompt = build_query_prompt(question, context_blocks, recent_memory, contract)

        # Empty KB gets a deterministic answer; no reason to spend tokens pretending.
        if grade["grade"] == "empty":
            answer = "I don't have anything in the AUBS knowledge base yet. Run `python aubs.py ingest` after adding files to `data/`, then ask me again."
            lane = "no-generation / empty-kb"
        else:
            try:
                if self.local_only:
                    answer = self.generate_ollama(prompt)
                    lane = "local (Ollama)"
                else:
                    answer = self.generate_groq(prompt)
                    lane = "Groq"
            except Exception as e:
                logger.warning(f"Primary lane failed ({e}) — trying Ollama fallback")
                try:
                    answer = self.generate_ollama(prompt)
                    lane = "local fallback (Ollama)"
                except Exception as e2:
                    answer = f"Both generation lanes failed. Groq/primary: {e} | Ollama fallback: {e2}"
                    lane = "error"

        self._append_memory(question, answer, sources)
        audit("ask", {"question": question, "project": project or "all", "lane": lane, "retrieval_grade": grade, "sources": sources[:10]})
        return {"answer": answer, "sources": sources, "lane": lane, "memory_turns_used": len(recent_memory), "project_filter": project or "all", "retrieval_grade": grade}


if __name__ == "__main__":
    import sys
    engine = AubsEngine()
    q = " ".join(sys.argv[1:]) or "What projects are currently in my knowledge base?"
    result = engine.ask(q)
    print(f"\n[{result['lane']}] | retrieval: {result['retrieval_grade']['grade']} | memory turns: {result.get('memory_turns_used', 0)}\n")
    print(result["answer"])
    print("\nSources:")
    for s in result["sources"]:
        print(f"  • {s}")
