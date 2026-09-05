# Plan de pruebas

## Unitarias

- Scoring de riesgo: niveles low, medium, high, critical.
- Clasificacion MITRE ATT&CK para controles debiles.
- Validacion Pydantic de activos, evaluaciones y usuarios.

## Integracion

- Registro de organizacion y usuario.
- Login y obtencion de JWT.
- CRUD de activos.
- Creacion de evaluacion y alerta automatica.
- Generacion de reporte IA con fallback sin `OPENAI_API_KEY`.

## Aceptacion

- Un evaluador registra un activo critico.
- Completa cuestionario NIST CSF 2.0.
- El dashboard actualiza metricas.
- Se genera alerta por riesgo alto o critico.
- Se genera reporte editable y revisable.

## Carga

Archivo: `infra/load-test/k6-smoke.js`.

```powershell
k6 run -e BASE_URL=http://localhost:8000 infra/load-test/k6-smoke.js
```

Criterios iniciales:

- 100 usuarios concurrentes por 5 minutos.
- p95 menor a 800 ms para `/health`.
- Menos de 2% de errores.
