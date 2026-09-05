import json
import logging
import re

from openai import OpenAI

from app.core.config import get_settings
from app.models import Asset, Evaluation
from app.services.risk import NIST_FUNCTIONS, classify_mitre
from app.services.settings_store import get_setting

logger = logging.getLogger(__name__)

FALLBACK = None


def level_value(level) -> str:
    return level.value if hasattr(level, "value") else str(level)


def _fallback(asset: Asset, evaluation: Evaluation) -> dict:
    mitre = classify_mitre(evaluation.answers)
    return {
        "executive_summary": (
            f"El activo {asset.name} presenta un riesgo {level_value(evaluation.level)} con puntaje {evaluation.score}/100. "
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
        "evidence": build_evidence(asset, evaluation, mitre),
    }


def build_evidence(asset: Asset, evaluation: Evaluation, mitre: list[dict]) -> dict:
    weak_functions = [item for item in NIST_FUNCTIONS if int(evaluation.answers.get(item, 1)) <= 2]
    return {
        "asset": {"name": asset.name, "criticality": asset.criticality},
        "score": evaluation.score,
        "level": level_value(evaluation.level),
        "likelihood": evaluation.likelihood,
        "impact": evaluation.impact,
        "weak_functions": weak_functions,
        "mitre_tactics": [item["mitre_tactic"] for item in mitre],
        "nist_answers": evaluation.answers,
    }


def parse_report(raw: str) -> dict | None:
    content = _extract_json(raw)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    summary = parsed.get("executive_summary")
    details = parsed.get("technical_details")
    recommendations = parsed.get("recommendations")
    if not isinstance(summary, str) or not isinstance(details, str) or not isinstance(recommendations, list):
        return None
    if not all(isinstance(item, str) and item.strip() for item in recommendations):
        return None
    return {
        "executive_summary": summary.strip(),
        "technical_details": details.strip(),
        "recommendations": [item.strip() for item in recommendations[:8]],
    }


def _api_key_for_base_url(base_url: str | None, settings) -> str | None:
    if base_url:
        if "generativelanguage.googleapis.com" in base_url:
            return settings.gemini_api_key
        if "nvidia.com" in base_url:
            return settings.nvidia_api_key
    return settings.openai_api_key


def _provider_config(organization_id: int) -> dict:
    stored = get_setting(organization_id, "ai", {})
    settings = get_settings()
    base_url = stored.get("base_url") or settings.openai_base_url
    return {
        "api_key": stored.get("api_key") or _api_key_for_base_url(base_url, settings),
        "base_url": base_url,
        "model": stored.get("model") or settings.openai_model,
        "max_tokens": int(stored.get("max_tokens") or settings.ai_max_tokens),
        "reasoning_enabled": bool(stored.get("reasoning_enabled", settings.ai_reasoning_enabled)),
        "reasoning_effort": stored.get("reasoning_effort") or settings.ai_reasoning_effort,
    }


def detect_provider(base_url: str | None) -> str:
    if base_url:
        if "nvidia.com" in base_url:
            return "nvidia"
        if "generativelanguage.googleapis.com" in base_url:
            return "gemini"
        if "11434" in base_url or "ollama" in base_url:
            return "ollama"
    return "openai"


def generate_risk_report(asset: Asset, evaluation: Evaluation) -> tuple[dict, bool]:
    mitre = classify_mitre(evaluation.answers)
    fallback = _fallback(asset, evaluation)
    config = _provider_config(asset.organization_id)
    base_url = config["base_url"] or ""
    local_provider = any(marker in base_url for marker in ("11434", "localhost", "host.docker.internal", "127.0.0.1"))
    if not config["api_key"] and not local_provider:
        return fallback, False

    client_kwargs = {"api_key": config["api_key"] or "ollama"}
    if config["base_url"]:
        client_kwargs["base_url"] = config["base_url"]
    client = OpenAI(**client_kwargs)
    evidence = build_evidence(asset, evaluation, mitre)
    prompt = {
        "asset": {"name": asset.name, "type": asset.asset_type.value, "criticality": asset.criticality},
        "evaluation": {
            "framework": evaluation.framework,
            "answers": evaluation.answers,
            "score": evaluation.score,
            "level": level_value(evaluation.level),
        },
        "mitre_findings": mitre,
        "evidence": evidence,
        "context": "Instituciones publicas y autonomas de Guatemala, conectividad intermitente y presupuesto limitado.",
    }
    extra_body = {}
    if config["reasoning_enabled"]:
        extra_body["chat_template_kwargs"] = {
            "thinking": True,
            "reasoning_effort": config["reasoning_effort"],
        }
    if local_provider:
        extra_body["format"] = "json"
    if not extra_body:
        extra_body = None

    length_guide = (
        "Se conciso: executive_summary de maximo 120 palabras, technical_details de maximo 150 palabras "
        "y exactamente 5 recommendations cortas y accionables. "
        if not local_provider
        else "Se breve: executive_summary de maximo 60 palabras, technical_details de maximo 60 palabras "
        "y exactamente 5 recommendations de una linea cada una. "
    )
    system = (
        "Eres un experto senior en ciberseguridad para instituciones de Guatemala. "
        "Devuelve exclusivamente JSON valido, sin markdown, sin texto adicional. "
        + length_guide
        + "Cada recomendacion debe justificar la brecha referenciando las funciones NIST debiles "
        "y las tacticas MITRE correspondientes del campo evidence."
    )
    case = "Caso: " + json.dumps(prompt, ensure_ascii=True)
    max_tokens = max(config["max_tokens"], 4096)

    for attempt in range(3):
        if attempt == 0:
            user_content = (
                "Genera un reporte con estas claves exactas: executive_summary string, "
                "technical_details string, recommendations array de exactamente 5 strings. "
                "Usa el campo evidence para sustentar cada recomendacion. " + case
            )
        else:
            user_content = (
                "El JSON anterior quedo incompleto o invalido. Corrigelo: las claves exactas son "
                "executive_summary string, technical_details string, recommendations array de "
                "exactamente 5 strings, todo cerrado con }. Devuelve SOLO JSON valido y completo. " + case
            )
        request = {
            "model": config["model"],
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.2,
            "top_p": 0.95,
            "max_tokens": max_tokens,
        }
        if extra_body:
            request["extra_body"] = extra_body

        try:
            response = client.chat.completions.create(**request)
            content = response.choices[0].message.content or "{}"
        except Exception:
            logger.exception("AI provider request failed")
            return fallback, False

        parsed = parse_report(content)
        if parsed is not None:
            parsed["evidence"] = evidence
            return parsed, True
        logger.warning("AI provider returned invalid content (attempt %d): %s", attempt + 1, content[:500])
    return fallback, False


def _extract_json(content: str) -> str:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    first = cleaned.find("{")
    if first < 0:
        return cleaned
    depth = 0
    in_str = False
    esc = False
    for i in range(first, len(cleaned)):
        ch = cleaned[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return cleaned[first : i + 1]
    return cleaned
