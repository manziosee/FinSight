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

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

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
