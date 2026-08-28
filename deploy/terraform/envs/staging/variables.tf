variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "github_repo" {
  type        = string
  description = "owner/repo for GitHub Actions OIDC (e.g. sicrwanda/finsight)"
  default     = "sicrwanda/finsight"
}
