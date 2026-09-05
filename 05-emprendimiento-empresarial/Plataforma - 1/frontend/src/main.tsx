import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { ArrowRight, Bell, Bot, Check, ClipboardCheck, Eye, FileText, LayoutDashboard, LogOut, MonitorCog, Moon, Pencil, Printer, ShieldCheck, Sparkles, Sun, X } from "lucide-react";
import "./styles.css";
import { api, setAuthToken } from "./services/api";

type Page = "dashboard" | "assets" | "evaluations" | "reports" | "alerts";
type Asset = { id: number; name: string; asset_type: string; owner: string; criticality: number; location?: string };
type Evaluation = { id: number; asset_id: number; score: number; level: string; answers: Record<string, number>; likelihood: number; impact: number };
type Alert = { id: number; title: string; message: string; severity: string; is_read: boolean };
type Report = { id: number; title: string; executive_summary: string; technical_details: string; recommendations: string[]; status: string; created_at: string; evaluation_id: number | null };
type Summary = { total_assets: number; total_evaluations: number; total_reports: number; average_score: number; risk_distribution: Record<string, number>; recent_alerts: Alert[] };
type AiStatus = { configured: boolean; model: string; mode: "ia" | "demo"; message: string };
type Me = { full_name: string; email: string; role: string };

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "assets", label: "Activos", icon: MonitorCog },
  { id: "evaluations", label: "Evaluaciones", icon: ClipboardCheck },
  { id: "reports", label: "Reportes", icon: FileText },
  { id: "alerts", label: "Alertas", icon: Bell }
] as const;

const riskLevelLabels: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico"
};

function riskLevelLabel(level: string) {
  return riskLevelLabels[level] ?? level;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@demo.gt");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    try {
      const { data } = await api.post("/auth/token", form, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      setAuthToken(data.access_token);
      onLogin();
    } catch {
      setError("No se pudo iniciar sesion. Verifique que el backend este corriendo y que exista un usuario (seed o API).");
    }
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

function Dashboard({ goTo }: { goTo: (page: Page) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    api.get("/dashboard").then((response) => setSummary(response.data));
  }, []);
  const distribution = summary?.risk_distribution ?? {};
  const steps = [
    { page: "assets" as Page, icon: MonitorCog, label: "Registra tus activos", desc: "Carga el hardware, software, datos y personal que debes proteger." },
    { page: "evaluations" as Page, icon: ClipboardCheck, label: "Evalua el riesgo", desc: "Completa la evaluacion NIST CSF 2.0 de cada activo." },
    { page: "reports" as Page, icon: FileText, label: "Genera tu reporte IA", desc: "La IA analiza tus resultados y propone recomendaciones." }
  ];
  const done = [
    (summary?.total_assets ?? 0) > 0,
    (summary?.total_evaluations ?? 0) > 0,
    (summary?.total_reports ?? 0) > 0
  ];
  const completed = done.filter(Boolean).length;
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
        <Metric label="Alertas recientes" value={summary?.recent_alerts?.length ?? 0} />
      </div>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ name: "", asset_type: "hardware", owner: "", criticality: 3, location: "" });
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
  return (
    <section>
      <div className="page-title"><h2>Registro de Activos</h2></div>
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
      <DataTable rows={assets.map((asset) => [asset.name, asset.asset_type, asset.owner, String(asset.criticality)])} headers={["Activo", "Tipo", "Responsable", "Criticidad"]} empty="Aun no hay activos. Registra el primero con el formulario de arriba." />
    </section>
  );
}

function Evaluations() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
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
  const load = () => Promise.all([api.get("/assets"), api.get("/evaluations")]).then(([a, e]) => { setAssets(a.data); setEvaluations(e.data); });
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
      <h3>Evaluaciones realizadas</h3>
      <DataTable
        headers={["ID", "Activo", "Puntaje", "Nivel"]}
        rows={evaluations.map((item) => [String(item.id), assetName(item.asset_id), String(item.score), riskLevelLabel(item.level)])}
        empty="Aun no hay evaluaciones. Completa el formulario de arriba para calcular tu primer riesgo."
        actions={(index) => {
          const item = evaluations[index];
          return (
            <div className="row-actions">
              <button className="icon-btn" title="Ver puntos" onClick={() => openView(item)}><Eye size={16} /></button>
              <button className="icon-btn" title="Editar" onClick={() => openEdit(item)}><Pencil size={16} /></button>
            </div>
          );
        }}
      />
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <h3>Puntos de la evaluacion</h3>
              <button type="button" className="icon-btn" title="Cerrar" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <p className="hint">Activo: <strong>{assetName(viewing.asset_id)}</strong> - Puntaje {viewing.score}/100 - Nivel <strong>{riskLevelLabel(viewing.level)}</strong></p>
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

