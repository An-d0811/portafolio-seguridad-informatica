# Estrategia de despliegue en AWS

## Componentes

- **Route 53**: zona DNS institucional, por ejemplo `app.institucion.gob.gt`.
- **CloudFront + S3**: alternativa recomendada para servir el frontend estatico con baja latencia.
- **EKS**: despliegue de backend FastAPI con HPA y pods multi-AZ.
- **RDS PostgreSQL 16**: base de datos cifrada con KMS, backups automaticos y replicas de lectura si el plan lo requiere.
- **Secrets Manager**: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY` y secretos OAuth2.
- **CloudWatch**: logs, metricas, alarmas de CPU, memoria, errores 5xx y latencia.
- **AWS WAF**: proteccion frente a ataques comunes OWASP Top 10.

## Seguridad

- TLS 1.3 en ALB/CloudFront con certificados ACM.
- Cifrado en reposo con KMS para RDS, S3, EBS y backups.
- Subredes privadas para backend y RDS; solo ALB/CloudFront expuesto publicamente.
- IAM por minimo privilegio para CI/CD, EKS service accounts y acceso a Secrets Manager.
- Registros de auditoria enviados a CloudWatch Logs y retenidos al menos 365 dias.

## Respaldo y recuperacion

- RDS PITR con retencion minima de 7 dias en MVP y 35 dias en Enterprise.
- Snapshot diario copiado a otra region para instituciones criticas.
- Objetivo inicial: RPO 24h para plan Basico, 4h Profesional, 1h Enterprise.
- Objetivo inicial: RTO 8h Basico, 4h Profesional, 2h Enterprise.

## Monitoreo

- Alarmas: `HTTPCode_Target_5XX_Count`, `TargetResponseTime`, CPU > 75%, memoria > 80%, conexiones RDS > 80%.
- Dashboard CloudWatch por institucion y entorno.
- Recomendado: exportar eventos de auditoria a S3 con Object Lock para evidencia de cumplimiento.
