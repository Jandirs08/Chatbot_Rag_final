from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Any


DEFAULT_RAGAS_MODEL = os.getenv("RAGAS_EVAL_MODEL", "gpt-4o-mini")
DEFAULT_RAGAS_EMBEDDING_MODEL = os.getenv("RAGAS_EMBEDDING_MODEL", "text-embedding-3-small")


@dataclass
class RagasArtifacts:
    summary: dict[str, Any]
    rows: list[dict[str, Any]]
    report_path: Path


def is_ragas_available() -> bool:
    try:
        import ragas  # noqa: F401
        return True
    except Exception:
        return False


def _load_backend_env() -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    backend_env = Path(__file__).resolve().parents[2] / ".env"
    if backend_env.exists():
        load_dotenv(backend_env)


def _get_embedding_factory():
    try:
        from ragas.embeddings.base import embedding_factory
        return embedding_factory
    except Exception:
        from ragas.embeddings import embedding_factory
        return embedding_factory


def _build_metric_instances(llm: Any, embeddings: Any) -> list[Any]:
    metrics: list[Any] = []

    try:
        from ragas.metrics import Faithfulness
        metrics.append(Faithfulness(llm=llm))
    except Exception:
        try:
            from ragas.metrics import faithfulness
            metrics.append(faithfulness)
        except Exception:
            pass

    try:
        from ragas.metrics import ResponseRelevancy
        metrics.append(ResponseRelevancy(llm=llm, embeddings=embeddings))
    except Exception:
        try:
            from ragas.metrics import answer_relevancy
            metrics.append(answer_relevancy)
        except Exception:
            pass

    try:
        from ragas.metrics import FactualCorrectness
        metrics.append(FactualCorrectness(llm=llm))
    except Exception:
        try:
            from ragas.metrics import answer_correctness
            metrics.append(answer_correctness)
        except Exception:
            pass

    try:
        from ragas.metrics import LLMContextPrecisionWithReference
        metrics.append(LLMContextPrecisionWithReference(llm=llm))
    except Exception:
        pass

    if not metrics:
        raise RuntimeError("No se pudieron cargar metricas compatibles de Ragas.")

    return metrics


def evaluate_with_ragas(
    *,
    case_records: list[dict[str, Any]],
    report_dir: Path,
    model_name: str = DEFAULT_RAGAS_MODEL,
    embedding_model: str = DEFAULT_RAGAS_EMBEDDING_MODEL,
) -> RagasArtifacts:
    _load_backend_env()

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY no esta disponible para ejecutar Ragas.")

    from ragas import EvaluationDataset, SingleTurnSample, evaluate
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import LangchainLLMWrapper
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    llm = LangchainLLMWrapper(
        ChatOpenAI(
            model=model_name,
            temperature=0,
            api_key=os.getenv("OPENAI_API_KEY"),
        )
    )
    embeddings = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(
            model=embedding_model,
            api_key=os.getenv("OPENAI_API_KEY"),
        )
    )
    metrics = _build_metric_instances(llm=llm, embeddings=embeddings)

    samples: list[Any] = []
    included_ids: list[str] = []
    for record in case_records:
        if record.get("error"):
            continue
        if not bool(record.get("requires_corpus")):
            continue
        response = str(record.get("answer") or "").strip()
        if not response:
            continue

        sample_kwargs: dict[str, Any] = {
            "user_input": str(record.get("question") or ""),
            "response": response,
        }

        retrieved_contexts = record.get("retrieved_contexts") or []
        if retrieved_contexts:
            sample_kwargs["retrieved_contexts"] = [str(item) for item in retrieved_contexts if str(item).strip()]

        reference_answer = str(record.get("reference_answer") or "").strip()
        if reference_answer:
            sample_kwargs["reference"] = reference_answer

        sample = SingleTurnSample(**sample_kwargs)
        samples.append(sample)
        included_ids.append(str(record.get("id") or ""))

    if not samples:
        raise RuntimeError("No hubo muestras RAG validas para evaluar con Ragas.")

    dataset = EvaluationDataset(samples=samples)
    result = evaluate(dataset=dataset, metrics=metrics, llm=llm, embeddings=embeddings)
    frame = result.to_pandas()
    rows = frame.to_dict(orient="records")

    metric_names = [key for key in frame.columns if key not in {"user_input", "response", "reference", "retrieved_contexts"}]
    summary: dict[str, Any] = {"samples": len(rows), "metrics": {}}
    for metric_name in metric_names:
        values = [float(row[metric_name]) for row in rows if row.get(metric_name) is not None]
        if values:
            summary["metrics"][metric_name] = round(sum(values) / len(values), 4)

    for index, row in enumerate(rows):
        row["case_id"] = included_ids[index]

    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "ragas_report.json"
    report_path.write_text(
        json.dumps(
            {
                "summary": summary,
                "rows": rows,
                "model": model_name,
                "embedding_model": embedding_model,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )

    return RagasArtifacts(summary=summary, rows=rows, report_path=report_path)
