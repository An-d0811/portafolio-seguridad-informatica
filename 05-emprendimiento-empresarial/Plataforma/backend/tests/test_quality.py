import json
from datetime import date

from app.api.reports import sign_content
from app.services.ai import build_evidence, parse_report
from app.services.mitigations import is_mitigation_overdue


class FakeAsset:
    name = "Servidor de correo"
    criticality = 5
    asset_type = "hardware"
    organization_id = 1


class FakeEvaluation:
    answers = {"identify": 1, "protect": 2, "detect": 2, "respond": 3, "recover": 2}
    likelihood = 4
    impact = 4
    score = 82
    level = "critical"
    framework = "NIST CSF 2.0"


def test_parse_report_accepts_valid_json():
    raw = json.dumps(
        {"executive_summary": "Resumen.", "technical_details": "Detalles.", "recommendations": ["Accion 1", "Accion 2"]}
    )
    parsed = parse_report(raw)
    assert parsed is not None
    assert parsed["executive_summary"] == "Resumen."
    assert len(parsed["recommendations"]) == 2


def test_parse_report_strips_code_fences():
    raw = "```json\n{\"executive_summary\": \"R\", \"technical_details\": \"D\", \"recommendations\": [\"A\"]}\n```"
    parsed = parse_report(raw)
    assert parsed is not None
    assert parsed["recommendations"] == ["A"]


def test_parse_report_rejects_invalid_or_fallback_markers():
    assert parse_report("no es json") is None
    assert parse_report("{}") is None
    assert parse_report(json.dumps({"executive_summary": 5, "technical_details": "x", "recommendations": []})) is None


def test_build_evidence_marks_weak_functions():
    mitre = [{"mitre_tactic": "Reconnaissance"}]
    evidence = build_evidence(FakeAsset(), FakeEvaluation(), mitre)
    assert "identify" in evidence["weak_functions"]
    assert evidence["mitre_tactics"] == ["Reconnaissance"]
    assert evidence["score"] == 82


def test_sign_content_detects_tampering():
    content = {"executive_summary": "A", "technical_details": "B", "recommendations": ["C"]}
    other = {"executive_summary": "A", "technical_details": "B", "recommendations": ["D"]}
    assert sign_content("Titulo", content) != sign_content("Titulo", other)
    assert sign_content("Titulo", content) == sign_content("Titulo", content)


def test_is_mitigation_overdue_logic():
    today = date(2026, 8, 15)
    assert is_mitigation_overdue(date(2026, 8, 14), "pending", today)
    assert not is_mitigation_overdue(date(2026, 8, 16), "pending", today)
    assert not is_mitigation_overdue(date(2026, 8, 14), "resolved", today)
    assert not is_mitigation_overdue(None, "pending", today)
