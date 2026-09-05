import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { ArrowRight, Bell, BellRing, Bot, Check, CheckCircle2, ClipboardCheck, Clock, Download, Eye, FileText, Grid, KeyRound, LayoutDashboard, Lock, LogOut, MonitorCog, Moon, Pencil, Printer, RefreshCw, Settings, ShieldAlert, ShieldCheck, Sparkles, Sun, Target, TrendingUp, Upload, Users, X } from "lucide-react";
import "./styles.css";
import { api, setAuthToken } from "./services/api";

type Page = "dashboard" | "assets" | "evaluations" | "matrix" | "reports" | "alerts" | "mitigations" | "settings" | "users";
type Asset = { id: number; name: string; asset_type: string; owner: string; criticality: number; location?: string };
type Evaluation = { id: number; asset_id: number; score: number; level: string; answers: Record<string, number>; likelihood: number; impact: number };
type Alert = { id: number; title: string; message: string; severity: string; is_read: boolean };
type Evidence = { asset: { name: string; criticality: number }; score: number; level: string; likelihood: number; impact: number; weak_functions: string[]; mitre_tactics: string[]; nist_answers: Record<string, number> };
type Report = { id: number; title: string; executive_summary: string; technical_details: string; recommendations: string[]; evidence?: Evidence | null; content_hash?: string | null; provider?: string | null; model?: string | null; status: string; created_at: string; evaluation_id: number | null };
type Mitigation = { id: number; report_id: number; recommendation: string; owner: string; due_date: string | null; status: string; priority: string; created_at: string };
type ManagedUser = { id: number; email: string; full_name: string; role: string; is_active: boolean; mfa_enabled: boolean; created_at: string };
type ReevalItem = { asset_id: number; asset_name: string; days_old: number | null };
type Summary = { total_assets: number; total_evaluations: number; total_reports: number; total_mitigations: number; overdue_mitigations: number; reevaluation_due: ReevalItem[]; average_score: number; risk_distribution: Record<string, number>; recent_alerts: Alert[] };
type AiStatus = { configured: boolean; provider?: string; model: string; mode: "ia" | "demo"; message: string };
type Me = { full_name: string; email: string; role: string; mfa_enabled: boolean };
type TrendPoint = { month: string; average_score: number };
type AssetTrend = { asset_id: number; asset_name: string; scores: { score: number; created_at: string }[] };

const baseNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "assets", label: "Activos", icon: MonitorCog },
  { id: "evaluations", label: "Evaluaciones", icon: ClipboardCheck },
  { id: "matrix", label: "Matriz de riesgo", icon: Grid },
  { id: "reports", label: "Reportes", icon: FileText },
  { id: "mitigations", label: "Plan de mitigacion", icon: Target },
  { id: "alerts", label: "Alertas", icon: Bell }
] as const;

const adminNav = [
  { id: "users", label: "Usuarios", icon: Users },
  { id: "settings", label: "Configuracion", icon: Settings }
] as const;

const riskLevelLabels: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico"
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  resolved: "Resuelta"
};

const providerLabels: Record<string, string> = {
  nvidia: "NVD",
  openai: "OAI",
  gemini: "GEM",
  ollama: "OLM",
  demo: "Demo"
};

const nistFunctionLabels: Record<string, string> = {
  identify: "Identificar",
  protect: "Proteger",
  detect: "Detectar",
  respond: "Responder",
  recover: "Recuperar"
};

const mitreTacticLabels: Record<string, string> = {
  Reconnaissance: "Reconocimiento",
  "Resource Development": "Desarrollo de recursos",
  "Initial Access": "Acceso inicial",
  Execution: "Ejecucion",
  Persistence: "Persistencia",
  "Privilege Escalation": "Escalada de privilegios",
  "Defense Evasion": "Evasion de defensas",
  "Credential Access": "Acceso a credenciales",
  Discovery: "Descubrimiento",
  "Lateral Movement": "Movimiento lateral",
  Collection: "Recoleccion",
  "Command and Control": "Comando y control",
  Exfiltration: "Exfiltracion",
  Impact: "Impacto"
};

const translateNist = (functions: string[]) => functions.map((item) => nistFunctionLabels[item] ?? item).join(", ");
const translateTactics = (tactics: string[]) => [...new Set(tactics)].map((item) => mitreTacticLabels[item] ?? item).join(", ");

function detectProvider(baseUrl: string) {
  if (baseUrl.includes("nvidia.com")) return "nvidia";
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "gemini";
  if (baseUrl.includes("11434") || baseUrl.includes("ollama")) return "ollama";
  return "openai";
}

