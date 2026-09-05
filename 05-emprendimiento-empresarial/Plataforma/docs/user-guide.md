# Manual de usuario - GuardIA

Sistema de Gestion Preventiva de Riesgos Ciberneticos basado en NIST CSF 2.0.

**Acceso:** `https://localhost:8443`

**Cuenta de demostracion:** `admin@demo.gt` / `ChangeMe123!`

> GuardIA registra activos de TI, mide su madurez de seguridad con NIST CSF 2.0,
> ubica el riesgo en una matriz de probabilidad vs. impacto y genera reportes
> automaticos con IA, convirtiendo cada recomendacion en tareas de mitigacion
> con responsable y fecha limite.

---

## 1. Roles y permisos

El sistema define tres roles. Esta matriz fue verificada contra la API
(HTTP 200 = permitido, 422/404 = permitido pero con datos invalidos o inexistentes,
403 = acceso denegado).

| Capacidad | Administrador | Gestor | Auditor |
|---|---|---|---|
| Ver dashboard, tendencias y alertas | Si | Si | Si |
| Ver activos, evaluaciones, reportes, mitigaciones | Si | Si | Si |
| Registrar, editar y eliminar activos | Si | Si | No |
| Importar / exportar activos (CSV) | Si | Si | No |
| Crear y editar evaluaciones | Si | Si | No |
| Generar y editar reportes IA | Si | Si | No |
| Crear / editar / eliminar tareas de mitigacion | Si | Si | No |
| Marcar alertas como leidas | Si | Si | Si |
| Gestionar usuarios (crear, editar, desactivar) | Si | No | No |
| Configurar proveedor de IA y notificaciones | Si | No | No |
| Activar MFA y cambiar su contrasena | Si | Si | Si |

Los permisos se aplican tanto en la interfaz (los botones de escritura se
ocultan) como en la API (el backend responde `403 Forbidden` a operaciones no
autorizadas).

---

## 2. Inicio de sesion

1. Ingrese correo y contrasena.
2. Si el usuario tiene MFA activo, se pedira el codigo de 6 digitos de su app
   de autenticacion (Google Authenticator, Aegis, etc.).

---

## 3. Dashboard ejecutivo

Resumen del estado de la institucion:

- **Metricas:** activos, evaluaciones, reportes IA y tareas de mitigacion.
- **Banner de alerta:** tareas vencidas sin resolver.
- **Reevaluaciones pendientes:** activos que necesitan nueva evaluacion.
- **Proceso recomendado:** pasos para completar la gestion (con estado de avance).
- **Evolucion del riesgo promedio** en el tiempo.
- **Distribucion de riesgo** por nivel (bajo, medio, alto, critico).

---

## 4. Registro de activos

Un activo es cualquier recurso a proteger: hardware, software, datos o personal.

1. En **Activos**, complete: nombre, tipo, responsable, criticidad (1 = baja, 5 = critica) y ubicacion.
2. Tambien puede **importar un CSV** (descargue la plantilla con el boton "Plantilla").
3. **Exportar CSV** genera el respaldo en Excel-compatible.

---

## 5. Evaluacion NIST CSF 2.0

1. En **Evaluaciones**, seleccione el activo.
2. Califique del 1 al 5 cada funcion NIST (1 = deficiente, 5 = excelente):
   **Identificar, Proteger, Detectar, Responder, Recuperar**.
3. Indique **Probabilidad** e **Impacto** de un incidente (1 a 5).
4. El sistema calcula el puntaje (0-100), el nivel de riesgo y el equivalente CVSS v3.
5. Use el ojo de cada fila para ver el detalle y su matriz.

---

## 6. Matriz de riesgo

Seccion dedicada que grafica **probabilidad vs. impacto** en un mapa de calor 5x5:

- Cada **punto** es un activo evaluado. Al pasar el mouse, un tooltip muestra el
  nombre, el puntaje y el nivel.
- La leyenda cuenta cuantos activos hay en cada nivel.
- La tabla inferior lista el detalle por activo.

---

## 7. Reportes IA

