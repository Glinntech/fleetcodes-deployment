import * as aws from "@pulumi/aws";
import {fleetMgmtECSCluster} from "../cluster/base";

const serviceName = "fleet-mgmt-api";
const containerName = "fleet-mgmt-deno";

export const fleetMgmtTD = new aws.ecs.TaskDefinition(serviceName, {
    family: serviceName,
    containerDefinitions: JSON.stringify([
        {
            name: containerName,
            image: "", //todo add this later.
            cpu: 256,
            memory: 512,
            memoryReservation: 256,
            essential: true,
            portMappings: [{
                containerPort: 80,
                hostPort: 0,
                protocol: "tcp"
            }],
        }
    ]),
    volumes: [{
        name: `${serviceName}-storage`,
        hostPath: `/ecs/${serviceName}-storage`,
    }],
    placementConstraints: [{
        type: "memberOf",
        //todo: place things in a single region and availability zone, to avoid data transfer costs.
        expression: "attribute:ecs.availability-zone in [us-west-2a]",
    }],
    executionRoleArn: aws.iam.Role.get("ecsTaskExecutionRole", "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy").arn,
    runtimePlatform: {
        cpuArchitecture: "ARM64"
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
    launchType: "EC2",
    name: serviceName,
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
