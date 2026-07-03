"""
AUBS embedding loader — HuggingFace primary, Chroma ONNX fallback.

Both paths serve the same model (all-MiniLM-L6-v2, normalized output), so
vectors stay compatible with an existing chroma_db regardless of which
lane loaded. The fallback exists for networks where huggingface.co is
unreachable: Chroma bundles an ONNX copy of the model hosted on S3.
"""
import logging

from llama_index.core.embeddings import BaseEmbedding
from pydantic import PrivateAttr

from config import EMBED_MODEL

logger = logging.getLogger("AUBS")


class ChromaOnnxEmbedding(BaseEmbedding):
    """llama-index wrapper around chromadb's bundled ONNX all-MiniLM-L6-v2."""

    _ef: object = PrivateAttr()

    def __init__(self, **kwargs):
        kwargs.setdefault("model_name", "chroma-onnx/all-MiniLM-L6-v2")
        super().__init__(**kwargs)
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
        self._ef = ONNXMiniLM_L6_V2()

    def _embed(self, texts: list) -> list:
        return [[float(x) for x in vec] for vec in self._ef(texts)]

    def _get_query_embedding(self, query: str) -> list:
        return self._embed([query])[0]

    def _get_text_embedding(self, text: str) -> list:
        return self._embed([text])[0]

    def _get_text_embeddings(self, texts: list) -> list:
        return self._embed(texts)

    async def _aget_query_embedding(self, query: str) -> list:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> list:
        return self._get_text_embedding(text)


def load_embed_model():
    try:
        from llama_index.embeddings.huggingface import HuggingFaceEmbedding
        return HuggingFaceEmbedding(model_name=EMBED_MODEL)
    except Exception as e:
        logger.warning(
            f"HuggingFace embedding load failed ({e.__class__.__name__}) — "
            "falling back to Chroma's bundled ONNX all-MiniLM-L6-v2."
        )
        return ChromaOnnxEmbedding()