1. En **Reportes**, seleccione una evaluacion y pulse **Generar reporte**.
2. La IA redacta: resumen ejecutivo, detalles tecnicos y 5 recomendaciones accionables.
3. **Evidencia que sustenta el reporte:** muestra las funciones NIST debiles y las
   tacticas MITRE ATT&CK en espanol.
4. **Firma de integridad:** el boton de escudo verifica que el contenido no fue alterado (SHA-256).
5. **Exportar:** a Word (.doc), a Excel (CSV) o imprimir/PDF.
6. Cada reporte muestra **con que IA se genero**: "Generado con NVIDIA · modelo"
   o "Reporte de ejemplo (modo demostracion)" si no hay proveedor configurado.

> Si un reporte queda en modo demostracion, revise la seccion 11 para configurar
> la clave del proveedor en el archivo `.env` del servidor.

---

## 8. Plan de mitigacion

Convierte cada recomendacion en una tarea:

1. Desde el reporte pulse el boton **Plan** de una recomendacion (o use "Nueva tarea").
2. En el formulario: elija el reporte, haga clic en una **recomendacion disponible**
   para copiarla, asigne **responsable**, **fecha limite** y **estado**.
3. Controles por tarea: iniciar, marcar resuelta, reabrir, editar, eliminar.
4. Filtros: todas, pendientes, en curso, resueltas, vencidas.
5. Una tarea vencida sin resolver genera **alerta**.

---

## 9. Alertas

El sistema genera alertas por evaluaciones de riesgo alto o critico y por tareas
vencidas. Consulte las nuevas y marquelas como leidas.

---

## 10. Usuarios (solo administrador)

1. Cree usuarios asignando **rol**, nombre, correo y contrasena (minimo 12
   caracteres con mayuscula, minuscula y numero).
2. Puede **desactivar** cuentas con el candado (el usuario no podra iniciar sesion).

---

## 11. Configuracion de IA (solo administrador)

En **Configuracion** solo se guarda **modelo** y **URL base** del proveedor.
**Las claves API NO se guardan en la interfaz**: se leen del archivo `.env` del servidor.

| Proveedor | Variable en `.env` | Donde obtener la clave |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| NVIDIA | `NVIDIA_API_KEY` | https://build.nvidia.com |
| Google Gemini | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| Ollama (local, sin internet) | no requiere clave | - |

Pasos para cambiar de proveedor:

1. Edite `.env` en el servidor y coloque la clave correspondiente.
2. Reconstruya el backend: `docker compose up -d backend`.
3. En **Configuracion** elija el preset (NVIDIA, OpenAI, Gemini u Ollama) o escriba modelo y URL base.
4. Pulse **Guardar IA**. El panel muestra el **proveedor activo** y el badge del
   encabezado se actualiza al instante.

Tambien puede configurar **notificaciones por correo (SMTP)** o **webhook** (Slack/Teams).

---

## 12. Mi cuenta

Desde el boton con su nombre:

- **Autenticacion en dos pasos (TOTP):** configure MFA escaneando el QR o agregando el
  secreto manualmente; desde ese momento se pedira el codigo en cada inicio de sesion.
- **Cambiar contrasena:** requiere la contrasena actual y minimo 12 caracteres seguros.

---

## 13. Seguridad verificada

Controles confirmados en la prueba de roles:

- La API valida permisos por rol en cada operacion (principio de minimo privilegio).
- Los roles de solo lectura (Auditor) no pueden modificar, crear ni eliminar datos.
- Solo el administrador gestiona usuarios y configuracion del sistema.
- Los reportes tienen **firma de integridad** verificable.
- Las contrasenas se almacenan con hash (bcrypt) y se exigen contrasenas fuertes.
- MFA opcional pero recomendado, sobre todo para administradores.
- Las claves de API de IA viven en el `.env` del servidor, nunca en la base de datos ni en la interfaz.

**Usuarios de demostracion creados para pruebas:**

| Rol | Correo | Contrasena |
|---|---|---|
| Administrador | administrador@demo.gt | AdminGT2024#! |
| Gestor | gestor@demo.gt | GestorGT2024#! |
| Auditor | auditor@demo.gt | AuditorGT2024#! |

> Cambie estas contrasenas antes de un despliegue en produccion.
