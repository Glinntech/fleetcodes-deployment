import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import {SubnetType} from "@pulumi/awsx/ec2";
import {NatGatewayStrategy} from "@pulumi/awsx/types/enums/ec2";

export const fleetMgmtECSCluster = new aws.ecs.Cluster("fleet-mgmt");

// Create a VPC in a specific availability zone to minimize data transfer costs
export const fleetMgmtVpc = new awsx.ec2.Vpc("fleet-mgmt-vpc", {
    numberOfAvailabilityZones: 2,
    subnetSpecs: [{type: SubnetType.Public}],
    natGateways: {
        strategy: NatGatewayStrategy.None
    }
});


// Create a security group, web allow security group
export const securityGroup = new aws.ec2.SecurityGroup("fleet-mgmt-web-sg", {
    vpcId: fleetMgmtVpc.vpcId,
    description: "Allow HTTP traffic",
    ingress: [{
        protocol: "tcp",
        fromPort: 8080,
        toPort: 8080,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
});


// Define the task execution role
export const executionRole = new aws.iam.Role("ecs-execution-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({Service: "ecs-tasks.amazonaws.com"}),
});

// Attach the necessary policies to the execution role
new aws.iam.RolePolicyAttachment("ecs-execution-policy", {
    role: executionRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});


// Define the launch configuration
const launchConfiguration = new aws.ec2.LaunchTemplate("fleet-mgmt-launch-config", {
    imageId: "ami-0c55b159cbfafe1f0", // Replace with your desired AMI ID
    instanceType: "t3.micro",
    vpcSecurityGroupIds: [securityGroup.id], // Replace with your security group ID
});

// Create the Auto Scaling Group with mixed instances policy
const autoScalingGroup = new aws.autoscaling.Group("fleet-mgmt-asg", {
    vpcZoneIdentifiers: [fleetMgmtVpc.publicSubnetIds[0]], // Replace with your subnet IDs
    mixedInstancesPolicy: {
        launchTemplate: {
            launchTemplateSpecification: {
                launchTemplateId: launchConfiguration.id,
                version: "$Latest",
            },
            overrides: [
                {instanceType: "t3.micro"},
            ],
        },
        instancesDistribution: {
            onDemandBaseCapacity: 1,
            onDemandPercentageAboveBaseCapacity: 50,
            spotAllocationStrategy: "lowest-price",
        },
    },
    minSize: 1,
    maxSize: 2,
    desiredCapacity: 1,
    tags: [{
        key: "Name",
        value: "fleet-mgmt-ecs-instance",
        propagateAtLaunch: true,
    }],
});
// Create a Capacity Provider for Spot instances
const spotCapacityProvider = new aws.ecs.CapacityProvider("fleet-mgmt-asg-capacity-provider", {
    autoScalingGroupProvider: {
        autoScalingGroupArn: autoScalingGroup.arn,
        managedScaling: {
            status: "ENABLED",
            targetCapacity: 100,
        },
    },
});


// Attach the Capacity Providers to the ECS cluster
const asgAttachment = new aws.ecs.ClusterCapacityProviders("asgAttachment", {
    clusterName: fleetMgmtECSCluster.name,
    capacityProviders: [spotCapacityProvider.name],
    defaultCapacityProviderStrategies: [{
        capacityProvider: spotCapacityProvider.name,
        weight: 1,
    }],
});