function Reports() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [evaluationId, setEvaluationId] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [printId, setPrintId] = useState<number | null>(null);
  const assetName = (id: number) => assets.find((asset) => asset.id === id)?.name ?? `Evaluacion ${id}`;
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
  return (
    <section>
      <div className="page-title"><h2>Reportes IA</h2><button disabled={isGenerating || !evaluations.length} onClick={create}>{isGenerating ? "Generando..." : "Generar reporte"}</button></div>
      <Hint>Paso 3: selecciona una evaluacion y genera el reporte. La IA redacta el resumen ejecutivo y las recomendaciones por ti.</Hint>
      <div className="ai-panel">
        <h3><Sparkles size={18} /> Que hace la IA</h3>
        <p>Analiza la evaluacion NIST CSF 2.0 del activo (probabilidad, impacto y funciones), contrasta las brechas con el marco MITRE ATT&CK y redacta un resumen ejecutivo, detalles tecnicos y recomendaciones accionables para tu institucion.</p>
      </div>
      <label className="eval-select">
        Evaluacion a analizar
        <select value={evaluationId} onChange={(e) => setEvaluationId(Number(e.target.value))}>
          <option value={0}>Seleccione una evaluacion</option>
          {evaluations.map((item) => <option value={item.id} key={item.id}>{assetName(item.asset_id)} - {riskLevelLabel(item.level)}</option>)}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="report-list">
        {reports.map((report) => (
          <article className="panel" key={report.id}>
            <div className="report-head">
              <h3>{report.title}</h3>
              <button className="print-btn" onClick={() => { setPrintId(report.id); setTimeout(() => window.print(), 60); }} title="Imprimir o guardar como PDF"><Printer size={16} />Imprimir PDF</button>
            </div>
            <p>{report.executive_summary}</p>
            <h4>Recomendaciones</h4>
            <ul>{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
        {!reports.length && <p className="hint">Aun no hay reportes generados. Completa el formulario de arriba para crear el primero.</p>}
      </div>
      {reports.length > 0 && (() => {
        const printReport = reports.find((report) => report.id === printId) ?? reports[0];
        const evaluation = evaluations.find((item) => item.id === printReport.evaluation_id);
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
      <Hint>Revisa las alertas que el sistema genera ante evaluaciones con riesgo alto y da seguimiento a las que esten pendientes.</Hint>
      <DataTable rows={alerts.map((alert) => [alert.title, riskLevelLabel(alert.severity), alert.is_read ? "Leida" : "Nueva", alert.message])} headers={["Titulo", "Severidad", "Estado", "Mensaje"]} empty="Sin alertas por ahora." />
    </section>
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
let toastCounter = 0;
function notify(text: string, kind: "ok" | "error" | "alert" = "ok") {
  toastBus.dispatchEvent(new CustomEvent("toast", { detail: { id: ++toastCounter, text, kind } }));
}
function triggerAlertCheck() {
  alertBus.dispatchEvent(new Event("check"));
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

function Header({ page, user, ai, dark, onToggleDark, onLogout }: { page: Page; user: Me | null; ai: AiStatus | null; dark: boolean; onToggleDark: () => void; onLogout: () => void }) {
  const current = navItems.find((item) => item.id === page);
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
          <Bot size={14} /> {ai ? (ai.configured ? "IA conectada" : "IA demo") : "IA ..."}
        </span>
        <span className="user-chip"><ShieldCheck size={14} />{user?.full_name ?? user?.email ?? "Usuario"}</span>
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

  const content = useMemo(
    () => ({
      dashboard: <Dashboard goTo={setPage} />,
      assets: <Assets />,
      evaluations: <Evaluations />,
      reports: <Reports />,
      alerts: <Alerts />
    }[page]),
    [page]
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
        <Header page={page} user={user} ai={ai} dark={dark} onToggleDark={() => setDark((value) => !value)} onLogout={logout} />
        <div className="content">{content}</div>
      </main>
      <Toaster />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
