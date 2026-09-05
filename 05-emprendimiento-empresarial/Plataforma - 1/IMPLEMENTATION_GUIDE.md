# Guia de implementacion en 30 dias

## Semana 1: Preparacion y piloto

- Confirmar alcance del MVP con la institucion piloto.
- Definir responsable de seguridad, responsable tecnico y aprobador ejecutivo.
- Crear inventario inicial de activos criticos.
- Configurar entorno AWS: cuenta, IAM, VPC, subredes, Route 53, ACM y RDS PostgreSQL.
- Crear secretos en AWS Secrets Manager: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.

## Semana 2: Despliegue tecnico

- Construir imagenes Docker de backend y frontend.
- Publicar imagenes en ECR o GHCR.
- Crear cluster EKS o usar ECS Fargate si el equipo no opera Kubernetes.
- Aplicar manifiestos de `infra/k8s` ajustando dominio, imagenes y secretos.
- Habilitar TLS 1.3 en ALB/CloudFront.
- Configurar backups RDS y logs CloudWatch.

## Semana 3: Seguridad, cumplimiento y datos

- Activar OAuth2/PKCE con proveedor institucional si existe.
- Activar MFA para administradores y evaluadores.
- Revisar roles: admin, evaluator, viewer.
- Validar bitacora de auditoria y retencion minima de 365 dias.
- Revisar cumplimiento local: minimizacion de datos, consentimiento, confidencialidad, acceso restringido y trazabilidad, alineado a Decreto 57-2011 y buenas practicas de proteccion de informacion publica.

## Semana 4: Validacion y salida a produccion

- Ejecutar pruebas unitarias, integracion y carga con 100 usuarios concurrentes.
- Revisar reportes IA manualmente antes de emitirlos.
- Capacitar administradores y evaluadores.
- Definir mesa de soporte, proceso de escalamiento y ventanas de mantenimiento.
- Ejecutar simulacro de restauracion de backup.
- Autorizar go-live con acta de aceptacion.

## Criterios de listo

- API disponible en `/health` y `/docs`.
- Dashboard muestra activos y evaluaciones reales.
- Alertas se crean para riesgos altos o criticos.
- Reportes pueden generarse, editarse y aprobarse.
- Backups y monitoreo activos.
- Accesos administrativos protegidos con MFA.
