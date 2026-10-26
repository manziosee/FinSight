terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.60" }
  }
}

# One Secrets Manager secret per Kubernetes consumer, named and keyed exactly as the Helm
# chart's ExternalSecrets read them: finsight/<env>/<name>, JSON {ENV_VAR: value}.

variable "env" { type = string }
variable "secrets" {
  description = "name => {ENV_VAR = value}, fully managed by Terraform."
  type        = map(map(string))
  sensitive   = true
}
variable "operator_managed" {
  description = <<-EOT
    name => {ENV_VAR = placeholder}. Created once by Terraform, then owned by operators
    (e.g. a third-party API key set with `aws secretsmanager put-secret-value`): later
    applies never overwrite the value.
  EOT
  type        = map(map(string))
  default     = {}
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_secretsmanager_secret" "managed" {
  for_each = nonsensitive(toset(keys(var.secrets)))
  name     = "finsight/${var.env}/${each.value}"
  tags     = var.tags
}

resource "aws_secretsmanager_secret_version" "managed" {
  for_each      = aws_secretsmanager_secret.managed
  secret_id     = each.value.id
  secret_string = jsonencode(var.secrets[each.key])
}

resource "aws_secretsmanager_secret" "operator" {
  for_each = toset(keys(var.operator_managed))
  name     = "finsight/${var.env}/${each.value}"
  tags     = var.tags
}

resource "aws_secretsmanager_secret_version" "operator" {
  for_each      = aws_secretsmanager_secret.operator
  secret_id     = each.value.id
  secret_string = jsonencode(var.operator_managed[each.key])
  lifecycle {
    ignore_changes = [secret_string]
  }
}

output "names" {
  value = concat(
    [for s in aws_secretsmanager_secret.managed : s.name],
    [for s in aws_secretsmanager_secret.operator : s.name],
  )
}
