import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {executionRole, fleetMgmtECSCluster, fleetMgmtVpc} from "../cluster/base";
import {fleetMgmtLB} from "../cluster/lb";
import * as pulumi from "@pulumi/pulumi";

const serviceName = "fleet-mgmt-api";
const containerName = serviceName;
const containerPort = 8080;


// Create an ECR repository
const repository = new aws.ecr.Repository(serviceName, {
    forceDelete: true, // Optional: Enables force deletion of the repository
});
// Log the repository URL length
repository.repositoryUrl.apply(url => {
    const urlLength = url.length;
    pulumi.log.info(`Repository URL length: ${urlLength}`).then(() => {
        if (urlLength > 255) {
            console.error("Repository URL exceeds 255 characters.");
        } else {
            console.log("Repository URL is within the allowed limit.");
        }
    });
});
repository.repositoryUrl.apply(url => pulumi.log.info(`${url}`).then(() => console.log("logged repository url")));
// Build and push the Docker image to ECR
export const image = new awsx.ecr.Image(serviceName, {
    repositoryUrl: repository.repositoryUrl,
    context: "../../fleet-management-backend-v2", // Path to your application directory containing the Dockerfile
    //todo: take this from an external arg.
    imageTag: "release-0.0.2"
});
image.imageUri.apply(url => pulumi.log.info(`${url}`).then(() => console.log("logged image uri")));

// image.imageUri.apply(url => {
//
//
//
// });

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
            image: "545009870706.dkr.ecr.us-east-2.amazonaws.com/fleet-mgmt-api-75b7c22:release-0.0.2", // Replace with your Docker image URI
            essential: true,
            portMappings: [
                {
                    containerPort: containerPort,
                    hostPort: containerPort,
                    protocol: "tcp",
                },
            ],
        },
    ]),

    tags: {
        deploymentType: "backend"
    }
})


// Create a target group
const targetGroup = new aws.lb.TargetGroup(serviceName, {
    protocol: "HTTP",
    port: containerPort,
    vpcId: fleetMgmtVpc.vpcId,
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
    }
});

export const fleetMgmtService = new aws.ecs.Service(serviceName, {
    cluster: fleetMgmtECSCluster.arn,
    taskDefinition: fleetMgmtTD.arn,
    deploymentCircuitBreaker: {
        enable: true,
        rollback: true
    },
    deploymentMaximumPercent: 200,
    deploymentMinimumHealthyPercent: 25,
    loadBalancers: [{
        containerName: containerName,
        containerPort: containerPort,
        targetGroupArn: targetGroup.arn,
    }],
    launchType: "EC2",
    name: serviceName,
    // placementConstraints: [{
    //     type: "memberOf",
    //     expression: "attribute:ecs.availability-zone in [us-east-2a]",
    // }],
    orderedPlacementStrategies: [{
        type: "binpack",
        field: "memory"
    },
        {
            type: "spread",
            field: "instanceId"
        }]
    , tags: {
        deploymentType: "backend"
    }
});

// Create a listener for the ALB
new aws.lb.Listener("fleet-mgmt-listener", {
    loadBalancerArn: fleetMgmtLB.arn,
    port: 80,
    defaultActions: [
        {
            type: "forward",
            targetGroupArn: targetGroup.arn,
        },
    ],
});


// export const fleetMgmtTD = new aws.ecs.TaskDefinition(serviceName, {
//     family: serviceName,
//     containerDefinitions: JSON.stringify([
//         {
//             name: containerName,
//             image: "", //todo add this later.
//             cpu: 256,
//             memory: 512,
//             memoryReservation: 256,
//             essential: true,
//             portMappings: [{
//                 containerPort: 80,
//                 hostPort: 0,
//                 protocol: "tcp"
//             }],
//         }
//     ]),
//     volumes: [{
//         name: `${serviceName}-storage`,
//         hostPath: `/ecs/${serviceName}-storage`,
//     }],
//     placementConstraints: [{
//         type: "memberOf",
//         //todo: place things in a single region and availability zone, to avoid data transfer costs.
//         expression: "attribute:ecs.availability-zone in [us-west-2a]",
//     }],
//     executionRoleArn: aws.iam.Role.get("ecsTaskExecutionRole", "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy").arn,
//     runtimePlatform: {
//         cpuArchitecture: "ARM64"
//     }
// });




