terraform {
  backend "s3" {
    bucket         = "finsight-tfstate"
    key            = "production/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "finsight-tflock"
    encrypt        = true
  }
}
