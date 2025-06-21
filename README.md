# Multi-Application Pulumi Deployment

This project has been restructured to support deploying multiple applications while sharing common infrastructure components like VPC, Load Balancer, ECS Cluster, and DNS.

## Project Structure

```
deployment/
├── shared-infrastructure/          # Shared infrastructure stack
│   ├── index.ts                   # Main shared infrastructure exports
│   ├── package.json               # Dependencies for shared infra
│   ├── Pulumi.yaml               # Pulumi project config
│   ├── Pulumi.dev.yaml           # Environment-specific config
│   ├── tsconfig.json             # TypeScript config
│   ├── cluster/                  # VPC, ECS, Load Balancer
│   │   ├── vpc.ts               # VPC and networking
│   │   ├── base.ts              # ECS cluster and security groups
│   │   └── lb.ts                # Application Load Balancer
│   ├── dns/                     # DNS and SSL certificates
│   │   └── route53.ts           # Route53 hosted zone and wildcard SSL
│   └── database/                # Shared database resources
│       └── mongodb/
│           └── mongodb.ts
│
├── applications/                   # Application-specific stacks
│   ├── fleet-mgmt/                # Fleet management application
│   │   ├── index.ts              # Application deployment
│   │   ├── package.json          # App-specific dependencies
│   │   ├── Pulumi.yaml           # App project config
│   │   ├── Pulumi.dev.yaml       # App environment config
│   │   └── svcs/                 # Application services
│   │       └── fleet-mgmt-service.ts
│   │
│   └── hyper-decode/              # Hyper-decode application example
│       ├── index.ts              # Application deployment
│       ├── package.json          # App-specific dependencies
│       ├── Pulumi.yaml           # App project config
│       └── Pulumi.dev.yaml       # App environment config
│
├── backend/                       # Original monolithic stack (legacy)
├── deploy.sh                      # Deployment automation script
└── README.md                      # This file
```

## Deployment Architecture

### Shared Infrastructure Stack
- **VPC**: Single VPC with public subnets across multiple AZs
- **ECS Cluster**: Shared ECS cluster with auto-scaling capacity providers
- **Load Balancer**: Application Load Balancer with HTTPS support
- **DNS**: Route53 hosted zone with wildcard SSL certificate
- **Security Groups**: Shared security groups for ALB and ECS instances

### Application Stacks
- **Fleet Management**: Primary application using shared infrastructure
- **Hyper-Decode**: Example second application demonstrating shared resource usage
- Each application creates its own:
  - ECS services and task definitions
  - Target groups and listener rules
  - DNS records (subdomains)
  - Application-specific resources

## Prerequisites

1. **AWS CLI**: Configure with your AWS credentials
   ```bash
   aws configure --profile personal
   ```

2. **Pulumi**: Install Pulumi CLI
   ```bash
   curl -fsSL https://get.pulumi.com | sh
   ```

3. **Node.js**: Required for TypeScript runtime
   ```bash
   # Install Node.js 18+ and npm
   ```

## Quick Start

### 1. Deploy Shared Infrastructure First
```bash
# Deploy VPC, ECS cluster, load balancer, DNS
./deploy.sh shared
```

### 2. Deploy Applications
```bash
# Deploy fleet management application
./deploy.sh fleet-mgmt

# Deploy hyper-decode application
./deploy.sh hyper-decode

# Or deploy everything at once
./deploy.sh all
```

### 3. Check Status
```bash
# View status of all stacks
./deploy.sh status
```

## Manual Deployment

If you prefer to deploy manually without the script:

### Shared Infrastructure
```bash
cd shared-infrastructure
AWS_PROFILE=personal pulumi up
cd ..
```

### Applications
```bash
cd applications/fleet-mgmt
AWS_PROFILE=personal pulumi up
cd ../..

cd applications/hyper-decode
AWS_PROFILE=personal pulumi up
cd ../..
```

## Configuration

### AWS Profile
All configurations are set to use the `personal` AWS profile. Update the following files if you use a different profile:

- `shared-infrastructure/Pulumi.dev.yaml`
- `applications/fleet-mgmt/Pulumi.dev.yaml`
- `applications/hyper-decode/Pulumi.dev.yaml`

### Stack References
Applications reference the shared infrastructure stack via stack references:

```yaml
# In application Pulumi.dev.yaml
config:
  fleet-mgmt-application:sharedInfrastructureStackRef: dev/shared-infrastructure
```

