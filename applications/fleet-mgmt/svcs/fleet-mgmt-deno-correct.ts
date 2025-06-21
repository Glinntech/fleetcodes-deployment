import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

// Get configuration
const config = new pulumi.Config();
const sharedInfraStackRef = config.get("sharedInfrastructureStackRef") || "dev/shared-infrastructure";

// Reference the shared infrastructure stack
const sharedInfraStack = new pulumi.StackReference(sharedInfraStackRef);

// Get shared infrastructure outputs
const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");
const sharedEcsClusterArn = sharedInfra.apply(infra => infra.ecsCluster.arn);
const sharedEcsClusterName = sharedInfra.apply(infra => infra.ecsCluster.name);
const sharedVpcId = sharedInfra.apply(infra => infra.vpc.id);
const sharedLoadBalancerArn = sharedInfraStack.requireOutput("fleetMgmtLB").apply(lb => lb.arn);
const sharedCertificateArn = sharedInfra.apply(infra => infra.dns.wildcardCertificateArn);
const sharedClusterOutput = sharedInfra.apply(infra => infra.ecsCluster.capacityProviders);

const serviceName = "fleet-mgmt-api";
const containerName = serviceName;
const containerPort = 8080;

const fleetMgmtReleaseConfig = new pulumi.Config("fleet-mgmt");
const releaseTag = fleetMgmtReleaseConfig.require("releaseTag");
const executionRole = new aws.iam.Role("ecs-execution-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
    }),
});
// Attach the necessary policies to the execution role
new aws.iam.RolePolicyAttachment("ecs-execution-policy", {
    role: executionRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});

function createRepoAndImage() {
    // Create an ECR repository
    const repository = new aws.ecr.Repository(serviceName, {
        forceDelete: true, // Optional: Enables force deletion of the repository
        name: serviceName,
    });

    repository.repositoryUrl.apply((url) =>
        pulumi.log.info(`container registry url: ${url}`).then(() =>
            console.log("logged repository url")
        )
    );
    // Build and push the Docker image to ECR
    const image = new awsx.ecr.Image(serviceName, {
        repositoryUrl: repository.repositoryUrl,
        context: "../../fleet-management-backend-v2", // Path to your application directory containing the Dockerfile
        //todo: take this from an external arg.
        imageTag: releaseTag,
        platform: "linux/arm64",
    }, { dependsOn: [repository] });
    image.imageUri.apply((url) =>
        pulumi.log.info(`container images url: ${url}`).then(() =>
            console.log("logged image uri")
        )
    );
    return { repository, image };
}

