import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

// Service configuration interface
export interface FleetMgmtServiceConfig {
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
}

// Application configuration
const fleetMgmtReleaseConfig = new pulumi.Config("fleet-mgmt");
const releaseTag = fleetMgmtReleaseConfig.get("releaseTag");

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

    repository.repositoryUrl.apply((url) =>
        pulumi.log.info(`Container registry URL: ${url}`)
    );

    // Build and push the Docker image to ECR
    const image = new awsx.ecr.Image(serviceName, {
        repositoryUrl: repository.repositoryUrl,
        context: "../../../fleet-management-backend", // Path to your application directory
        imageTag: releaseTag,
        platform: "linux/arm64",
    }, { dependsOn: [repository] });

    image.imageUri.apply((url) =>
        pulumi.log.info(`Container image URL: ${url}`)
    );

    return { repository, image };
}

// Main service creation function
export function createFleetMgmtService(config: FleetMgmtServiceConfig) {
    const { serviceName, containerName, containerPort, ecsClusterName, ecsClusterArn, subnetIds, securityGroupId, loadBalancerArn, certificateArn, httpsListenerArn } = config;

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
                deploymentType: "backend",
            },
        }, { dependsOn: [buildResult.image] });
    });



    // Create target group for the service
    const targetGroup = new aws.lb.TargetGroup(serviceName, {
        protocol: "HTTP",
        port: 80,
        vpcId: pulumi.output(subnetIds).apply(async (sIds) => {
            const subnet = await aws.ec2.getSubnet({ id: sIds[0] });
            return subnet.vpcId;
        }),
        deregistrationDelay: 45,
        healthCheck: {
            healthyThreshold: 2,
            interval: 30,
            matcher: "200-299",
            path: "/fleet-mgmt-api/p/health",
            protocol: "HTTP",
            timeout: 5,
            unhealthyThreshold: 5,
            port: "traffic-port",
        },
        tags: {
            Application: serviceName,
        },
    });

    // Create HTTPS listener rule instead of creating a new listener
    const httpsListenerRule = new aws.lb.ListenerRule(`${serviceName}-listener-rule`, {
        listenerArn: httpsListenerArn,
        priority: 100, // Lower priority number than hyper-decode (which uses 200)
        actions: [{
            type: "forward",
            targetGroupArn: targetGroup.arn,
        }],
        conditions: [{
            hostHeader: {
                values: [`app.fleetcodes.com`], // fleet-mgmt uses app subdomain
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
                deploymentType: "backend",
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
        httpsListener: httpsListenerRule, // Return the listener rule instead
        scalableTarget,
        scaleOutPolicy,
        logGroup,
    };
}
