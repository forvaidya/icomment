#!/bin/bash
set -e

echo "Destroying knuth ALB stack"
echo "==========================="
echo ""
echo "This will DELETE:"
echo "  - Application Load Balancer"
echo "  - Target Group"
echo "  - ACM Certificate"
echo "  - Security Group"
echo ""
echo "WARNING: This cannot be undone!"
echo ""
read -p "Type 'destroy' to confirm: " confirm
if [ "$confirm" != "destroy" ]; then
    echo "Cancelled."
    exit 0
fi

STACK_NAME="knuth-alb-stack"
REGION="ap-south-1"

echo ""
echo "⏳ Destroying stack..."

# Use AWS CLI to destroy (simpler than CDK for one-time teardown)
aws cloudformation delete-stack \
    --stack-name "$STACK_NAME" \
    --region "$REGION"

echo ""
echo "⏳ Waiting for stack deletion..."
aws cloudformation wait stack-delete-complete \
    --stack-name "$STACK_NAME" \
    --region "$REGION" || true

echo ""
echo "✅ ALB stack destroyed"
echo ""
echo "Manual cleanup:"
echo "  - Check AWS Console for any remaining resources"
echo "  - Revert DNS records (if changed)"
echo ""
