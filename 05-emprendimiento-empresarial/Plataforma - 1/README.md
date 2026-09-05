# Plataforma Inteligente para la Gestion Preventiva de Riesgos Ciberneticos

Sistema SaaS MVP para instituciones publicas, autonomas y privadas de Guatemala. Incluye registro de activos, evaluacion de riesgos basada en NIST CSF 2.0, dashboard ejecutivo, alertas, reportes con IA, auditoria, Docker, Kubernetes y documentacion de despliegue.

## Estructura

- `backend/`: API FastAPI, SQLAlchemy, JWT, RBAC, auditoria, OpenAI.
- `frontend/`: React + Vite con paginas Login, Dashboard, Activos, Evaluaciones, Reportes y Alertas.
- `infra/`: Docker/Kubernetes, estrategia AWS y prueba de carga k6.
- `docs/`: arquitectura, modelo de datos, guias de usuario/desarrollador, plan de pruebas.
- `presentation/`: guion ejecutivo de 12 diapositivas.

## Ejecucion rapida con Docker

1. Instala Docker Desktop.
2. En esta carpeta ejecuta:

```powershell
docker compose up --build
```

3. Genera certificados HTTPS locales y confia la CA (Windows puede pedir confirmacion):

```powershell
.\scripts\setup-local-https.ps1 -Force -Trust
docker compose up --build -d
```

4. Abre el frontend:

```text
https://localhost:8443
```

Opcionalmente agrega al archivo `hosts` de Windows como administrador:

```text
127.0.0.1 riesgo-ia.gt.local
```

Luego abre:

```text
https://riesgo-ia.gt.local:8443
```

La API solo es accesible via HTTPS a traves de Nginx (backend y postgres no se exponen al host). Documentacion interactiva:

```text
https://riesgo-ia.gt.local:8443/docs
```

Los datos demo (organizacion, usuario y activos iniciales) se crean automaticamente la primera vez que inicia el backend. Si necesitas regenerarlos:

```powershell
docker compose exec backend python -m app.seed
```

Credenciales demo:

```text
admin@demo.gt
ChangeMe123!
```

## Ejecucion local sin Docker

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend, en otra terminal:

```powershell
cd frontend
npm install
npm run dev
```

Abre:

```text
http://localhost:5173
```

## Variables importantes

Copia `.env.example` a `.env` y ajusta los valores antes de levantar Docker:

```powershell
Copy-Item .env.example .env
```

- `POSTGRES_PASSWORD`: contrasena de PostgreSQL en Docker.
- `JWT_SECRET`: secreto fuerte de 64+ caracteres.
- `OPENAI_API_KEY`: activa reportes IA reales. Sin esta variable, el sistema usa un resumen determinista.
- `OPENAI_BASE_URL`: endpoint compatible con OpenAI. Para NVIDIA usa `https://integrate.api.nvidia.com/v1`.
- `OPENAI_MODEL`: modelo de IA, por defecto `gpt-4o`.
- `AI_REASONING_ENABLED`: activa parametros de razonamiento para modelos compatibles como DeepSeek en NVIDIA.
- `CORS_ORIGINS`: origenes permitidos del frontend.

## IA con NVIDIA NIM

En `.env` configura:

```env
OPENAI_API_KEY=nvapi-tu-key-aqui
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
OPENAI_MODEL=deepseek-ai/deepseek-v4-flash-0731
AI_MAX_TOKENS=2048
AI_REASONING_ENABLED=true
AI_REASONING_EFFORT=high
```

Luego reconstruye el backend:

```powershell
docker compose up --build -d backend
```
- `DATABASE_URL`: PostgreSQL en produccion. SQLite local por defecto (solo desarrollo sin Docker).

## Validacion

```powershell
cd backend
pytest
```

```powershell
cd frontend
npm run build
```

## Produccion

La guia de 30 dias esta en `IMPLEMENTATION_GUIDE.md`. Los manifiestos base estan en `infra/k8s` y la arquitectura AWS en `infra/aws-deployment.md`.
