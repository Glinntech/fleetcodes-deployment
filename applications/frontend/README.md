# Frontend Application Deployment

This directory contains the Pulumi infrastructure code to deploy your frontend application to AWS ECS, following the same pattern as the fleet-mgmt application.

## Prerequisites

1. Your frontend code should be in `/Users/vasimali/code/projects/fleet-management-frontend/fleet-mgmt`
2. Shared infrastructure should already be deployed (`pulumi up` in `shared-infrastructure/`)
3. AWS credentials configured with the `fleetcodes` profile

## Configuration

The frontend deployment is configured via `Pulumi.dev.yaml`:

```yaml
config:
  aws:region: us-east-2
  aws:profile: fleetcodes
  frontend:sharedInfrastructureStackRef: fleetcodes/shared-infrastructure/dev
  frontend:releaseTag: latest
  frontend:frontendPath: ../../../fleet-management-frontend/fleet-mgmt
  frontend:appSubdomain: www
```

### Key Configuration Options:

- `frontend:frontendPath`: Path to your frontend source code
- `frontend:appSubdomain`: Subdomain for your frontend (e.g., "frontend" → https://www.fleetcodes.com)
- `frontend:releaseTag`: Docker image tag for this deployment

## Deployment Steps

### 1. Install Dependencies
```bash
cd applications/frontend
npm install
```

### 2. Deploy Frontend
```bash
pulumi up
```

That's it! The deployment follows the same simple pattern as fleet-mgmt.

## What Gets Created

The deployment creates:

1. **ECR Repository**: `frontend` - stores your Docker images
2. **ECS Task Definition**: Defines how to run your frontend container
3. **ECS Service**: Manages running instances with auto-scaling
4. **Target Group**: Routes traffic to your frontend instances
5. **Load Balancer Rule**: Routes traffic based on subdomain (priority 300)
6. **Route53 DNS Record**: Maps your subdomain to the load balancer

## Frontend Requirements

Your frontend application should:

1. **Have a build script**: `npm run build` should create production files
2. **Be containerizable**: The Dockerfile should work with your app
3. **Start on port 3000**: Or update the `containerPort` in `index.ts`

The Dockerfile supports:
- **Create React App**: Looks for `build/` directory
- **Next.js**: Looks for `.next/` directory and `server.js`
- **Vite**: Looks for `dist/` directory
- **Generic**: Falls back to `npm start`

## URLs

After deployment, your frontend will be available at:
- `https://www.fleetcodes.com` (or your configured subdomain)

## Updating Your Frontend

To deploy changes:

1. Update your frontend code in `/Users/vasimali/code/projects/fleet-management-frontend/fleet-mgmt`
2. Optionally update the `frontend:releaseTag` in `Pulumi.dev.yaml`
3. Run `pulumi up` in the `applications/frontend/` directory

## Troubleshooting

### Build Issues
- Ensure your frontend builds successfully: `cd /path/to/frontend && npm run build`
- Check the Dockerfile works locally: `docker build -t frontend-test .`

### Health Check Issues
- The load balancer checks the root path `/` for health
- Ensure your app responds with a 200 status code

### DNS Issues
- Verify your subdomain in `Pulumi.dev.yaml`
- Check that the shared infrastructure DNS is working

### Container Issues
- Check CloudWatch logs: `/ecs/frontend` log group
- Verify the ECS service is running in the AWS console

## Log Files

Application logs are available in CloudWatch:
- **Log Group**: `/ecs/frontend`
- **Log Stream**: Contains container output and errors

## Load Balancer Configuration

The frontend service:
- **Priority**: 300 (after fleet-mgmt: 100, hyper-decode: 200)
- **Health Check**: HTTP GET `/` expecting 200 status
- **Target Type**: EC2 instances (not IP-based)
- **Network Mode**: Bridge (dynamic port mapping)
