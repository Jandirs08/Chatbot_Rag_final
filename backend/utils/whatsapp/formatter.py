import re


def format_text(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"\n{2,}", "\n", t)
    if len(t) > 4000:
        t = t[:4000]
    return t