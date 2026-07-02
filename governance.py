"""
AUBS v2.0 governance helpers.
This is not theater. It creates an audit trail and enforces a simple retrieval contract.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from config import AUDIT_LOG, MIN_SCORE


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def audit(event_type: str, payload: Dict[str, Any]) -> None:
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": utc_now(), "event": event_type, **payload}
    with open(AUDIT_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def retrieval_grade(nodes: List[Any]) -> Dict[str, Any]:
    scores = [float(getattr(n, "score", 0.0) or 0.0) for n in nodes]
    usable = [s for s in scores if s >= MIN_SCORE]
    if not scores:
        return {"grade": "empty", "top_score": 0.0, "usable_chunks": 0, "reason": "No retrieved chunks."}
    top = max(scores)
    if not usable:
        return {"grade": "weak", "top_score": top, "usable_chunks": 0, "reason": f"Top retrieval score {top:.3f} is below MIN_SCORE {MIN_SCORE:.3f}."}
    if len(usable) == 1:
        return {"grade": "thin", "top_score": top, "usable_chunks": 1, "reason": "Only one usable source chunk; answer should stay cautious."}
    return {"grade": "grounded", "top_score": top, "usable_chunks": len(usable), "reason": "Multiple usable chunks retrieved."}


def source_contract_text(grade: Dict[str, Any]) -> str:
    return f"""SOURCE CONTRACT FOR THIS ANSWER:
- Retrieval grade: {grade['grade']}
- Top score: {grade['top_score']:.3f}
- Usable chunks: {grade['usable_chunks']}
- Rule: Claims about Chris's projects/notes must come from the provided context and cite the source file.
- If the evidence is weak, say so before answering.
- If the answer is not in the knowledge base, say: "I don't have that in the AUBS knowledge base yet." Then offer a next step.
"""
