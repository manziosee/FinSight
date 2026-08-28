{{- define "finsight.labels" -}}
app.kubernetes.io/part-of: finsight
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "finsight.image" -}}
{{ .registry }}/finsight/{{ .name }}:{{ .tag }}
{{- end -}}
