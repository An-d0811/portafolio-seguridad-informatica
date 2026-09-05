from app.models import RiskLevel
from app.services.risk import calculate_risk_score, classify_mitre


def test_calculate_risk_score_returns_critical_for_bad_controls():
    score, level = calculate_risk_score(
        {"identify": 1, "protect": 1, "detect": 1, "respond": 1, "recover": 1},
        likelihood=5,
        impact=5,
        criticality=5,
    )
    assert score == 100
    assert level == RiskLevel.critical


def test_classify_mitre_maps_weak_controls():
    findings = classify_mitre({"identify": 2, "protect": 4, "detect": 1})
    tactics = {item["mitre_tactic"] for item in findings}
    assert "Reconnaissance" in tactics
    assert "Defense Evasion" in tactics
