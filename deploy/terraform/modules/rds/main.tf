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

resource "aws_secretsmanager_secret" "dsn" {
  for_each = toset(var.databases)
  name     = "finsight/${var.name}/${each.value}-db"
  tags     = var.tags
}

resource "aws_secretsmanager_secret_version" "dsn" {
  for_each  = aws_secretsmanager_secret.dsn
  secret_id = each.value.id
  secret_string = jsonencode({
    dsn = "postgresql+asyncpg://finsight:${random_password.master.result}@${aws_db_instance.this.address}:5432/${each.key}"
  })
}

output "endpoint" { value = aws_db_instance.this.address }
output "security_group_id" { value = aws_security_group.this.id }
