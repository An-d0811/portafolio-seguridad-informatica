# Guia de desarrollador

## Backend

- Punto de entrada: `backend/app/main.py`.
- Modelos: `backend/app/models.py`.
- Schemas Pydantic: `backend/app/schemas.py`.
- Rutas: `backend/app/api`.
- Servicios: `backend/app/services`.

Para agregar un modulo:

1. Crear modelo SQLAlchemy.
2. Crear schemas Pydantic.
3. Crear router en `app/api`.
4. Registrar router en `app/api/routes.py`.
5. Agregar pruebas unitarias o de integracion.

## Frontend

- Punto de entrada: `frontend/src/main.tsx`.
- Cliente API: `frontend/src/services/api.ts`.
- Estilos: `frontend/src/styles.css`.

La autenticacion actual usa JWT contra FastAPI. Para OAuth2/OIDC con PKCE se recomienda integrar Auth0, Cognito o proveedor institucional compatible.

## API

FastAPI genera OpenAPI automaticamente:

```text
http://localhost:8000/docs
http://localhost:8000/openapi.json
```
