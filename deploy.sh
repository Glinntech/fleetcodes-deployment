#!/bin/bash

# Deployment script for multi-application Pulumi setup
# This script helps deploy the shared infrastructure first, then the applications

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Multi-Application Pulumi Deployment Script${NC}"
echo "=========================================="

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if we're in the right directory
    if [ ! -d "shared-infrastructure" ] || [ ! -d "applications" ]; then
        print_error "Please run this script from the deployment directory"
        exit 1
    fi
    
    # Check if Pulumi is installed
    if ! command -v pulumi &> /dev/null; then
        print_error "Pulumi is not installed. Please install Pulumi first."
        exit 1
    fi
    
    # Check if AWS credentials are configured
    if ! AWS_PROFILE=personal aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured for 'personal' profile. Please configure AWS profile 'personal'."
        exit 1
    fi
    
    print_status "Prerequisites check passed!"
}

# Function to deploy shared infrastructure
deploy_shared_infra() {
    print_status "Deploying shared infrastructure..."
    cd shared-infrastructure
    
    # Check if stack exists
    if ! AWS_PROFILE=personal pulumi stack ls | grep -q "dev"; then
        print_status "Creating new stack 'dev' for shared infrastructure"
        AWS_PROFILE=personal pulumi stack init dev
    else
        print_status "Using existing stack 'dev'"
        AWS_PROFILE=personal pulumi stack select dev
    fi
    
    print_status "Running pulumi up for shared infrastructure..."
    AWS_PROFILE=personal pulumi up --yes
    
    if [ $? -eq 0 ]; then
        print_status "Shared infrastructure deployed successfully!"
    else
        print_error "Failed to deploy shared infrastructure"
        exit 1
    fi
    
    cd ..
}

# Function to deploy an application
deploy_application() {
    local app_name=$1
    print_status "Deploying application: $app_name"
    cd "applications/$app_name"
    
    # Check if stack exists
    if ! AWS_PROFILE=personal pulumi stack ls | grep -q "dev"; then
        print_status "Creating new stack 'dev' for $app_name"
        AWS_PROFILE=personal pulumi stack init dev
    else
        print_status "Using existing stack 'dev' for $app_name"
        AWS_PROFILE=personal pulumi stack select dev
    fi
    
    print_status "Running pulumi up for $app_name..."
    AWS_PROFILE=personal pulumi up --yes
    
    if [ $? -eq 0 ]; then
        print_status "$app_name deployed successfully!"
    else
        print_error "Failed to deploy $app_name"
        return 1
    fi
    
    cd ../..
}

# Function to show status of all stacks
show_status() {
    print_status "Checking status of all stacks..."
    
    echo
    echo "=== Shared Infrastructure ==="
    cd shared-infrastructure
    pulumi stack --show-urns 2>/dev/null || echo "Stack not found or not deployed"
    cd ..
    
    echo
    echo "=== Applications ==="
    for app in applications/*/; do
        if [ -d "$app" ]; then
            app_name=$(basename "$app")
            echo "--- $app_name ---"
            cd "$app"
            pulumi stack --show-urns 2>/dev/null || echo "Stack not found or not deployed"
            cd ../..
        fi
    done
}

# Function to destroy everything
destroy_all() {
    print_warning "This will destroy ALL resources. Are you sure? (y/N)"
    read -r confirmation
    if [[ $confirmation =~ ^[Yy]$ ]]; then
        # Destroy applications first
        for app in applications/*/; do
            if [ -d "$app" ]; then
                app_name=$(basename "$app")
                print_status "Destroying application: $app_name"
                cd "$app"
                pulumi destroy --yes 2>/dev/null || echo "Nothing to destroy for $app_name"
                cd ../..
            fi
        done
        
        # Then destroy shared infrastructure
        print_status "Destroying shared infrastructure..."
        cd shared-infrastructure
        pulumi destroy --yes 2>/dev/null || echo "Nothing to destroy for shared infrastructure"
        cd ..
        
        print_status "All resources destroyed!"
    else
        print_status "Destruction cancelled"
    fi
}

# Main menu
check_prerequisites

case "${1:-menu}" in
    "shared")
        deploy_shared_infra
        ;;
    "fleet-mgmt")
        deploy_application "fleet-mgmt"
        ;;
    "hyper-decode")
        deploy_application "hyper-decode"
        ;;
    "all")
        deploy_shared_infra
        deploy_application "fleet-mgmt"
        deploy_application "hyper-decode"
        ;;
    "status")
        show_status
        ;;
    "destroy")
        destroy_all
        ;;
    "menu"|*)
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  shared     - Deploy shared infrastructure only"
        echo "  fleet-mgmt - Deploy fleet management application"
        echo "  hyper-decode - Deploy hyper-decode application"
        echo "  all        - Deploy shared infrastructure and all applications"
        echo "  status     - Show status of all stacks"
        echo "  destroy    - Destroy all resources (with confirmation)"
        echo "  menu       - Show this menu (default)"
        echo
        echo "Example deployment order:"
        echo "  $0 shared      # Deploy shared infrastructure first"
        echo "  $0 fleet-mgmt  # Deploy applications after shared infra"
        echo "  $0 hyper-decode"
        ;;
esac
