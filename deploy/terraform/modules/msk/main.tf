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
  description = "Security groups (EKS nodes) allowed to reach the brokers."
  type        = list(string)
}
variable "instance_type" {
  type    = string
  default = "kafka.m7g.large"
}
variable "number_of_broker_nodes" {
  type    = number
  default = 3
}
variable "tags" {
  type    = map(string)
  default = {}
}

# Clients authenticate with SASL/SCRAM-SHA-512 over TLS (port 9096). aiokafka supports
# SCRAM natively; MSK IAM auth would need a signer library the services don't ship.
locals {
  sasl_scram_port = 9096
  username        = "finsight"
}

resource "aws_security_group" "this" {
  name   = "${var.name}-msk"
  vpc_id = var.vpc_id
  tags   = var.tags
}

resource "aws_vpc_security_group_ingress_rule" "clients" {
  for_each                     = toset(var.allowed_security_group_ids)
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = local.sasl_scram_port
  to_port                      = local.sasl_scram_port
  description                  = "SASL/SCRAM over TLS from ${each.value}"
}

resource "aws_vpc_security_group_ingress_rule" "brokers" {
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = aws_security_group.this.id
  ip_protocol                  = "-1"
  description                  = "broker-to-broker"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# MSK SCRAM secrets must use a customer-managed key and an "AmazonMSK_" name prefix.
resource "aws_kms_key" "scram" {
  description             = "${var.name} MSK SCRAM credentials"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "random_password" "scram" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "scram" {
  name       = "AmazonMSK_${var.name}"
  kms_key_id = aws_kms_key.scram.key_id
  tags       = var.tags
}

resource "aws_secretsmanager_secret_version" "scram" {
  secret_id     = aws_secretsmanager_secret.scram.id
  secret_string = jsonencode({ username = local.username, password = random_password.scram.result })
}

resource "aws_msk_scram_secret_association" "this" {
  cluster_arn     = aws_msk_cluster.this.arn
  secret_arn_list = [aws_secretsmanager_secret.scram.arn]
  depends_on      = [aws_secretsmanager_secret_version.scram]
}

resource "aws_msk_cluster" "this" {
  cluster_name           = var.name
  kafka_version          = "3.6.0"
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.this.id]
    storage_info {
      ebs_storage_info { volume_size = 100 }
    }
  }

  client_authentication {
    unauthenticated = false
    sasl { scram = true }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  open_monitoring {
    prometheus {
      jmx_exporter { enabled_in_broker = true }
      node_exporter { enabled_in_broker = true }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.this.name
      }
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/finsight/msk/${var.name}"
  retention_in_days = 30
  tags              = var.tags
}

output "bootstrap_brokers_sasl_scram" { value = aws_msk_cluster.this.bootstrap_brokers_sasl_scram }
output "security_group_id" { value = aws_security_group.this.id }

# The settings the services need, ready to merge into their secrets.
output "client_env" {
  sensitive = true
  value = {
    FINSIGHT_KAFKA_BOOTSTRAP_SERVERS = aws_msk_cluster.this.bootstrap_brokers_sasl_scram
    FINSIGHT_KAFKA_SECURITY_PROTOCOL = "SASL_SSL"
    FINSIGHT_KAFKA_SASL_MECHANISM    = "SCRAM-SHA-512"
    FINSIGHT_KAFKA_SASL_USERNAME     = local.username
    FINSIGHT_KAFKA_SASL_PASSWORD     = random_password.scram.result
  }
}
