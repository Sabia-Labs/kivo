{{/*
Expand the name of the chart.
*/}}
{{- define "kivo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kivo.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kivo.labels" -}}
helm.sh/chart: {{ include "kivo.name" . }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels — API
*/}}
{{- define "kivo.kivoApi.selectorLabels" -}}
app.kubernetes.io/name: kivo-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels — Admin API
*/}}
{{- define "kivo.adminApi.selectorLabels" -}}
app.kubernetes.io/name: kivo-admin-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels — App Web
*/}}
{{- define "kivo.kivoWeb.selectorLabels" -}}
app.kubernetes.io/name: kivo-web
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels — Admin Web
*/}}
{{- define "kivo.adminWeb.selectorLabels" -}}
app.kubernetes.io/name: kivo-admin-web
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels — PostgreSQL
*/}}
{{- define "kivo.postgresql.selectorLabels" -}}
app.kubernetes.io/name: kivo-postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Return the PostgreSQL service hostname (always in the app namespace)
*/}}
{{- define "kivo.postgresql.host" -}}
{{- printf "kivo-postgresql.%s.svc.cluster.local" .Values.namespace }}
{{- end }}

{{/*
Return the PostgreSQL connection string (only for embedded mode)
*/}}
{{- define "kivo.postgresql.connectionString" -}}
{{- printf "postgresql://%s:%s@%s:%d/%s" .Values.postgresql.username .Values.postgresql.password (include "kivo.postgresql.host" .) (int .Values.postgresql.port) .Values.postgresql.database }}
{{- end }}

{{/*
Return the PostgreSQL Admin connection string (only for embedded mode)
*/}}
{{- define "kivo.postgresql.adminConnectionString" -}}
{{- printf "postgresql://%s:%s@%s:%d/kivo_admin" .Values.postgresql.username .Values.postgresql.password (include "kivo.postgresql.host" .) (int .Values.postgresql.port) }}
{{- end }}
