from __future__ import annotations

from pathlib import Path
import textwrap


PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT_MARGIN = 56
TOP_MARGIN = 790
BOTTOM_MARGIN = 56
LINE_HEIGHT = 15
MAX_CHARS_PER_LINE = 88


def _escape_pdf_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def markdown_to_lines(markdown_text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in markdown_text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            lines.append("")
            continue

        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                lines.append(heading.upper())
                lines.append("")
            continue

        if stripped.startswith("- "):
            stripped = f"* {stripped[2:].strip()}"

        wrapped = textwrap.wrap(
            stripped,
            width=MAX_CHARS_PER_LINE,
            break_long_words=False,
            break_on_hyphens=False,
        )
        lines.extend(wrapped or [""])
    return lines


def _paginate(lines: list[str]) -> list[list[str]]:
    max_lines_per_page = max(1, int((TOP_MARGIN - BOTTOM_MARGIN) / LINE_HEIGHT))
    pages: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if len(current) >= max_lines_per_page:
            pages.append(current)
            current = []
        current.append(line)
    if current or not pages:
        pages.append(current)
    return pages


def _build_content_stream(page_lines: list[str]) -> bytes:
    content_lines = ["BT", "/F1 11 Tf", f"{LEFT_MARGIN} {TOP_MARGIN} Td"]
    first = True
    for line in page_lines:
        if not first:
            content_lines.append(f"0 -{LINE_HEIGHT} Td")
        first = False
        safe_line = _escape_pdf_text(line)
        content_lines.append(f"({safe_line}) Tj")
    content_lines.append("ET")
    return "\n".join(content_lines).encode("latin-1", errors="replace")


def build_simple_pdf_bytes(lines: list[str]) -> bytes:
    pages = _paginate(lines)
    objects: list[bytes] = []

    def add_object(payload: bytes) -> int:
        objects.append(payload)
        return len(objects)

    catalog_id = add_object(b"<< /Type /Catalog /Pages 2 0 R >>")
    assert catalog_id == 1
    pages_id = add_object(b"<< /Type /Pages /Count 0 /Kids [] >>")
    assert pages_id == 2
    font_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    assert font_id == 3

    page_ids: list[int] = []
    for page_lines in pages:
        stream = _build_content_stream(page_lines)
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page_id = add_object(
            (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
            ).encode("ascii")
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids).encode("ascii")
    objects[pages_id - 1] = (
        b"<< /Type /Pages /Count "
        + str(len(page_ids)).encode("ascii")
        + b" /Kids [ "
        + kids
        + b" ] >>"
    )

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, payload in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(payload)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode("ascii")
    output.extend(trailer)
    return bytes(output)


def write_markdown_as_pdf(markdown_path: Path, pdf_path: Path) -> Path:
    markdown_text = markdown_path.read_text(encoding="utf-8")
    lines = markdown_to_lines(markdown_text)
    pdf_bytes = build_simple_pdf_bytes(lines)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(pdf_bytes)
    return pdf_path
