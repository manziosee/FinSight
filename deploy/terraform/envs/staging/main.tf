terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.60" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
    tls    = { source = "hashicorp/tls", version = ">= 4.0" }
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
  source             = "../../modules/network"
  name               = local.name
  cidr               = "10.30.0.0/16"
  azs                = slice(data.aws_availability_zones.available.names, 0, 3)
  single_nat_gateway = true
  tags               = local.tags
}

module "ecr" {
  source   = "../../modules/ecr"
  services = local.services
  tags     = local.tags
}

module "github_oidc" {
  source      = "../../modules/github-oidc"
  github_repo = var.github_repo
  environment = local.env
  ecr_arns    = module.ecr.repository_arns
  tags        = local.tags
}

module "eks" {
  source                       = "../../modules/eks"
  name                         = local.name
  vpc_id                       = module.network.vpc_id
  subnet_ids                   = module.network.private_subnet_ids
  endpoint_public_access_cidrs = var.eks_public_access_cidrs
  deploy_role_arn              = module.github_oidc.role_arn
  node_min                     = 2
  node_max                     = 4
  tags                         = local.tags
}

module "s3" {
  source      = "../../modules/s3"
  bucket_name = "finsight-staging-raw-data"
  tags        = local.tags
}

module "irsa" {
  source                 = "../../modules/irsa"
  name                   = local.name
  env                    = local.env
  oidc_provider_arn      = module.eks.oidc_provider_arn
  raw_bucket_arn         = module.s3.bucket_arn
  raw_bucket_kms_key_arn = module.s3.kms_key_arn
  tags                   = local.tags
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
  source                     = "../../modules/msk"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  tags                       = local.tags
}

module "redis" {
  source                     = "../../modules/redis"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  tags                       = local.tags
}

module "security_baseline" {
  source                  = "../../modules/security-baseline"
  name                    = local.name
  enable_account_baseline = var.enable_account_baseline
  tags                    = local.tags
}

# ------------------------------------------------------------------ secrets --
# identity-service's RS256 signing key. Lives in (encrypted) Terraform state; rotate by
# tainting this resource and keeping the old public key in JWKS until tokens expire.
resource "tls_private_key" "jwt" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# Neo4j runs in-cluster (Helm StatefulSet); there is no managed AWS equivalent.
resource "random_password" "neo4j" {
  length  = 40
  special = false
}

locals {
  kafka = module.msk.client_env
  dsn   = module.rds.service_dsns
}

module "service_secrets" {
  source = "../../modules/service-secrets"
  env    = local.env
  tags   = local.tags
  secrets = {
    "identity-service" = merge(local.kafka, {
      FINSIGHT_IDENTITY_DB_DSN     = local.dsn["identity"]
      FINSIGHT_JWT_PRIVATE_KEY_PEM = tls_private_key.jwt.private_key_pem
    })
    "ingestion-service"      = merge(local.kafka, { FINSIGHT_INGESTION_DB_DSN = local.dsn["ingestion"] })
    "normalization-service"  = merge(local.kafka, { FINSIGHT_NORMALIZATION_DB_DSN = local.dsn["normalization"] })
    "reconciliation-service" = merge(local.kafka, { FINSIGHT_RECONCILIATION_DB_DSN = local.dsn["reconciliation"] })
    "graph-service"          = merge(local.kafka, { FINSIGHT_NEO4J_PASSWORD = random_password.neo4j.result })
    "anomaly-service"        = local.kafka
    "forecast-service"       = local.kafka
    "action-service"         = local.kafka
    "api-gateway"            = { FINSIGHT_REDIS_URL = module.redis.url }
    "neo4j"                  = { NEO4J_AUTH = "neo4j/${random_password.neo4j.result}" }
    "db-bootstrap"           = module.rds.bootstrap_env
  }
  # Set the real key with: aws secretsmanager put-secret-value \
  #   --secret-id finsight/staging/intelligence-service --secret-string '{"ANTHROPIC_API_KEY":"..."}'
  operator_managed = {
    "intelligence-service" = { ANTHROPIC_API_KEY = "" }
  }
}

# ------------------------------------------------------------------ outputs --
output "cluster_name" { value = module.eks.cluster_name }
output "ecr_repository_urls" { value = module.ecr.repository_urls }
output "gha_deploy_role_arn" { value = module.github_oidc.role_arn }
output "raw_bucket" { value = module.s3.bucket_name }

# Values the Helm release needs (pass to helm with --set, see values-staging.yaml).
output "helm_values" {
  value = {
    "networkPolicy.vpcCidr"                                 = module.network.vpc_cidr
    "ingress.wafAclArn"                                     = module.security_baseline.waf_acl_arn
    "s3.bucket"                                             = module.s3.bucket_name
    "services.ingestion-service.serviceAccount.roleArn"     = module.irsa.service_role_arns["ingestion-service"]
    "services.normalization-service.serviceAccount.roleArn" = module.irsa.service_role_arns["normalization-service"]
  }
}
output "external_secrets_role_arn" { value = module.irsa.external_secrets_role_arn }
output "load_balancer_controller_role_arn" { value = module.irsa.load_balancer_controller_role_arn }
