# Remote state. Create the bucket + lock table once, out of band, then:
#   terraform init -reconfigure
terraform {
  backend "s3" {
    bucket         = "finsight-tfstate"
    key            = "staging/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "finsight-tflock"
    encrypt        = true
  }
}