export const buildResult = createRepoAndImage();
export const output = buildResult.repository.repositoryUrl.apply((url) => {
    // Define the task definition
    const fleetMgmtTD = new aws.ecs.TaskDefinition(serviceName, {
        family: serviceName,
        cpu: "512",
        memory: "512",
        requiresCompatibilities: ["EC2"],
        networkMode: "bridge",
        executionRoleArn: executionRole.arn,
        containerDefinitions: JSON.stringify([
            {
                name: containerName,
                image: `${url}:${releaseTag}`, // Replace with your Docker image URI
                essential: true,
                portMappings: [
                    {
                        containerPort: containerPort,
                        hostPort: 0,
                        protocol: "tcp",
                    },
                ],
            },
        ]),

        tags: {
            deploymentType: "backend",
        },
    }, { dependsOn: [buildResult.image] });

    // Create a target group
    const targetGroup = new aws.lb.TargetGroup(serviceName, {
        protocol: "HTTP",
        port: 80,
        vpcId: sharedVpcId,
        deregistrationDelay: 45,
        healthCheck: {
            /**
             * Number of consecutive health check successes required before considering a target healthy. The range is 2-10. Defaults to 3.
             */
            healthyThreshold: 2,
            /**
             * Approximate amount of time, in seconds, between health checks of an individual target. The range is 5-300. For `lambda` target groups, it needs to be greater than the timeout of the underlying `lambda`. Defaults to 30.
             */
            interval: 5,
            /**
             * The HTTP or gRPC codes to use when checking for a successful response from a target.
             * The `health_check.protocol` must be one of `HTTP` or `HTTPS` or the `targetType` must be `lambda`.
             * Values can be comma-separated individual values (e.g., "200,202") or a range of values (e.g., "200-299").
             * * For gRPC-based target groups (i.e., the `protocol` is one of `HTTP` or `HTTPS` and the `protocolVersion` is `GRPC`), values can be between `0` and `99`. The default is `12`.
             * * When used with an Application Load Balancer (i.e., the `protocol` is one of `HTTP` or `HTTPS` and the `protocolVersion` is not `GRPC`), values can be between `200` and `499`. The default is `200`.
             * * When used with a Network Load Balancer (i.e., the `protocol` is one of `TCP`, `TCP_UDP`, `UDP`, or `TLS`), values can be between `200` and `599`. The default is `200-399`.
             * * When the `targetType` is `lambda`, values can be between `200` and `499`. The default is `200`.
             */
            matcher: "200-299",
            /**
             * Destination for the health check request. Required for HTTP/HTTPS ALB and HTTP NLB. Only applies to HTTP/HTTPS.
             * * For HTTP and HTTPS health checks, the default is `/`.
             * * For gRPC health checks, the default is `/AWS.ALB/healthcheck`.
             */
            path: "/p/health",

            /**
             * Protocol the load balancer uses when performing health checks on targets.
             * Must be one of `TCP`, `HTTP`, or `HTTPS`.
             * The `TCP` protocol is not supported for health checks if the protocol of the target group is `HTTP` or `HTTPS`.
             * Default is `HTTP`.
             * Cannot be specified when the `targetType` is `lambda`.
             */
            protocol: "HTTP",
            /**
             * Amount of time, in seconds, during which no response from a target means a failed health check. The range is 2–120 seconds. For target groups with a protocol of HTTP, the default is 6 seconds. For target groups with a protocol of TCP, TLS or HTTPS, the default is 10 seconds. For target groups with a protocol of GENEVE, the default is 5 seconds. If the target type is lambda, the default is 30 seconds.
             */
            timeout: 3,
            /**
             * Number of consecutive health check failures required before considering a target unhealthy. The range is 2-10. Defaults to 3.
             */
            unhealthyThreshold: 5,
            port: "traffic-port",
        },
    });
    // Add HTTPS listener to your ALB
    const httpsListener = new aws.lb.Listener("https-listener", {
        loadBalancerArn: sharedLoadBalancerArn,
        port: 443,
        protocol: "HTTPS",
        sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
        certificateArn: sharedCertificateArn, // Reference the certificate from shared infrastructure
        defaultActions: [{
            type: "forward",
            targetGroupArn: targetGroup.arn,
        }],
    }, {
        dependsOn: [], // Dependencies will be handled by stack references
    });

    const fleetMgmtService = new aws.ecs.Service(serviceName, {
        cluster: sharedEcsClusterArn,
        taskDefinition: fleetMgmtTD.arn,
        deploymentCircuitBreaker: {
            enable: true,
            rollback: true,
        },
        capacityProviderStrategies: [{
            capacityProvider: sharedClusterOutput.apply(cluster => cluster.spotCapacityProvider.name),
            weight: 1,
            base: 0,
        }],
        desiredCount: 1,
        deploymentMaximumPercent: 200,
        deploymentMinimumHealthyPercent: 25,
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
            deploymentType: "backend",
        },
    }, { dependsOn: [fleetMgmtTD, httpsListener] });

    // Define the scalable target
    const scalableTarget = new aws.appautoscaling.Target(serviceName, {
        maxCapacity: 10,
        minCapacity: 1,
        resourceId: pulumi
            .interpolate`service/${sharedEcsClusterName}/${fleetMgmtService.name}`,
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs",
    });
    const scaleOutPolicyName = serviceName + "-cpu-scale-policy";

    // Create a scaling policy for scaling out
    const scaleOutPolicy = new aws.appautoscaling.Policy(scaleOutPolicyName, {
        policyType: "TargetTrackingScaling",
        resourceId: scalableTarget.resourceId,
        scalableDimension: scalableTarget.scalableDimension,
        serviceNamespace: scalableTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
            predefinedMetricSpecification: {
                predefinedMetricType: "ECSServiceAverageCPUUtilization",
            },
            targetValue: 75.0, // Scale out when CPU utilization is above 50%
            scaleInCooldown: 60,
            scaleOutCooldown: 15,
        },
    }, { dependsOn: [scalableTarget] });

    return { fleetMgmtTD, fleetMgmtService, targetGroup, httpsListener };
});
