import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface FrontendServiceConfig {
    serviceName: string;
    containerName: string;
    containerPort: number;
    ecsClusterName: pulumi.Input<string>;
    ecsClusterArn: pulumi.Input<string>;
    subnetIds: pulumi.Input<string[]>;
    securityGroupId: pulumi.Input<string>;
    loadBalancerArn: pulumi.Input<string>;
    certificateArn: pulumi.Input<string>;
    httpsListenerArn: pulumi.Input<string>;
    appSubdomain: string;
}

// Get Pulumi configuration
const frontendConfig = new pulumi.Config("frontend");
const frontendPath = frontendConfig.get("frontendPath") || "../../../fleet-management-frontend/fleet-mgmt";
const dockerfileRelativePath = frontendConfig.get("dockerfilePath") || "./Dockerfile";

// Construct the full Dockerfile path relative to frontend path
const dockerfilePath = `${frontendPath}/${dockerfileRelativePath.replace('./', '')}`;


// Create ECS execution role
function createExecutionRole(serviceName: string) {
    const executionRole = new aws.iam.Role(`${serviceName}-ecs-execution-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "ecs-tasks.amazonaws.com",
        }),
    });

    // Attach the necessary policies to the execution role
    new aws.iam.RolePolicyAttachment(`${serviceName}-ecs-execution-policy`, {
        role: executionRole.name,
        policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
    });

    return executionRole;
}

// Create ECR repository and build image
function createRepoAndImage(serviceName: string) {
    // Create an ECR repository
    const repository = new aws.ecr.Repository(serviceName, {
        forceDelete: true,
        name: serviceName,
    });

    repository.repositoryUrl.apply((url: string) =>
        pulumi.log.info(`Container registry URL: ${url}`)
    );

  // Build and push Docker image to ECR
  const image = new awsx.ecr.Image("frontend", {
    repositoryUrl: repository.repositoryUrl,
    context: frontendPath, // Use the configured frontend path
    dockerfile: dockerfilePath, // Use the configured Dockerfile path
    platform: "linux/amd64",
  });

  image.imageUri.apply((url: string) =>
        pulumi.log.info(`Container image URL: ${url}`)
    );

    return { repository, image };
}

export function createFrontendService(config: FrontendServiceConfig) {
    const { serviceName, containerName, containerPort, ecsClusterName, ecsClusterArn, subnetIds, httpsListenerArn, appSubdomain } = config;

    // Create execution role
    const executionRole = createExecutionRole(serviceName);

    // Create repository and image
    const buildResult = createRepoAndImage(serviceName);

    const logGroupName = `/ecs/${serviceName}`;
    // Create CloudWatch log group
    const logGroup = new aws.cloudwatch.LogGroup(`${serviceName}-logs`, {
        name: logGroupName,
        retentionInDays: 7,
    });
    
    const awsRegion = aws.config.region;
    
    // Create task definition
    const taskDefinition = buildResult.image.imageUri.apply((imageUri) => {
        return new aws.ecs.TaskDefinition(serviceName, {
            family: serviceName,
            cpu: "512",
            memory: "512",
            requiresCompatibilities: ["EC2"],
            networkMode: "bridge",
            executionRoleArn: executionRole.arn,
            containerDefinitions: JSON.stringify([
                {
                    name: containerName,
                    image: imageUri,
                    essential: true,
                    portMappings: [
                        {
                            containerPort: containerPort,
                            hostPort: 0, // Dynamic port mapping
                            protocol: "tcp",
                        },
                    ],
                    "logConfiguration": {
                        "logDriver": "awslogs",
                        "options": {
                            "awslogs-group": logGroupName,
                            "mode": "non-blocking",
                            "max-buffer-size": "25m",
                            "awslogs-region": awsRegion,
                            "awslogs-stream-prefix": "ecs"
                        }
                    }
                },
            ]),
            tags: {
                Application: serviceName,
                deploymentType: "frontend",
            },
        }, { dependsOn: [buildResult.image] });
    });

    // Create target group for the service
    const targetGroup = new aws.lb.TargetGroup(serviceName, {
        protocol: "HTTP",
        port: 80,
        vpcId: pulumi.output(subnetIds).apply(async (sIds: any) => {
            const subnet = await aws.ec2.getSubnet({ id: sIds[0] });
            return subnet.vpcId;
        }),
        deregistrationDelay: 45,
        healthCheck: {
            healthyThreshold: 2,
            interval: 30,
            matcher: "200-299",
            path: "/api/health", // Next.js health check endpoint
            protocol: "HTTP",
            timeout: 5,
            unhealthyThreshold: 5,
            port: "traffic-port",
        },
        tags: {
            Application: serviceName,
        },
    });

    // Create HTTPS listener rule
    const httpsListenerRule = new aws.lb.ListenerRule(`${serviceName}-listener-rule`, {
        listenerArn: httpsListenerArn,
        priority: 300, // Different priority from fleet-mgmt (100) and hyper-decode (200)
        actions: [{
            type: "forward",
            targetGroupArn: targetGroup.arn,
        }],
        conditions: [{
            hostHeader: {
                values: [`${appSubdomain}.fleetcodes.com`],
            },
        }],
    });

    // Create ECS service
    const service = taskDefinition.apply(td => {
        return new aws.ecs.Service(serviceName, {
            cluster: ecsClusterArn,
            taskDefinition: td.arn,
            deploymentCircuitBreaker: {
                enable: true,
                rollback: true,
            },
            desiredCount: 1,
            deploymentMaximumPercent: 200,
            deploymentMinimumHealthyPercent: 50,
            loadBalancers: [{
                containerName: containerName,
                containerPort: containerPort,
                targetGroupArn: targetGroup.arn,
            }],
            name: serviceName,
            forceDelete: true,
            orderedPlacementStrategies: [{
                type: "binpack",
                field: "memory",
            }, {
                type: "spread",
                field: "instanceId",
            }],
            tags: {
                Application: serviceName,
                deploymentType: "frontend",
            },
        }, { dependsOn: [td, httpsListenerRule] });
    });

    // Auto Scaling Configuration
    const scalableTarget = service.apply(svc => {
        return new aws.appautoscaling.Target(`${serviceName}-scaling-target`, {
            maxCapacity: 10,
            minCapacity: 1,
            resourceId: pulumi.interpolate`service/${ecsClusterName}/${svc.name}`,
            scalableDimension: "ecs:service:DesiredCount",
            serviceNamespace: "ecs",
        });
    });

    const scaleOutPolicy = scalableTarget.apply(target => {
        return new aws.appautoscaling.Policy(`${serviceName}-cpu-scale-policy`, {
            policyType: "TargetTrackingScaling",
            resourceId: target.resourceId,
            scalableDimension: target.scalableDimension,
            serviceNamespace: target.serviceNamespace,
            targetTrackingScalingPolicyConfiguration: {
                predefinedMetricSpecification: {
                    predefinedMetricType: "ECSServiceAverageCPUUtilization",
                },
                targetValue: 75.0,
                scaleInCooldown: 60,
                scaleOutCooldown: 15,
            },
        }, { dependsOn: [target] });
    });

    return {
        buildResult,
        taskDefinition,
        service,
        targetGroup,
        httpsListener: httpsListenerRule,
        scalableTarget,
        scaleOutPolicy,
        logGroup,
    };
}
