terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.60" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" {
  type    = list(string)
  default = []
}
variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "multi_az" {
  type    = bool
  default = true
}
variable "databases" {
  type    = list(string)
  default = ["identity", "ingestion", "normalization", "reconciliation"]
}
variable "tags" {
  type    = map(string)
  default = {}
}

resource "random_password" "master" {
  length  = 32
  special = false
}

# One login role per service database (created in-cluster by the chart's db-bootstrap
# hook, which is the only consumer of the master credentials).
resource "random_password" "service" {
  for_each = toset(var.databases)
  length   = 32
  special  = false
}

# RDS for PostgreSQL 16 already defaults rds.force_ssl=1; pin it so it can't drift.
resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  tags = var.tags
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name   = "${var.name}-rds"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_db_instance" "this" {
  identifier                          = var.name
  engine                              = "postgres"
  engine_version                      = "16"
  instance_class                      = var.instance_class
  allocated_storage                   = 50
  max_allocated_storage               = 500
  storage_encrypted                   = true
  multi_az                            = var.multi_az
  db_subnet_group_name                = aws_db_subnet_group.this.name
  parameter_group_name                = aws_db_parameter_group.this.name
  vpc_security_group_ids              = [aws_security_group.this.id]
  username                            = "finsight"
  password                            = random_password.master.result
  backup_retention_period             = 14
  deletion_protection                 = true
  iam_database_authentication_enabled = true
  performance_insights_enabled        = true
  auto_minor_version_upgrade          = true
  copy_tags_to_snapshot               = true
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${var.name}-final"
  tags                                = var.tags
}

output "endpoint" { value = aws_db_instance.this.address }
output "security_group_id" { value = aws_security_group.this.id }

# database name => least-privilege DSN for that service (sslmode=require; the services
# translate it for asyncpg).
output "service_dsns" {
  sensitive = true
  value = {
    for db in var.databases :
    db => "postgresql://${db}_svc:${random_password.service[db].result}@${aws_db_instance.this.address}:5432/${db}?sslmode=require"
  }
}

# For the db-bootstrap hook only: master DSN plus each role's password to create.
output "bootstrap_env" {
  sensitive = true
  value = merge(
    {
      FINSIGHT_DB_ADMIN_DSN = "postgresql://finsight:${random_password.master.result}@${aws_db_instance.this.address}:5432/postgres?sslmode=require"
      FINSIGHT_DB_NAMES     = join(" ", var.databases)
    },
    { for db in var.databases : "FINSIGHT_DB_PASSWORD_${upper(db)}" => random_password.service[db].result },
  )
}
