from __future__ import annotations

import argparse
from pathlib import Path

from pdf_text_writer import write_markdown_as_pdf


DEFAULT_MD = Path(__file__).resolve().parent / "corpus" / "manual_eval_rag.md"
DEFAULT_PDF = Path(__file__).resolve().parent / "generated" / "manual_eval_rag.pdf"


def prepare_corpus(markdown_path: Path = DEFAULT_MD, pdf_path: Path = DEFAULT_PDF) -> Path:
    if not markdown_path.exists():
        raise FileNotFoundError(f"No existe el corpus Markdown: {markdown_path}")
    return write_markdown_as_pdf(markdown_path, pdf_path)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera el PDF de evaluacion E2E del RAG.")
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MD, help="Ruta del corpus Markdown.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="Ruta de salida del PDF.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    output_path = prepare_corpus(markdown_path=args.markdown, pdf_path=args.pdf)
    print(f"PDF generado en: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
