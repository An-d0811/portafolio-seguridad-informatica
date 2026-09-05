import json
import logging
import re

from openai import OpenAI

from app.core.config import get_settings
from app.models import Asset, Evaluation
from app.services.risk import classify_mitre

logger = logging.getLogger(__name__)


def generate_risk_report(asset: Asset, evaluation: Evaluation) -> dict:
    settings = get_settings()
    mitre = classify_mitre(evaluation.answers)
    fallback = {
        "executive_summary": (
            f"El activo {asset.name} presenta un riesgo {evaluation.level.value} con puntaje {evaluation.score}/100. "
            "La institucion debe priorizar controles preventivos, monitoreo continuo y planes de respuesta."
        ),
        "technical_details": (
            f"Evaluacion basada en NIST CSF 2.0. Probabilidad={evaluation.likelihood}, impacto={evaluation.impact}, "
            f"criticidad={asset.criticality}. Brechas MITRE ATT&CK detectadas: {', '.join(item['mitre_tactic'] for item in mitre) or 'sin brechas criticas'}."
        ),
        "recommendations": [
            "Asignar responsable institucional y fecha de cierre para cada brecha.",
            "Implementar MFA, segmentacion de red y respaldos verificados.",
            "Revisar el reporte con seguridad, tecnologia y direccion antes de emitirlo oficialmente.",
        ],
    }
    if not settings.openai_api_key:
        return fallback

    client_kwargs = {"api_key": settings.openai_api_key}
    if settings.openai_base_url:
        client_kwargs["base_url"] = settings.openai_base_url
    client = OpenAI(**client_kwargs)
    prompt = {
        "asset": {"name": asset.name, "type": asset.asset_type.value, "criticality": asset.criticality},
        "evaluation": {
            "framework": evaluation.framework,
            "answers": evaluation.answers,
            "score": evaluation.score,
            "level": evaluation.level.value,
        },
        "mitre_findings": mitre,
        "context": "Instituciones publicas y autonomas de Guatemala, conectividad intermitente y presupuesto limitado.",
    }
    extra_body = None
    if settings.ai_reasoning_enabled:
        extra_body = {
            "chat_template_kwargs": {
                "thinking": True,
                "reasoning_effort": settings.ai_reasoning_effort,
            }
        }

    request = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Eres un experto senior en ciberseguridad para instituciones de Guatemala. "
                    "Devuelve exclusivamente JSON valido, sin markdown, sin texto adicional. "
                    "Se conciso: executive_summary de maximo 120 palabras, technical_details de maximo 150 palabras "
                    "y exactamente 5 recommendations cortas y accionables."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Genera un reporte con estas claves exactas: executive_summary string, "
                    "technical_details string, recommendations array de exactamente 5 strings. Caso: "
                    + json.dumps(prompt, ensure_ascii=True)
                ),
            },
        ],
        "temperature": 0.2,
        "top_p": 0.95,
        "max_tokens": settings.ai_max_tokens,
    }
    if extra_body:
        request["extra_body"] = extra_body

    try:
        response = client.chat.completions.create(**request)
        content = response.choices[0].message.content or "{}"
    except Exception as exc:
        logger.exception("AI provider request failed: %s", exc)
        return fallback

    content = _extract_json(content)
    try:
        parsed = json.loads(content)
        return {
            "executive_summary": parsed.get("executive_summary", fallback["executive_summary"]),
            "technical_details": parsed.get("technical_details", fallback["technical_details"]),
            "recommendations": parsed.get("recommendations", fallback["recommendations"]),
        }
    except json.JSONDecodeError:
        logger.warning("AI provider returned non-JSON content: %s", content[:500])
        return fallback


def _extract_json(content: str) -> str:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first >= 0 and last > first:
        return cleaned[first : last + 1]
    return cleaned
