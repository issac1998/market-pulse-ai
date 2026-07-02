from dataclasses import dataclass
from pathlib import Path

from ..config import KNOWLEDGE_DIR


@dataclass
class KnowledgeChunk:
    id: str
    title: str
    text: str
    source: str


class FileKnowledgeBase:
    def __init__(self, directory=None):
        self.directory = Path(directory or KNOWLEDGE_DIR)

    def _load(self):
        if not self.directory.exists():
            return []
        chunks = []
        for path in sorted(self.directory.glob("*.md")):
            text = path.read_text(encoding="utf-8").strip()
            if not text:
                continue
            title = path.stem.replace("_", " ")
            for line in text.splitlines():
                if line.startswith("#"):
                    title = line.lstrip("#").strip() or title
                    break
            chunks.append(KnowledgeChunk(path.stem, title, text[:4000], str(path)))
        return chunks

    def retrieve(self, spec, task_input, k=3):
        chunks = self._load()
        if not chunks:
            return []
        query = " ".join([str(task_input.get("ticker", "")), str(task_input.get("question", "")), getattr(spec, "id", "")]).lower()
        scored = []
        for chunk in chunks:
            haystack = ("%s %s" % (chunk.title, chunk.text)).lower()
            score = sum(1 for token in query.split() if token and token in haystack)
            scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored[:k]]