### Domain Configuration
Update the domain in `shared-infrastructure/dns/route53.ts`:

```typescript
export const domainName = "your-domain.com";
```

## Adding New Applications

1. **Create new application directory**:
   ```bash
   mkdir applications/my-new-app
   cd applications/my-new-app
   ```

2. **Copy configuration from existing app**:
   ```bash
   cp ../fleet-mgmt/package.json .
   cp ../fleet-mgmt/Pulumi.yaml .
   cp ../fleet-mgmt/Pulumi.dev.yaml .
   cp ../fleet-mgmt/tsconfig.json .
   ```

3. **Update configurations**:
   - Change `name` in `package.json` and `Pulumi.yaml`
   - Update stack reference in `Pulumi.dev.yaml`

4. **Create application index.ts**:
   ```typescript
   import * as pulumi from "@pulumi/pulumi";
   
   // Reference shared infrastructure
   const config = new pulumi.Config();
   const sharedInfraStackRef = config.get("sharedInfrastructureStackRef");
   const sharedInfraStack = new pulumi.StackReference(sharedInfraStackRef);
   
   // Get shared resources
   const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");
   
   // Create your application resources...
   ```

5. **Deploy**:
   ```bash
   npm install
   AWS_PROFILE=personal pulumi stack init dev
   AWS_PROFILE=personal pulumi up
   ```

## Shared Resources Available

Applications can access these shared infrastructure components:

```typescript
const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");

// VPC and Networking
const vpcId = sharedInfra.apply(infra => infra.vpc.id);
const subnetIds = sharedInfra.apply(infra => infra.vpc.publicSubnetIds);

// ECS Cluster
const clusterName = sharedInfra.apply(infra => infra.ecsCluster.name);
const clusterArn = sharedInfra.apply(infra => infra.ecsCluster.arn);

// Load Balancer
const loadBalancerArn = sharedInfra.apply(infra => infra.loadBalancer.arn);
const loadBalancerDnsName = sharedInfra.apply(infra => infra.loadBalancer.dnsName);

// Security Groups
const albSecurityGroupId = sharedInfra.apply(infra => infra.securityGroups.albSecurityGroupId);
const ecsSecurityGroupId = sharedInfra.apply(infra => infra.securityGroups.ecsInstanceSecurityGroupId);

// DNS
const hostedZoneId = sharedInfra.apply(infra => infra.dns.hostedZoneId);
const wildcardCertificateArn = sharedInfra.apply(infra => infra.dns.wildcardCertificateArn);
const domainName = sharedInfra.apply(infra => infra.dns.domainName);
```

## Troubleshooting

### Stack Reference Issues
If applications can't find the shared infrastructure stack:

1. Ensure shared infrastructure is deployed first
2. Check the stack reference configuration in `Pulumi.dev.yaml`
3. Verify the stack name matches: `organization/shared-infrastructure/dev`

### DNS Configuration
After deploying shared infrastructure:

1. Note the nameservers from the output
2. Update your domain's nameservers with your domain registrar
3. Wait for DNS propagation (up to 48 hours)

### SSL Certificate Validation
The wildcard SSL certificate requires DNS validation:

1. Ensure the Route53 hosted zone is properly configured
2. Verify nameservers are updated with your registrar
3. Certificate validation happens automatically via DNS records

## Cost Optimization

- **Shared Resources**: VPC, Load Balancer, and ECS cluster are shared across all applications
- **Auto Scaling**: ECS cluster uses spot instances and auto-scaling groups
- **Single SSL Certificate**: Wildcard certificate covers all application subdomains

## Security

- **Security Groups**: Separate security groups for ALB and ECS instances
- **HTTPS Only**: All applications use HTTPS with wildcard SSL certificate
- **VPC Isolation**: All resources deployed within a dedicated VPC
- **IAM Roles**: Least privilege IAM roles for ECS tasks

## Cleanup

To destroy all resources:

```bash
./deploy.sh destroy
```

Or manually:

```bash
# Destroy applications first
cd applications/fleet-mgmt && AWS_PROFILE=personal pulumi destroy
cd applications/hyper-decode && AWS_PROFILE=personal pulumi destroy

# Then destroy shared infrastructure
cd shared-infrastructure && AWS_PROFILE=personal pulumi destroy
```

**Note**: Always destroy applications before destroying shared infrastructure to avoid dependency issues.
