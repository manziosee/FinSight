variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "github_repo" {
  type        = string
  description = "owner/repo allowed to assume the deploy role via GitHub OIDC (case-sensitive)."
  default     = "manziosee/FinSight"
}

variable "eks_public_access_cidrs" {
  type        = list(string)
  description = "CIDRs allowed to reach the EKS API publicly. Empty = private endpoint only."
  default     = []
}

variable "enable_account_baseline" {
  type        = bool
  description = "Create GuardDuty + CloudTrail (account/region-wide: enable in one environment only)."
  default     = false
}
