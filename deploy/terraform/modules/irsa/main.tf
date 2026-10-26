terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.60" }
  }
}

# IAM roles for Kubernetes service accounts (IRSA): pods get scoped, short-lived AWS
# credentials instead of static keys in Secrets.

variable "name" { type = string }
variable "env" { type = string }
variable "oidc_provider_arn" { type = string }
variable "namespace" {
  type    = string
  default = "finsight"
}
variable "raw_bucket_arn" { type = string }
variable "raw_bucket_kms_key_arn" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_iam_policy_document" "raw_data" {
  statement {
    sid       = "RawObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.raw_bucket_arn}/*"]
  }
  statement {
    sid       = "RawBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [var.raw_bucket_arn]
  }
  statement {
    sid       = "RawKms"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.raw_bucket_kms_key_arn]
  }
}

resource "aws_iam_policy" "raw_data" {
  name   = "${var.name}-raw-data"
  policy = data.aws_iam_policy_document.raw_data.json
  tags   = var.tags
}

# ingestion writes uploads, normalization reads them back.
module "raw_data" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  for_each  = toset(["ingestion-service", "normalization-service"])
  role_name = "${var.name}-${each.value}"
  role_policy_arns = {
    raw_data = aws_iam_policy.raw_data.arn
  }
  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["${var.namespace}:${each.value}"]
    }
  }
  tags = var.tags
}

# External Secrets Operator: read only this environment's FinSight secrets.
module "external_secrets" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name                             = "${var.name}-external-secrets"
  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = ["arn:aws:secretsmanager:*:*:secret:finsight/${var.env}/*"]
  external_secrets_ssm_parameter_arns   = []
  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["external-secrets:external-secrets"]
    }
  }
  tags = var.tags
}

# AWS Load Balancer Controller: provisions the ALB (with WAF) for the Ingress.
module "load_balancer_controller" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.48"

  role_name                              = "${var.name}-aws-lb-controller"
  attach_load_balancer_controller_policy = true
  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }
  tags = var.tags
}

output "service_role_arns" {
  value = { for svc, m in module.raw_data : svc => m.iam_role_arn }
}
output "external_secrets_role_arn" { value = module.external_secrets.iam_role_arn }
output "load_balancer_controller_role_arn" { value = module.load_balancer_controller.iam_role_arn }
