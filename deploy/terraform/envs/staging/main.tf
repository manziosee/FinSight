terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.60" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

locals {
  env  = "staging"
  name = "finsight-staging"
  tags = {
    Project     = "finsight"
    Environment = "staging"
    ManagedBy   = "terraform"
  }
  services = [
    "api-gateway", "identity-service", "ingestion-service", "normalization-service",
    "graph-service", "reconciliation-service", "intelligence-service", "anomaly-service",
    "forecast-service", "action-service",
  ]
}

data "aws_availability_zones" "available" { state = "available" }

module "network" {
  source = "../../modules/network"
  name   = local.name
  cidr   = "10.30.0.0/16"
  azs    = slice(data.aws_availability_zones.available.names, 0, 3)
  tags   = local.tags
}

module "eks" {
  source     = "../../modules/eks"
  name       = local.name
  vpc_id     = module.network.vpc_id
  subnet_ids = module.network.private_subnet_ids
  node_min   = 2
  node_max   = 4
  tags       = local.tags
}

module "ecr" {
  source   = "../../modules/ecr"
  services = local.services
  tags     = local.tags
}

module "s3" {
  source      = "../../modules/s3"
  bucket_name = "finsight-staging-raw-data"
  tags        = local.tags
}

module "rds" {
  source                     = "../../modules/rds"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  multi_az                   = false
  tags                       = local.tags
}

module "msk" {
  source                 = "../../modules/msk"
  name                   = local.name
  vpc_id                 = module.network.vpc_id
  subnet_ids             = module.network.private_subnet_ids
  number_of_broker_nodes = 3
  tags                   = local.tags
}

module "redis" {
  source     = "../../modules/redis"
  name       = local.name
  vpc_id     = module.network.vpc_id
  subnet_ids = module.network.private_subnet_ids
  tags       = local.tags
}

module "github_oidc" {
  source      = "../../modules/github-oidc"
  github_repo = var.github_repo
  environment = local.env
  tags        = local.tags
}

output "cluster_name" { value = module.eks.cluster_name }
output "ecr_repository_urls" { value = module.ecr.repository_urls }
output "raw_bucket" { value = module.s3.bucket_name }
output "kafka_bootstrap" { value = module.msk.bootstrap_brokers_tls }
output "redis_endpoint" { value = module.redis.primary_endpoint }
output "gha_deploy_role_arn" { value = module.github_oidc.role_arn }
