terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.60" }
  }
}

variable "name" { type = string }
variable "kubernetes_version" {
  type    = string
  default = "1.30"
}
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "node_instance_types" {
  type    = list(string)
  default = ["m6i.large"]
}
variable "endpoint_public_access_cidrs" {
  description = <<-EOT
    CIDRs allowed to reach the Kubernetes API over the internet. Empty (default) = private
    endpoint only, reachable from inside the VPC (e.g. a self-hosted CI runner or VPN).
    Never 0.0.0.0/0.
  EOT
  type        = list(string)
  default     = []
  validation {
    condition     = !contains(var.endpoint_public_access_cidrs, "0.0.0.0/0")
    error_message = "Do not expose the EKS API to the whole internet."
  }
}
variable "deploy_role_arn" {
  description = "IAM role (GitHub OIDC) granted cluster access for helm deploys."
  type        = string
  default     = null
}
variable "node_min" { default = 2 }
variable "node_max" { default = 6 }
variable "tags" {
  type    = map(string)
  default = {}
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = var.name
  cluster_version = var.kubernetes_version

  cluster_endpoint_public_access       = length(var.endpoint_public_access_cidrs) > 0
  cluster_endpoint_public_access_cidrs = var.endpoint_public_access_cidrs
  cluster_endpoint_private_access      = true

  # EKS access entries (not the aws-auth ConfigMap): the CI deploy role may run helm.
  authentication_mode = "API"
  access_entries = var.deploy_role_arn == null ? {} : {
    gha_deploy = {
      principal_arn = var.deploy_role_arn
      policy_associations = {
        # Cluster-wide because the chart's CRs (ExternalSecret, ServiceMonitor) and the
        # namespace itself are created by the deploy. Narrow to a namespace-scoped
        # AmazonEKSEditPolicy once those exist out-of-band.
        admin = {
          policy_arn   = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  enable_irsa               = true
  cluster_encryption_config = { resources = ["secrets"] }
  cluster_enabled_log_types = ["api", "audit", "authenticator"]

  eks_managed_node_groups = {
    default = {
      min_size       = var.node_min
      max_size       = var.node_max
      desired_size   = var.node_min
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"
      labels         = { workload = "general" }
    }
  }

  tags = var.tags
}

output "cluster_name" { value = module.eks.cluster_name }
output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "oidc_provider_arn" { value = module.eks.oidc_provider_arn }
output "cluster_security_group_id" { value = module.eks.cluster_security_group_id }
output "node_security_group_id" { value = module.eks.node_security_group_id }