function riskLevelLabel(level: string) {
  return riskLevelLabels[level] ?? level;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

function isMitigationOverdue(mitigation: Mitigation) {
  if (mitigation.status === "resolved" || !mitigation.due_date) return false;
  return new Date(mitigation.due_date) < new Date(new Date().toDateString());
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@demo.gt");
  const [password, setPassword] = useState("ChangeMe123!");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    try {
      const { data } = await api.post("/auth/token", form, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
        return;
      }
      setAuthToken(data.access_token);
      onLogin();
    } catch {
      setError("No se pudo iniciar sesion. Verifique que el backend este corriendo y que exista un usuario (seed o API).");
    }
  }

  async function verifyMfa(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/mfa/verify", { mfa_token: mfaToken, code });
      setAuthToken(data.access_token);
      onLogin();
    } catch {
      setError("El codigo de verificacion es incorrecto.");
    }
  }

  if (mfaToken) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={verifyMfa}>
          <img src="/ia.jpeg" className="login-logo" alt="GuardIA" />
          <h1>Verificacion en dos pasos</h1>
          <p className="hint login-note">Ingresa el codigo de 6 digitos de tu app de autenticacion.</p>
          <label>
            Codigo
            <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} />
          </label>
          <button>Verificar</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <img src="/ia.jpeg" className="login-logo" alt="GuardIA" />
        <h1>Gestion Preventiva de Riesgos</h1>
        <p className="hint login-note">Ingresa con las credenciales de tu institucion. Las de demostracion ya estan precargadas.</p>
        <label>
          Correo
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Contrasena
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button>Ingresar</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="hint">{children}</p>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`metric${tone ? ` tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Dashboard({ goTo }: { goTo: (page: Page) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  useEffect(() => {
    api.get("/dashboard").then((response) => setSummary(response.data));
    api.get("/dashboard/trend").then((response) => setTrend(response.data));
  }, []);
  const distribution = summary?.risk_distribution ?? {};
  const steps = [
    { page: "assets" as Page, icon: MonitorCog, label: "Registra tus activos", desc: "Carga el hardware, software, datos y personal que debes proteger." },
    { page: "evaluations" as Page, icon: ClipboardCheck, label: "Evalua el riesgo", desc: "Completa la evaluacion NIST CSF 2.0 de cada activo." },
    { page: "reports" as Page, icon: FileText, label: "Genera tu reporte IA", desc: "La IA analiza tus resultados y propone recomendaciones." },
    { page: "mitigations" as Page, icon: Target, label: "Cierra las brechas", desc: "Convierte las recomendaciones en tareas con responsable y fecha." }
  ];
  const done = [
    (summary?.total_assets ?? 0) > 0,
    (summary?.total_evaluations ?? 0) > 0,
    (summary?.total_reports ?? 0) > 0,
    (summary?.total_mitigations ?? 0) > 0
  ];
  const completed = done.filter(Boolean).length;
  const maxTrend = Math.max(10, ...trend.map((item) => item.average_score));
  return (
    <section>
      <div className="page-title">
        <h2>Dashboard Ejecutivo</h2>
        <span>Riesgo promedio {summary?.average_score ?? 0}/100</span>
      </div>
      <Hint>Aqui ves el estado general de tu institucion. Sigue el proceso recomendado paso a paso para gestionar tus riesgos.</Hint>
      <div className="metric-grid">
        <Metric label="Activos" value={summary?.total_assets ?? 0} />
        <Metric label="Evaluaciones" value={summary?.total_evaluations ?? 0} />
        <Metric label="Reportes IA" value={summary?.total_reports ?? 0} />
        <Metric label="Tareas de mitigacion" value={summary?.total_mitigations ?? 0} />
        <Metric label="Alertas recientes" value={summary?.recent_alerts?.length ?? 0} />
      </div>
      {(summary?.overdue_mitigations ?? 0) > 0 && (
        <div className="warning-banner">
          <ShieldAlert size={16} />
          <span>{summary?.overdue_mitigations ?? 0} tarea(s) de mitigacion vencida(s). Revisa el <button className="link-btn" onClick={() => goTo("mitigations")}>Plan de mitigacion</button>.</span>
        </div>
      )}
      {summary?.reevaluation_due?.length ? (
        <div className="panel">
          <h3><RefreshCw size={16} /> Reevaluaciones pendientes</h3>
          <ul className="reeval-list">
            {summary.reevaluation_due.map((item) => (
              <li key={item.asset_id}>
                <span>{item.asset_name}</span>
                <small>{item.days_old === null ? "Nunca evaluado" : `Ultima evaluacion hace ${item.days_old} dias`}</small>
                <button className="link-btn" onClick={() => goTo("evaluations")}>Evaluar</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="panel">
        <h3>Tu proceso recomendado</h3>
        <Hint>Llevas {completed} de {steps.length} pasos completados. Haz clic en un paso para ir a esa seccion.</Hint>
        <div className="workflow-list">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isDone = done[index];
            return (
              <button className={`workflow-step${isDone ? " done" : ""}`} onClick={() => goTo(step.page)} key={step.page}>
                <span className="step-number">{isDone ? <Check size={16} /> : index + 1}</span>
                <Icon size={22} />
                <span className="step-body">
                  <strong>{step.label}</strong>
                  <small>{step.desc}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h3><TrendingUp size={16} /> Evolucion del riesgo promedio</h3>
        {trend.length ? (
          <div className="trend-chart">
            {trend.map((item) => (
              <div className="trend-col" key={item.month} title={`${item.month}: ${item.average_score}/100`}>
                <span>{item.average_score}</span>
                <div className="trend-bar"><i style={{ height: `${Math.max(4, (item.average_score / maxTrend) * 100)}%` }} /></div>
                <small>{item.month}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">Aun no hay evaluaciones para graficar la evolucion del riesgo.</p>
        )}
      </div>
      <div className="panel">
        <h3>Distribucion de riesgo</h3>
        {["low", "medium", "high", "critical"].map((level) => (
          <div className="bar-row" key={level}>
            <span>{riskLevelLabel(level)}</span>
            <div><i style={{ width: `${Math.min(100, (distribution[level] ?? 0) * 20)}%` }} /></div>
            <b>{distribution[level] ?? 0}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function Assets({ canWrite }: { canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ name: "", asset_type: "hardware", owner: "", criticality: 3, location: "" });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.get("/assets").then((response) => setAssets(response.data));
  useEffect(() => {
    load();
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.post("/assets", form);
      setForm({ name: "", asset_type: "hardware", owner: "", criticality: 3, location: "" });
      load();
      notify("Activo registrado correctamente.");
    } catch {
      notify("No se pudo registrar el activo.", "error");
    }
  }
  async function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post("/assets/import", body);
      notify(`Se importaron ${data.created} activo(s).`);
      load();
    } catch (error) {
      notify((error as any)?.response?.data?.detail ?? "No se pudo importar el archivo.", "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function exportCsv() {
    const rows = assets.map((asset) => [asset.name, asset.asset_type, asset.owner, String(asset.criticality), asset.location ?? ""]);
    const csv = "\uFEFF" + [["name", "asset_type", "owner", "criticality", "location"], ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadBlob("activos.csv", csv, "text/csv;charset=utf-8");
  }
  return (
    <section>
      <div className="page-title">
        <h2>Registro de Activos</h2>
        <div className="page-actions">
          {canWrite && (
            <>
              <button className="ghost-btn" onClick={() => fileRef.current?.click()}><Upload size={16} />{importing ? "Importando..." : "Importar CSV"}</button>
              <a className="ghost-btn" href="/assets-template.csv" download>Plantilla</a>
            </>
          )}
          <button className="ghost-btn" onClick={exportCsv}><Download size={16} />Exportar CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onImportFile} />
        </div>
      </div>
      <Hint>Paso 1: registra cada activo que tu institucion debe proteger. Cada activo registrado podra evaluarse en la seccion Evaluaciones.</Hint>
      <div className="instructions">
        <h3>Que es un activo y como llenar el formulario</h3>
        <p>Un activo es cualquier recurso que tu institucion usa y debe proteger: servidores, aplicaciones, bases de datos, informacion o personal.</p>
        <ul>
          <li><strong>Nombre del activo:</strong> como se llama el recurso, por ejemplo "Portal ciudadano".</li>
          <li><strong>Tipo:</strong> clasifica el activo en Hardware, Software, Datos o Persona.</li>
          <li><strong>Responsable:</strong> quien responde por el activo dentro de la institucion (persona o area).</li>
          <li><strong>Criticidad:</strong> que tan importante es para operar. Usa 1 = baja y 5 = critica.</li>
        </ul>
      </div>
      {canWrite && (
        <>
          <h3>Nuevo activo</h3>
          <form className="inline-form" onSubmit={create}>
            <input placeholder="Nombre del activo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
              <option value="hardware">Hardware</option><option value="software">Software</option><option value="data">Datos</option><option value="person">Persona</option>
            </select>
            <input placeholder="Responsable" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <input type="number" min="1" max="5" value={form.criticality} onChange={(e) => setForm({ ...form, criticality: Number(e.target.value) })} />
            <button>Crear</button>
          </form>
        </>
      )}
      <DataTable rows={assets.map((asset) => [asset.name, asset.asset_type, asset.owner, String(asset.criticality), asset.location ?? "—"])} headers={["Activo", "Tipo", "Responsable", "Criticidad", "Ubicacion"]} empty="Aun no hay activos. Registra el primero con el formulario de arriba." />
    </section>
  );
}

function heatLevel(likelihood: number, impact: number) {
  const product = likelihood * impact;
  if (product >= 16) return "critical";
  if (product >= 9) return "high";
  if (product >= 4) return "medium";
  return "low";
}

function Heatmap({ likelihood, impact }: { likelihood: number; impact: number }) {
  const labels = [5, 4, 3, 2, 1];
  return (
    <div className="heatmap">
      <div className="heatmap-y">Impacto</div>
      <div className="heatmap-grid">
        <div className="heatmap-corner" />
        {[1, 2, 3, 4, 5].map((column) => <div className="heatmap-x" key={column}>{column}</div>)}
        {labels.map((rowImpact) => (
          <React.Fragment key={rowImpact}>
            <div className="heatmap-x">{rowImpact}</div>
            {[1, 2, 3, 4, 5].map((column) => {
              const level = heatLevel(column, rowImpact);
              const current = rowImpact === impact && column === likelihood;
              return <div key={column} className={`heat-cell heat-${level}${current ? " current" : ""}`} title={`Probabilidad ${column} x Impacto ${rowImpact} = ${riskLevelLabel(level)}`} />;
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Evaluations({ canWrite }: { canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [trends, setTrends] = useState<AssetTrend[]>([]);
  const [form, setForm] = useState({ asset_id: 0, likelihood: 3, impact: 3, identify: 3, protect: 3, detect: 3, respond: 3, recover: 3 });
  const [viewing, setViewing] = useState<Evaluation | null>(null);
  const [editing, setEditing] = useState<Evaluation | null>(null);
  const [editForm, setEditForm] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  const evalFields = [
    { key: "identify", label: "Identificar" },
    { key: "protect", label: "Proteger" },
    { key: "detect", label: "Detectar" },
    { key: "respond", label: "Responder" },
    { key: "recover", label: "Recuperar" },
    { key: "likelihood", label: "Probabilidad" },
    { key: "impact", label: "Impacto" }
  ];
  const assetName = (id: number) => assets.find((asset) => asset.id === id)?.name ?? `Activo ${id}`;
  const load = () => Promise.all([api.get("/assets"), api.get("/evaluations"), api.get("/dashboard/assets-trend")]).then(([a, e, t]) => { setAssets(a.data); setEvaluations(e.data); setTrends(t.data); });
  useEffect(() => { load(); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const assetId = form.asset_id || assets[0]?.id;
    if (!assetId) return;
    try {
      const { data } = await api.post("/evaluations", {
        asset_id: assetId,
        likelihood: form.likelihood,
        impact: form.impact,
        answers: { identify: form.identify, protect: form.protect, detect: form.detect, respond: form.respond, recover: form.recover }
      });
      load();
      notify("Evaluacion creada y nivel de riesgo calculado.");
      if (["high", "critical"].includes(data.level)) triggerAlertCheck();
    } catch {
      notify("No se pudo crear la evaluacion.", "error");
    }
  }
  function openView(item: Evaluation) { setViewing(item); }
  function openEdit(item: Evaluation) {
    setEditing(item);
    setEditForm({
      asset_id: item.asset_id,
      likelihood: item.likelihood,
      impact: item.impact,
      identify: item.answers.identify ?? 3,
      protect: item.answers.protect ?? 3,
      detect: item.answers.detect ?? 3,
      respond: item.answers.respond ?? 3,
      recover: item.answers.recover ?? 3
    });
  }
  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editForm || !editing) return;
    setError("");
    try {
      const { data } = await api.patch(`/evaluations/${editing.id}`, {
        asset_id: editForm.asset_id,
        likelihood: editForm.likelihood,
        impact: editForm.impact,
        answers: { identify: editForm.identify, protect: editForm.protect, detect: editForm.detect, respond: editForm.respond, recover: editForm.recover }
      });
      setEditing(null);
      setEditForm(null);
      load();
      notify("Cambios guardados correctamente.");
      if (["high", "critical"].includes(data.level)) triggerAlertCheck();
    } catch {
      setError("No se pudo guardar la evaluacion.");
      notify("No se pudo guardar la evaluacion.", "error");
    }
  }
  return (
    <section>
      <div className="page-title"><h2>Evaluacion NIST CSF 2.0</h2></div>
      <Hint>Paso 2: mide la madurez de ciberseguridad de un activo y calcula su nivel de riesgo.</Hint>
      {!assets.length && <p className="error">Primero registra al menos un activo en la seccion Activos para poder evaluar.</p>}
      <div className="instructions">
        <h3>Como responder la evaluacion</h3>
        <p>Para cada funcion usa la escala de 1 a 5: <strong>1 = Deficiente</strong> (no existe o no funciona) y <strong>5 = Excelente</strong> (implementada y verificada).</p>
        <ul>
          <li><strong>Identificar:</strong> conoces que el activo existe, que lo conecta y cuanto vale para la institucion.</li>
          <li><strong>Proteger:</strong> hay controles de seguridad como accesos, cifrado y respaldos.</li>
          <li><strong>Detectar:</strong> puedes darte cuenta a tiempo de un incidente con monitoreo y alertas.</li>
          <li><strong>Responder:</strong> existe un plan claro para actuar cuando ocurre un incidente.</li>
          <li><strong>Recuperar:</strong> puedes restaurar el servicio despues de un incidente.</li>
          <li><strong>Probabilidad:</strong> que tan posible es que ocurra un incidente en este activo.</li>
          <li><strong>Impacto:</strong> que tan graves serian las consecuencias si ocurre.</li>
        </ul>
        <p>El sistema combina las funciones NIST con probabilidad e impacto para calcular el nivel de riesgo automaticamente.</p>
      </div>
      {canWrite && (
        <>
          <h3>Nueva evaluacion</h3>
          <form className="eval-grid" onSubmit={create}>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: Number(e.target.value) })}>
              <option value={0}>Seleccione activo</option>
              {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
            </select>
            {evalFields.map((field) => (
              <label key={field.key}>{field.label}<input type="number" min="1" max="5" value={(form as any)[field.key]} onChange={(e) => setForm({ ...form, [field.key]: Number(e.target.value) })} /></label>
            ))}
            <button>Calcular riesgo</button>
          </form>
        </>
      )}
      <h3>Evaluaciones realizadas</h3>
      <DataTable
        headers={["ID", "Activo", "Puntaje", "Nivel", "CVSS v3", "Tendencia"]}
        rows={evaluations.map((item) => [String(item.id), assetName(item.asset_id), String(item.score), riskLevelLabel(item.level), `${cvssMapping[item.level]?.rating ?? "—"} (${cvssMapping[item.level]?.range ?? ""})`, trendArrow(item.asset_id, trends, item.id)])}
        empty="Aun no hay evaluaciones. Completa el formulario de arriba para calcular tu primer riesgo."
        actions={(index) => {
          const item = evaluations[index];
          return (
            <div className="row-actions">
              <button className="icon-btn" title="Ver puntos y matriz" onClick={() => openView(item)}><Eye size={16} /></button>
              {canWrite && <button className="icon-btn" title="Editar" onClick={() => openEdit(item)}><Pencil size={16} /></button>}
            </div>
          );
        }}
      />
      {trends.length > 0 && (
        <div className="panel">
          <h3><TrendingUp size={16} /> Tendencia de riesgo por activo</h3>
          <div className="trend-assets">
            {trends.map((item) => {
              const last = item.scores[item.scores.length - 1];
              const prev = item.scores[item.scores.length - 2];
              const direction = prev ? last.score > prev.score ? "up" : last.score < prev.score ? "down" : "flat" : "flat";
              return (
                <div className="asset-trend" key={item.asset_id}>
                  <strong>{item.asset_name}</strong>
                  <span>Ultimo: {last.score}/100</span>
                  <span className={`trend-dot ${direction}`}>{direction === "up" ? "Subiendo" : direction === "down" ? "Bajando" : "Estable"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <h3>Detalle de la evaluacion</h3>
              <button type="button" className="icon-btn" title="Cerrar" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <p className="hint">Activo: <strong>{assetName(viewing.asset_id)}</strong> - Puntaje {viewing.score}/100 - Nivel <strong>{riskLevelLabel(viewing.level)}</strong> - CVSS v3 {cvssMapping[viewing.level]?.rating}</p>
            <Heatmap likelihood={viewing.likelihood} impact={viewing.impact} />
            <div className="score-list">
              {[
                { label: "Identificar", value: viewing.answers.identify ?? 0 },
                { label: "Proteger", value: viewing.answers.protect ?? 0 },
                { label: "Detectar", value: viewing.answers.detect ?? 0 },
                { label: "Responder", value: viewing.answers.respond ?? 0 },
                { label: "Recuperar", value: viewing.answers.recover ?? 0 },
                { label: "Probabilidad", value: viewing.likelihood },
                { label: "Impacto", value: viewing.impact }
              ].map((item) => (
                <div className="score-item" key={item.label}><span>{item.label}</span><b>{item.value}</b></div>
              ))}
            </div>
          </div>
        </div>
      )}
      {editing && editForm && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <div className="modal-title">
              <h3>Editar evaluacion</h3>
              <button type="button" className="icon-btn" title="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <label>
              Activo
              <select value={editForm.asset_id} onChange={(e) => setEditForm({ ...editForm, asset_id: Number(e.target.value) })}>
                {assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
              </select>
            </label>
            <div className="eval-grid">
              {evalFields.map((field) => (
                <label key={field.key}>{field.label}<input type="number" min="1" max="5" value={editForm[field.key]} onChange={(e) => setEditForm({ ...editForm, [field.key]: Number(e.target.value) })} /></label>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit">Guardar cambios</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

const cvssMapping: Record<string, { rating: string; range: string }> = {
  low: { rating: "Bajo", range: "0.1 - 3.9" },
  medium: { rating: "Medio", range: "4.0 - 6.9" },
  high: { rating: "Alto", range: "7.0 - 8.9" },
  critical: { rating: "Critico", range: "9.0 - 10.0" }
};

function RiskMatrix() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  useEffect(() => {
    Promise.all([api.get("/assets"), api.get("/evaluations")]).then(([a, e]) => { setAssets(a.data); setEvaluations(e.data); });
  }, []);
  const assetName = (id: number) => assets.find((asset) => asset.id === id)?.name ?? `Activo ${id}`;
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  evaluations.forEach((item) => { counts[item.level as keyof typeof counts] = (counts[item.level as keyof typeof counts] ?? 0) + 1; });
  const inCell = (likelihood: number, impact: number) => evaluations.filter((item) => item.likelihood === likelihood && item.impact === impact);
  return (
    <section>
      <div className="page-title"><h2>Matriz de riesgo</h2></div>
      <Hint>Cada punto es un activo evaluado, ubicado segun su probabilidad e impacto. El sistema usa esta posicion para clasificar el nivel de riesgo y la IA prioriza las recomendaciones segun el cuadrante.</Hint>
      <div className="panel">
        <h3><Grid size={16} /> Distribucion de activos por probabilidad e impacto</h3>
        <div className="heatmap matrix-heatmap">
          <div className="heatmap-y">Impacto</div>
          <div className="heatmap-grid">
            <div className="heatmap-corner" />
            {[1, 2, 3, 4, 5].map((column) => <div className="heatmap-x" key={column}>{column}</div>)}
            {[5, 4, 3, 2, 1].map((rowImpact) => (
              <React.Fragment key={rowImpact}>
                <div className="heatmap-x">{rowImpact}</div>
                {[1, 2, 3, 4, 5].map((column) => {
                  const level = heatLevel(column, rowImpact);
                  const items = inCell(column, rowImpact);
                  return (
                    <div className={`heat-cell heat-${level} matrix-cell`} key={column} title={items.length ? items.map((item) => `${assetName(item.asset_id)} - ${item.score}/100 - ${riskLevelLabel(item.level)}`).join("\n") : `Probabilidad ${column} x Impacto ${rowImpact} = ${riskLevelLabel(level)}`}>
                      {items.map((item) => <span key={item.id} className={`matrix-dot level-${item.level}`} data-tip={`${assetName(item.asset_id)} · ${item.score}/100 · ${riskLevelLabel(item.level)}`} />)}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="matrix-x-note">Probabilidad</div>
        <div className="matrix-legend">
          {["low", "medium", "high", "critical"].map((level) => (
            <span key={level}><i className={`dot level-${level}`} />{riskLevelLabel(level)}: {counts[level as keyof typeof counts]}</span>
          ))}
        </div>
      </div>
      <h3>Detalle por activo</h3>
      <DataTable
        headers={["Activo", "Probabilidad", "Impacto", "Puntaje", "Nivel", "CVSS v3"]}
        rows={evaluations.map((item) => [assetName(item.asset_id), String(item.likelihood), String(item.impact), `${item.score}/100`, riskLevelLabel(item.level), `${cvssMapping[item.level]?.rating ?? "—"} (${cvssMapping[item.level]?.range ?? ""})`])}
        empty="Aun no hay evaluaciones para graficar en la matriz. Completa una evaluacion en la seccion Evaluaciones."
      />
    </section>
  );
}

function trendArrow(assetId: number, trends: AssetTrend[], currentId: number) {
  const asset = trends.find((item) => item.asset_id === assetId);
  if (!asset || asset.scores.length < 2) return "—";
  const last = asset.scores[asset.scores.length - 1];
  const prev = asset.scores[asset.scores.length - 2];
  if (last.score > prev.score) return "Sube";
  if (last.score < prev.score) return "Baja";
  return "Estable";
}

function Reports({ goTo, canWrite }: { goTo: (page: Page) => void; canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [evaluationId, setEvaluationId] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [printId, setPrintId] = useState<number | null>(null);
  const assetName = (id: number) => assets.find((asset) => asset.id === id)?.name ?? `Evaluacion ${id}`;
  const evaluationAsset = (evaluationId: number) => evaluations.find((item) => item.id === evaluationId);
  const reportAssetName = (report: Report) => {
    const evaluation = evaluationAsset(report.evaluation_id ?? 0);
    return evaluation ? assetName(evaluation.asset_id) : "Sin activo";
  };
  const load = () => Promise.all([api.get("/assets"), api.get("/evaluations"), api.get("/reports")]).then(([a, e, r]) => { setAssets(a.data); setEvaluations(e.data); setReports(r.data); });
  useEffect(() => { load(); }, []);
  async function create() {
    const selectedEvaluationId = evaluationId || evaluations[0]?.id;
    if (!selectedEvaluationId) {
      setError("Primero crea una evaluacion en la seccion Evaluaciones.");
      return;
    }
    setIsGenerating(true);
    setError("");
    try {
      await api.post("/reports", { evaluation_id: selectedEvaluationId });
      await load();
      notify("Reporte IA generado correctamente.");
    } catch {
      setError("No se pudo generar el reporte IA. Revise la configuracion del proveedor y los logs del backend.");
      notify("No se pudo generar el reporte IA.", "error");
    } finally {
      setIsGenerating(false);
    }
  }
  async function verifySignature(report: Report) {
    try {
      const { data } = await api.get(`/reports/${report.id}/verify`);
      if (data.valid) notify("Firma verificada: el contenido no ha sido alterado.");
      else notify("Alerta: la firma no coincide con el contenido actual.", "error");
    } catch {
      notify("No se pudo verificar la firma del reporte.", "error");
    }
  }
  function exportWord(report: Report) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${report.title}</title></head>
<body>
<div style="border-bottom:3px solid #1b3a6b;padding-bottom:10px;margin-bottom:16px">
  <h1 style="color:#1b3a6b;margin:0">GuardIA</h1>
  <p style="margin:0;color:#555">Gestion Preventiva de Riesgos Ciberneticos - ${reportAssetName(report)}</p>
</div>
<h2>${report.title}</h2>
<h3>Resumen ejecutivo</h3>
<p>${report.executive_summary}</p>
<h3>Detalles tecnicos</h3>
<p>${report.technical_details}</p>
<h3>Recomendaciones</h3>
<ol>${report.recommendations.map((item) => `<li>${item}</li>`).join("")}</ol>
</body></html>`;
    downloadBlob(`reporte-${report.id}.doc`, html, "application/msword");
  }
  function exportExcel(report: Report) {
    const rows = [
      ["Campo", "Valor"],
      ["Titulo", report.title],
      ["Activo", reportAssetName(report)],
      ["Estado", report.status],
      ["Fecha", new Date(report.created_at).toLocaleDateString("es-GT")],
      ["Resumen ejecutivo", report.executive_summary],
      ["Detalles tecnicos", report.technical_details],
      ...report.recommendations.map((item, index) => [`Recomendacion ${index + 1}`, item])
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadBlob(`reporte-${report.id}.csv`, csv, "text/csv;charset=utf-8");
  }
  return (
    <section>
      <div className="page-title"><h2>Reportes IA</h2>{canWrite && <button disabled={isGenerating || !evaluations.length} onClick={create}>{isGenerating ? "Generando..." : "Generar reporte"}</button>}</div>
      <Hint>Paso 3: selecciona una evaluacion y genera el reporte. La IA redacta el resumen ejecutivo y las recomendaciones por ti.</Hint>
      <div className="ai-panel">
        <h3><Sparkles size={18} /> Que hace la IA</h3>
        <p>Analiza la evaluacion NIST CSF 2.0 del activo (probabilidad, impacto y funciones), contrasta las brechas con el marco MITRE ATT&CK y redacta un resumen ejecutivo, detalles tecnicos y recomendaciones accionables para tu institucion.</p>
      </div>
      {canWrite && (
        <label className="eval-select">
          Evaluacion a analizar
          <select value={evaluationId} onChange={(e) => setEvaluationId(Number(e.target.value))}>
            <option value={0}>Seleccione una evaluacion</option>
            {evaluations.map((item) => <option value={item.id} key={item.id}>{assetName(item.asset_id)} - {riskLevelLabel(item.level)}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="report-list">
        {reports.map((report) => (
          <article className="panel" key={report.id}>
            <div className="report-head">
              <h3>{report.title}</h3>
              <div className="row-actions">
                <button className="icon-btn" title="Firma de integridad" onClick={() => verifySignature(report)}><ShieldCheck size={16} /></button>
                <button className="icon-btn" title="Exportar a Word" onClick={() => exportWord(report)}><FileText size={16} /></button>
                <button className="icon-btn" title="Exportar a Excel (CSV)" onClick={() => exportExcel(report)}><Download size={16} /></button>
                <button className="print-btn" onClick={() => { setPrintId(report.id); setTimeout(() => window.print(), 60); }} title="Imprimir o guardar como PDF"><Printer size={16} />Imprimir PDF</button>
              </div>
            </div>
            {report.provider && (
              <span className={`ai-origin ${report.provider === "demo" ? "demo" : "ok"}`}>
                <Bot size={13} />
                {report.provider === "demo"
                  ? "Reporte de ejemplo (modo demostracion: sin IA configurada)"
                  : "Generado con IA"}
              </span>
            )}
            <p>{report.executive_summary}</p>
            <h4>Recomendaciones</h4>
            <ul className="recommendation-list">
              {report.recommendations.map((item) => (
                <li key={item}>
                  {item}
                  {canWrite && <button className="mini-btn" onClick={() => { openPlan({ reportId: report.id, recommendation: item }); goTo("mitigations"); }}><Target size={14} />Plan</button>}
                </li>
              ))}
            </ul>
            {report.evidence && (
              <div className="evidence-panel">
                <h4><ShieldAlert size={14} /> Evidencia que sustenta el reporte</h4>
                <p>
                  Funciones NIST debiles: <strong>{report.evidence.weak_functions.length ? translateNist(report.evidence.weak_functions) : "ninguna"}</strong>.
                  Tacticas MITRE ATT&CK: <strong>{report.evidence.mitre_tactics.length ? translateTactics(report.evidence.mitre_tactics) : "ninguna"}</strong>.
                  Probabilidad {report.evidence.likelihood} / Impacto {report.evidence.impact}.
                </p>
              </div>
            )}
          </article>
        ))}
        {!reports.length && <p className="hint">Aun no hay reportes generados. Completa el formulario de arriba para crear el primero.</p>}
      </div>
      {reports.length > 0 && (() => {
        const printReport = reports.find((report) => report.id === printId) ?? reports[0];
        const evaluation = evaluationAsset(printReport.evaluation_id ?? 0);
        const asset = evaluation ? assets.find((item) => item.id === evaluation.asset_id) : undefined;
        return createPortal(
          <div className="print-area">
            <div className="print-report">
              <header className="print-header">
                <img src="/ia.jpeg" alt="GuardIA" />
                <div>
                  <h1>GuardIA</h1>
                  <p>Gestion Preventiva de Riesgos Ciberneticos</p>
                </div>
                <div className="print-meta">
                  <span>Fecha: {new Date(printReport.created_at).toLocaleDateString("es-GT")}</span>
                  <span>Estado: {printReport.status}</span>
                </div>
              </header>
              <h2 className="print-title">{printReport.title}</h2>
              <div className="print-summary">
                <div><span>Activo</span><b>{asset?.name ?? "No disponible"}</b></div>
                <div><span>Puntaje de riesgo</span><b>{evaluation ? `${evaluation.score}/100` : "No disponible"}</b></div>
                <div><span>Nivel</span><b>{evaluation ? riskLevelLabel(evaluation.level) : "No disponible"}</b></div>
                <div><span>Fecha de emision</span><b>{new Date(printReport.created_at).toLocaleDateString("es-GT")}</b></div>
              </div>
              <h3>1. Resumen ejecutivo</h3>
              <p>{printReport.executive_summary}</p>
              <h3>2. Detalles tecnicos</h3>
              <p>{printReport.technical_details}</p>
              <h3>3. Recomendaciones</h3>
              <ol>{printReport.recommendations.map((item) => <li key={item}>{item}</li>)}</ol>
              <footer className="print-footer">
                Documento generado por GuardIA. Reporte referencial que debe ser revisado por el equipo de seguridad, tecnologia y direccion antes de su uso oficial.
              </footer>
            </div>
          </div>,
          document.body
        );
      })()}
    </section>
  );
}

function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => { api.get("/alerts").then((response) => setAlerts(response.data)); }, []);
  return (
    <section>
      <div className="page-title"><h2>Alertas</h2></div>
      <Hint>Revisa las alertas que el sistema genera ante evaluaciones con riesgo alto, tareas vencidas y da seguimiento a las que esten pendientes.</Hint>
      <DataTable rows={alerts.map((alert) => [alert.title, riskLevelLabel(alert.severity), alert.is_read ? "Leida" : "Nueva", alert.message])} headers={["Titulo", "Severidad", "Estado", "Mensaje"]} empty="Sin alertas por ahora." />
    </section>
  );
}

function Mitigations({ canWrite }: { canWrite: boolean }) {
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mitigation | null>(null);
  const [form, setForm] = useState({ report_id: 0, recommendation: "", owner: "", due_date: "", status: "pending" });
  const assetName = (id: number) => assets.find((asset) => asset.id === id)?.name ?? `Activo ${id}`;
  const reportAsset = (reportId: number) => {
    const report = reports.find((item) => item.id === reportId);
    const evaluation = report ? evaluations.find((item) => item.id === report.evaluation_id) : undefined;
    return evaluation ? assetName(evaluation.asset_id) : "Sin activo";
  };
  const load = () => Promise.all([api.get("/mitigations"), api.get("/reports"), api.get("/assets"), api.get("/evaluations")]).then(([m, r, a, e]) => { setMitigations(m.data); setReports(r.data); setAssets(a.data); setEvaluations(e.data); });
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ reportId: number; recommendation: string }>).detail;
      setEditing(null);
      setForm({ report_id: detail.reportId, recommendation: detail.recommendation, owner: "", due_date: "", status: "pending" });
      setModalOpen(true);
    };
    planBus.addEventListener("plan", handler);
    return () => planBus.removeEventListener("plan", handler);
  }, []);
  function openCreate() {
    setEditing(null);
    setForm({ report_id: reports[0]?.id ?? 0, recommendation: "", owner: "", due_date: "", status: "pending" });
    setModalOpen(true);
  }
  function openEdit(item: Mitigation) {
    setEditing(item);
    setForm({ report_id: item.report_id, recommendation: item.recommendation, owner: item.owner, due_date: item.due_date ?? "", status: item.status });
    setModalOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.recommendation.trim() || !form.report_id) {
      notify("Indica el reporte y la recomendacion a mitigar.", "error");
      return;
    }
    try {
      if (editing) {
        await api.patch(`/mitigations/${editing.id}`, { owner: form.owner, due_date: form.due_date || null, status: form.status });
        notify("Tarea actualizada correctamente.");
      } else {
        await api.post("/mitigations", { report_id: form.report_id, recommendation: form.recommendation, owner: form.owner, due_date: form.due_date || null, status: form.status });
        notify("Tarea de mitigacion creada. Llega una alerta si vence sin resolverse.");
      }
      setModalOpen(false);
      load();
      triggerAlertCheck();
    } catch {
      notify("No se pudo guardar la tarea.", "error");
    }
  }
  async function setStatus(item: Mitigation, status: string) {
    try {
      await api.patch(`/mitigations/${item.id}`, { status });
      load();
      triggerAlertCheck();
    } catch {
      notify("No se pudo actualizar la tarea.", "error");
    }
  }
  async function remove(item: Mitigation) {
    try {
      await api.delete(`/mitigations/${item.id}`);
      load();
      notify("Tarea eliminada.");
    } catch {
      notify("No se pudo eliminar la tarea.", "error");
    }
  }
  const selectedReportRecommendations = reports.find((item) => item.id === form.report_id)?.recommendations ?? [];
  const visible = mitigations.filter((item) => {
    if (filter === "overdue") return isMitigationOverdue(item);
    if (filter === "all") return true;
    return item.status === filter;
  });
  return (
    <section>
      <div className="page-title">
        <h2>Plan de mitigacion</h2>
        {canWrite && <button onClick={openCreate}>Nueva tarea</button>}
      </div>
      <Hint>Paso 4: convierte cada recomendacion de los reportes IA en una tarea con responsable y fecha limite. El sistema alerta cuando una tarea vence sin resolverse.</Hint>
      <div className="filter-chips">
        {[["all", "Todas"], ["pending", "Pendientes"], ["in_progress", "En curso"], ["resolved", "Resueltas"], ["overdue", "Vencidas"]].map(([value, label]) => (
          <button key={value} className={`chip${filter === value ? " active" : ""}`} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <DataTable
        headers={["Recomendacion", "Activo", "Responsable", "Prioridad", "Vence", "Estado"]}
        rows={visible.map((item) => [item.recommendation, reportAsset(item.report_id), item.owner || "—", riskLevelLabel(item.priority), item.due_date ?? "Sin fecha", statusLabels[item.status] ?? item.status])}
        empty="Aun no hay tareas de mitigacion. Ve a Reportes y usa el boton Plan de cada recomendacion."
        actions={(index) => {
          const item = visible[index];
          const overdue = isMitigationOverdue(item);
          if (!canWrite) {
            return <span className={`status-pill ${overdue ? "overdue" : item.status}`}>{overdue ? "Vencida" : statusLabels[item.status]}</span>;
          }
          return (
            <div className="row-actions">
              {item.status === "pending" && <button className="icon-btn" title="Iniciar" onClick={() => setStatus(item, "in_progress")}><Clock size={16} /></button>}
              {item.status !== "resolved" && <button className="icon-btn" title="Marcar resuelta" onClick={() => setStatus(item, "resolved")}><CheckCircle2 size={16} /></button>}
              {item.status === "resolved" && <button className="icon-btn" title="Reabrir" onClick={() => setStatus(item, "pending")}><RefreshCw size={16} /></button>}
              <button className="icon-btn" title="Editar" onClick={() => openEdit(item)}><Pencil size={16} /></button>
              <button className="icon-btn" title="Eliminar" onClick={() => remove(item)}><X size={16} /></button>
            </div>
          );
        }}
      />
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <div className="modal-title">
              <h3>{editing ? "Editar tarea" : "Nueva tarea de mitigacion"}</h3>
              <button type="button" className="icon-btn" title="Cerrar" onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <p className="hint">Convierte una recomendacion del reporte IA en una tarea con responsable y fecha limite. El sistema alerta si vence sin resolverse.</p>
            <label>
              Reporte
              <select value={form.report_id} onChange={(e) => setForm({ ...form, report_id: Number(e.target.value), recommendation: "" })}>
                <option value={0}>Seleccione un reporte</option>
                {reports.map((report) => <option value={report.id} key={report.id}>{report.title}</option>)}
              </select>
            </label>
            {selectedReportRecommendations.length > 0 && (
              <label>
                Recomendaciones disponibles (clic para usarla)
                <div className="rec-chips">
                  {selectedReportRecommendations.map((rec) => (
                    <button type="button" key={rec} className="chip" onClick={() => setForm({ ...form, recommendation: rec })}>{rec.slice(0, 60)}{rec.length > 60 ? "..." : ""}</button>
                  ))}
                </div>
              </label>
            )}
            <label>
              Recomendacion a mitigar
              <textarea rows={2} value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} placeholder="Escribe o elige una recomendacion de arriba" />
            </label>
            <div className="eval-grid">
              <label>Responsable<input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Nombre o area" /></label>
              <label>Fecha limite<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
            </div>
            <label>
              Estado
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">Pendiente</option>
                <option value="in_progress">En curso</option>
                <option value="resolved">Resuelta</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState({ full_name: "", email: "", role: "evaluator", password: "" });
  const [error, setError] = useState("");
  const load = () => api.get("/users").then((response) => setUsers(response.data));
  useEffect(() => { load(); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/users", form);
      setForm({ full_name: "", email: "", role: "evaluator", password: "" });
      load();
      notify("Usuario creado correctamente.");
    } catch (err) {
      setError((err as any)?.response?.data?.detail ?? "No se pudo crear el usuario.");
      notify("No se pudo crear el usuario.", "error");
    }
  }
  async function toggleActive(item: ManagedUser) {
    try {
      await api.patch(`/users/${item.id}`, { is_active: !item.is_active });
      load();
    } catch (err) {
      notify((err as any)?.response?.data?.detail ?? "No se pudo actualizar el usuario.", "error");
    }
  }
  return (
    <section>
      <div className="page-title"><h2>Usuarios</h2></div>
      <Hint>Gestiona los accesos por rol: administrador (control total), gestor (registra y evalua) y auditor (solo lectura). La contrasena debe tener minimo 12 caracteres con mayusculas, minusculas y numeros.</Hint>
      <form className="inline-form" onSubmit={create}>
        <input placeholder="Nombre completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <input placeholder="Correo" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="admin">Administrador</option>
          <option value="evaluator">Gestor</option>
          <option value="viewer">Auditor</option>
        </select>
        <input type="password" placeholder="Contrasena" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button>Crear usuario</button>
      </form>
      {error && <p className="error">{error}</p>}
      <DataTable
        headers={["Nombre", "Correo", "Rol", "Estado", "MFA"]}
        rows={users.map((user) => [user.full_name, user.email, user.role === "admin" ? "Administrador" : user.role === "evaluator" ? "Gestor" : "Auditor", user.is_active ? "Activo" : "Inactivo", user.mfa_enabled ? "Activo" : "—"])}
        empty="Sin usuarios."
        actions={(index) => {
          const item = users[index];
          return (
            <div className="row-actions">
              <button className="icon-btn" title={item.is_active ? "Desactivar" : "Activar"} onClick={() => toggleActive(item)}><Lock size={16} /></button>
            </div>
          );
        }}
      />
    </section>
  );
}

const providerPresets = [
  { id: "nvidia", label: "NVIDIA (deepseek)", model: "deepseek-ai/deepseek-v4-flash-0731", base_url: "https://integrate.api.nvidia.com/v1" },
  { id: "openai", label: "OpenAI (GPT)", model: "gpt-4o", base_url: "https://api.openai.com/v1" },
  { id: "gemini", label: "Google Gemini", model: "gemini-2.0-flash", base_url: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "ollama", label: "Ollama (local)", model: "llama3.1", base_url: "http://host.docker.internal:11434/v1" }
];

function SettingsPage() {
  const [ai, setAi] = useState<Record<string, any>>({});
  const [notif, setNotif] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState("");
  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      (data as { key: string; value: Record<string, any> }[]).forEach((item) => {
        if (item.key === "ai") setAi(item.value);
        if (item.key === "notifications") setNotif(item.value);
      });
    }).catch(() => {});
  }, []);
  async function saveAi(event: React.FormEvent) {
    event.preventDefault();
    setSaving("ai");
    try {
      await api.put("/settings/ai", { value: ai });
      aiBus.dispatchEvent(new Event("changed"));
      notify(`Configuracion de IA guardada. Proveedor activo: ${providerLabels[detectProvider(ai.base_url ?? "")] ?? "sin definir"}.`);
    } catch {
      notify("No se pudo guardar la configuracion.", "error");
    } finally {
      setSaving("");
    }
  }
  async function saveNotif(event: React.FormEvent) {
    event.preventDefault();
    setSaving("notif");
    try {
      await api.put("/settings/notifications", { value: notif });
      notify("Configuracion de notificaciones guardada.");
    } catch {
      notify("No se pudo guardar la configuracion.", "error");
    } finally {
      setSaving("");
    }
  }
  function applyPreset(id: string) {
    const preset = providerPresets.find((item) => item.id === id);
    if (!preset) return;
    setAi({ ...ai, model: preset.model, base_url: preset.base_url });
  }
  return (
    <section>
      <div className="page-title"><h2>Configuracion</h2></div>
      <Hint>Elige el proveedor de IA (incluye opcion local con Ollama para instituciones que no pueden enviar datos a la nube) y los canales de notificacion de alertas. Las claves de API se configuran en el archivo .env del servidor, no aqui.</Hint>
      <form className="panel form-stack" onSubmit={saveAi}>
        <h3><Sparkles size={16} /> Proveedor de IA</h3>
        <p className="hint">
          Proveedor activo: <strong>{providerLabels[detectProvider(ai.base_url ?? "")] ?? "sin definir"}</strong>
          {ai.model ? <> · <strong>{ai.model}</strong></> : null}
        </p>
        <label>
          Preset de proveedor
          <select onChange={(e) => applyPreset(e.target.value)} value="">
            <option value="">Seleccione un preset...</option>
            {providerPresets.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <label>
          Modelo
          <input value={ai.model ?? ""} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
        </label>
        <label>
          URL base
          <input value={ai.base_url ?? ""} onChange={(e) => setAi({ ...ai, base_url: e.target.value })} />
        </label>
        <p className="hint">
          Las claves de API se leen del archivo <code>.env</code> (una por proveedor: <code>NVIDIA_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code>). Aqui solo se configuran modelo y URL base.
        </p>
        <div className="eval-grid">
          <label>
            Razonamiento
            <select value={ai.reasoning_enabled ? "true" : "false"} onChange={(e) => setAi({ ...ai, reasoning_enabled: e.target.value === "true" })}>
              <option value="false">Desactivado (mas rapido)</option>
              <option value="true">Activado</option>
            </select>
          </label>
          <label>
            Max tokens
            <input type="number" min="256" max="8192" value={ai.max_tokens ?? 2048} onChange={(e) => setAi({ ...ai, max_tokens: Number(e.target.value) })} />
          </label>
        </div>
        <button disabled={saving === "ai"}>{saving === "ai" ? "Guardando..." : "Guardar IA"}</button>
      </form>
      <form className="panel form-stack" onSubmit={saveNotif}>
        <h3><BellRing size={16} /> Notificaciones fuera de la app</h3>
        <Hint>Cuando se genere una alerta (riesgo alto o tarea vencida) se puede enviar por correo SMTP y/o webhook (Slack / Teams). Deja vacio lo que no uses.</Hint>
        <label>
          Webhook URL (Slack / Teams)
          <input value={notif.webhook_url ?? ""} onChange={(e) => setNotif({ ...notif, webhook_url: e.target.value })} />
        </label>
        <div className="eval-grid">
          <label>SMTP host<input value={notif.smtp_host ?? ""} onChange={(e) => setNotif({ ...notif, smtp_host: e.target.value })} /></label>
          <label>SMTP puerto<input type="number" value={notif.smtp_port ?? 587} onChange={(e) => setNotif({ ...notif, smtp_port: Number(e.target.value) })} /></label>
          <label>SMTP usuario<input value={notif.smtp_user ?? ""} onChange={(e) => setNotif({ ...notif, smtp_user: e.target.value })} /></label>
          <label>SMTP contrasena<input type="password" value={notif.smtp_password ?? ""} onChange={(e) => setNotif({ ...notif, smtp_password: e.target.value })} /></label>
        </div>
        <button disabled={saving === "notif"}>{saving === "notif" ? "Guardando..." : "Guardar notificaciones"}</button>
      </form>
    </section>
  );
}

function AccountModal({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/auth/me").then((response) => setMe(response.data)).catch(() => {});
  }, []);
  async function setupMfa() {
    try {
      const { data } = await api.post("/auth/mfa/setup");
      setSecret(data.secret);
      setUri(data.otpauth_uri);
      setMsg("Escanea el codigo QR con tu app (Google Authenticator, Aegis) o agrega el secreto manualmente, luego ingresa el codigo.");
    } catch {
      setMsg("No se pudo iniciar la configuracion.");
    }
  }
  async function enableMfa() {
    try {
      await api.post("/auth/mfa/enable", { code });
      setMe({ ...me!, mfa_enabled: true });
      setSecret("");
      setUri("");
      setCode("");
      setMsg("MFA activado. En el proximo inicio de sesion se pedira tu codigo.");
    } catch {
      setMsg("Codigo incorrecto.");
    }
  }
  async function disableMfa() {
    try {
      await api.post("/auth/mfa/disable", { code });
      setMe({ ...me!, mfa_enabled: false });
      setCode("");
      setMsg("MFA desactivado.");
    } catch {
      setMsg("Codigo incorrecto.");
    }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setMsg("");
    if (pw.next.length < 12 || !/[A-Z]/.test(pw.next) || !/[a-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) {
      setMsg("La nueva contrasena debe tener 12+ caracteres con mayuscula, minuscula y numero.");
      return;
    }
    if (pw.next !== pw.confirm) {
      setMsg("Las contrasenas no coinciden.");
      return;
    }
    try {
      await api.post("/auth/password", { current_password: pw.current, new_password: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      notify("Contrasena actualizada correctamente.");
      setMsg("Contrasena actualizada.");
    } catch {
      setMsg("La contrasena actual es incorrecta.");
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <h3>Mi cuenta</h3>
          <button type="button" className="icon-btn" title="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="hint">{me?.full_name} - {me?.email}</p>
        <div className="panel">
          <h4><KeyRound size={14} /> Autenticacion en dos pasos (TOTP)</h4>
          <p className="hint">Estado: <strong>{me?.mfa_enabled ? "Activado" : "Desactivado"}</strong></p>
          {!me?.mfa_enabled && !secret && <button onClick={setupMfa}>Configurar MFA</button>}
          {secret && (
            <div className="mfa-secret">
              <p className="hint">{msg}</p>
              <code>{secret}</code>
              <p className="hint">App URL: <small>{uri}</small></p>
              <div className="inline-form">
                <input placeholder="Codigo de 6 digitos" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
                <button onClick={enableMfa}>Activar</button>
              </div>
            </div>
          )}
          {me?.mfa_enabled && (
            <div className="inline-form">
              <input placeholder="Codigo de 6 digitos" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
              <button onClick={disableMfa}>Desactivar MFA</button>
            </div>
          )}
        </div>
        <form className="panel form-stack" onSubmit={changePassword}>
          <h4><Lock size={14} /> Cambiar contrasena</h4>
          <label>Contrasena actual<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label>Nueva contrasena<input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <label>Confirmar nueva<input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          <button type="submit">Actualizar contrasena</button>
        </form>
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  );
}

function DataTable({ headers, rows, empty, actions }: { headers: string[]; rows: string[][]; empty?: string; actions?: (index: number) => React.ReactNode }) {
  return (
    <div className="table-wrap">
      {rows.length ? (
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}{actions && <th>Acciones</th>}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell) => <td key={cell}>{cell}</td>)}{actions && <td>{actions(index)}</td>}</tr>)}</tbody>
        </table>
      ) : (
        <p className="hint">{empty ?? "Sin registros por ahora."}</p>
      )}
    </div>
  );
}

type ToastMsg = { id: number; text: string; kind: "ok" | "error" | "alert" };
const toastBus = new EventTarget();
const alertBus = new EventTarget();
const planBus = new EventTarget();
const aiBus = new EventTarget();
let toastCounter = 0;
function notify(text: string, kind: "ok" | "error" | "alert" = "ok") {
  toastBus.dispatchEvent(new CustomEvent("toast", { detail: { id: ++toastCounter, text, kind } }));
}
function triggerAlertCheck() {
  alertBus.dispatchEvent(new Event("check"));
}
function openPlan(detail: { reportId: number; recommendation: string }) {
  planBus.dispatchEvent(new CustomEvent("plan", { detail }));
}

function Toaster() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastMsg>).detail;
      setToasts((list) => [...list, detail]);
      setTimeout(() => setToasts((list) => list.filter((item) => item.id !== detail.id)), 4500);
    };
    toastBus.addEventListener("toast", handler);
    return () => toastBus.removeEventListener("toast", handler);
  }, []);
  return (
    <div className="toast-container">
      {toasts.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>
          {item.kind === "alert" ? <Bell size={16} /> : item.kind === "ok" ? <Check size={16} /> : <X size={16} />}
          {item.text}
        </div>
      ))}
    </div>
  );
}

function Header({ page, user, ai, dark, onToggleDark, onLogout, onAccount }: { page: Page; user: Me | null; ai: AiStatus | null; dark: boolean; onToggleDark: () => void; onLogout: () => void; onAccount: () => void }) {
  const current = [...baseNav, ...adminNav].find((item) => item.id === page);
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="crumb">GuardIA</span>
        <strong>{current?.label}</strong>
      </div>
      <div className="topbar-actions">
        <button className="theme-toggle" onClick={onToggleDark} title={dark ? "Modo claro" : "Modo oscuro"}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <span className={`ai-badge ${ai?.configured ? "ok" : "demo"}`} title={ai?.message}>
          <Bot size={14} /> {ai ? (ai.configured ? `IA conectada${ai.provider ? ` · ${providerLabels[ai.provider] ?? ai.provider}` : ""}` : "IA demo") : "IA ..."}
        </span>
        <button className="user-chip" onClick={onAccount} title="Mi cuenta (MFA y contrasena)">
          <ShieldCheck size={14} />{user?.full_name ?? user?.email ?? "Usuario"}
        </button>
        <button className="logout-button" onClick={onLogout}><LogOut size={16} />Cerrar sesion</button>
      </div>
    </header>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("access_token"));
  const [page, setPage] = useState<Page>("dashboard");
  const [user, setUser] = useState<Me | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("dark") === "1");
  const [accountOpen, setAccountOpen] = useState(false);
  const seenAlertsRef = useRef<number[]>(JSON.parse(localStorage.getItem("seen_alerts") ?? "[]"));
  const alertsBaselineRef = useRef(false);

  const checkAlerts = useCallback(() => {
    if (!token) return;
    api.get("/alerts").then(({ data }) => {
      const alerts = data as Alert[];
      const ids = alerts.map((alert) => alert.id);
      if (!alertsBaselineRef.current) {
        alertsBaselineRef.current = true;
        seenAlertsRef.current = ids;
        localStorage.setItem("seen_alerts", JSON.stringify(ids));
        return;
      }
      const newAlerts = alerts.filter((alert) => !seenAlertsRef.current.includes(alert.id));
      if (newAlerts.length) {
        newAlerts.forEach((alert) => notify(`Nueva alerta: ${alert.title}`, "alert"));
        seenAlertsRef.current = ids;
        localStorage.setItem("seen_alerts", JSON.stringify(ids));
      }
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    checkAlerts();
    const interval = setInterval(checkAlerts, 20000);
    const handler = () => checkAlerts();
    alertBus.addEventListener("check", handler);
    return () => { clearInterval(interval); alertBus.removeEventListener("check", handler); };
  }, [token, checkAlerts]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("dark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    if (!token) return;
    api.get("/auth/me").then((response) => setUser(response.data)).catch(() => {});
    api.get("/reports/ai-status").then((response) => setAi(response.data)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const handler = () => api.get("/reports/ai-status").then((response) => setAi(response.data)).catch(() => {});
    aiBus.addEventListener("changed", handler);
    return () => aiBus.removeEventListener("changed", handler);
  }, [token]);

  useEffect(() => {
    const handleLogout = () => {
      localStorage.removeItem("seen_alerts");
      seenAlertsRef.current = [];
      alertsBaselineRef.current = false;
      setToken(null);
      setUser(null);
      setAi(null);
      setPage("dashboard");
    };
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("seen_alerts");
    delete api.defaults.headers.common.Authorization;
    seenAlertsRef.current = [];
    alertsBaselineRef.current = false;
    setToken(null);
    setUser(null);
    setAi(null);
    setPage("dashboard");
  }

  const canWrite = user?.role === "admin" || user?.role === "evaluator";
  const navItems = useMemo(() => user?.role === "admin" ? [...baseNav, ...adminNav] : [...baseNav], [user]);
  const content = useMemo(
    () => ({
      dashboard: <Dashboard goTo={setPage} />,
      assets: <Assets canWrite={canWrite} />,
      evaluations: <Evaluations canWrite={canWrite} />,
      matrix: <RiskMatrix />,
      reports: <Reports goTo={setPage} canWrite={canWrite} />,
      mitigations: <Mitigations canWrite={canWrite} />,
      alerts: <Alerts />,
      users: <UsersPage />,
      settings: <SettingsPage />
    } as Record<Page, React.ReactNode>),
    [page, canWrite]
  );

  if (!token) return (
    <>
      <Login onLogin={() => setToken(localStorage.getItem("access_token"))} />
      <Toaster />
    </>
  );
  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><img src="/ia.jpeg" className="logo" alt="GuardIA" /><span>GuardIA</span></div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)} key={item.id}><Icon size={18} />{item.label}</button>;
        })}
      </aside>
      <main className="main-area">
        <Header page={page} user={user} ai={ai} dark={dark} onToggleDark={() => setDark((value) => !value)} onLogout={logout} onAccount={() => setAccountOpen(true)} />
        <div className="content">{content[page]}</div>
      </main>
      <Toaster />
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
