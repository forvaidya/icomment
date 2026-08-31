#!/bin/bash
set -e

echo "Creating ALB for knuth backend (ap-south-1)"
echo "=============================================="
echo ""
echo "This will:"
echo "  1. Create Application Load Balancer"
echo "  2. Request ACM certificate for knuth.awanipro.com"
echo "  3. Create target group pointing to EC2:9000"
echo "  4. Set up HTTPS listener"
echo ""
echo "Cost: ~$20/month + data transfer"
echo "Run knuth-alb-disable.sh to tear down"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Configuration
STACK_NAME="knuth-alb-stack"
DOMAIN="knuth.awanipro.com"
REGION="ap-south-1"
EC2_INSTANCE_ID="i-0c3c8a4c7d8e9f0a1"  # TODO: Update with actual instance ID
VPC_ID="vpc-xxxxxx"  # TODO: Update with actual VPC ID
SUBNET_IDS="subnet-xxxxx,subnet-yyyyy"  # TODO: Update with actual subnet IDs

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first."
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo "Installing AWS CDK..."
    npm install -g aws-cdk
fi

# Create temporary CDK app
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

cat > cdk.json <<EOF
{
  "app": "python3 app.py"
}
EOF

cat > app.py <<'PYTHON'
import aws_cdk as cdk
from aws_cdk import (
    aws_elasticloadbalancingv2 as elbv2,
    aws_ec2 as ec2,
    aws_certificatemanager as acm,
)

class KnuthAlbStack(cdk.Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)

        # Get VPC and EC2 instance
        vpc = ec2.Vpc.from_lookup(self, "VPC", is_default=False)

        # Create security group for ALB
        alb_sg = ec2.SecurityGroup(
            self, "KnuthAlbSG",
            vpc=vpc,
            allow_all_outbound=True,
            description="Security group for knuth ALB"
        )
        alb_sg.add_ingress_rule(
            peer=ec2.Peer.any_ipv4(),
            connection=ec2.Port.tcp(443),
            description="HTTPS from anywhere"
        )
        alb_sg.add_ingress_rule(
            peer=ec2.Peer.any_ipv4(),
            connection=ec2.Port.tcp(80),
            description="HTTP from anywhere (redirect to HTTPS)"
        )

        # Create ALB
        alb = elbv2.ApplicationLoadBalancer(
            self, "KnuthAlb",
            vpc=vpc,
            internet_facing=True,
            security_group=alb_sg,
            load_balancer_name="knuth-alb"
        )

        # Request ACM certificate
        cert = acm.Certificate(
            self, "KnuthCert",
            domain_name="knuth.awanipro.com",
            validation=acm.CertificateValidation.DNS()
        )

        # Create target group
        tg = elbv2.ApplicationTargetGroup(
            self, "KnuthTG",
            vpc=vpc,
            port=9000,
            protocol=elbv2.ApplicationProtocol.HTTP,
            target_type=elbv2.TargetType.INSTANCE,
            health_check=elbv2.HealthCheck(
                path="/multiply?a=2&b=3",
                interval=cdk.Duration.seconds(30),
                timeout=cdk.Duration.seconds(5),
                healthy_threshold_count=2,
                unhealthy_threshold_count=2
            )
        )

        # Add EC2 instance to target group (update instance ID)
        instance = ec2.Instance.from_instance_attributes(
            self, "KnuthInstance",
            instance_id="i-0c3c8a4c7d8e9f0a1",  # TODO: Update
            machine_image=ec2.MachineImage.generic_linux()
        )
        tg.add_target(elbv2.InstanceTarget(instance))

        # Add HTTPS listener
        alb.add_listener(
            "HTTPS",
            port=443,
            protocol=elbv2.ApplicationProtocol.HTTPS,
            certificates=[elbv2.ListenerCertificate.from_arn(cert.certificate_arn)],
            default_target_groups=[tg]
        )

        # Redirect HTTP to HTTPS
        alb.add_listener(
            "HTTP",
            port=80,
            protocol=elbv2.ApplicationProtocol.HTTP,
            default_action=elbv2.ListenerAction.redirect(
                protocol="HTTPS",
                port="443",
                permanent=True
            )
        )

app = cdk.App()
KnuthAlbStack(app, "knuth-alb-stack", env=cdk.Environment(region="ap-south-1"))
app.synth()
PYTHON

echo ""
echo "⏳ Deploying CDK stack..."
cdk deploy --require-approval=never

echo ""
echo "✅ ALB created!"
echo ""
echo "Next steps:"
echo "  1. Update DNS to point to ALB DNS name (check CloudFormation outputs)"
echo "  2. Validate ACM certificate in AWS Console"
echo "  3. Test: curl https://knuth.awanipro.com/multiply?a=3&b=4"
echo ""
echo "To tear down: knuth-alb-disable.sh"

# Cleanup
cd -
rm -rf "$TEMP_DIR"
