import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";

export const fleetMgmtPublicELB = new awsx.lb.ApplicationLoadBalancer("fleet-mgmt-pb-lb-1", {name: "fleet-mgmt-pb-lb-1",});
export const fleetMgmtECSCluster = new aws.ecs.Cluster("fleet-mgmt");


// Create a security group, web allow security group
const securityGroup = new aws.ec2.SecurityGroup("fleet-mgmt-web-sg", {
    description: "Allow HTTP traffic",
    ingress: [{
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
});


// Define the launch configuration
const launchConfiguration = new aws.ec2.LaunchConfiguration("fleetMgmtLaunchConfig", {
    imageId: "ami-0c55b159cbfafe1f0", // Replace with your desired AMI ID
    instanceType: "t2.micro",
    securityGroups: [securityGroup.id], // Replace with your security group ID
    iamInstanceProfile: "ecsInstanceRole", // Replace with your IAM instance profile
});

// Create the Auto Scaling Group with mixed instances policy
const autoScalingGroup = new aws.autoscaling.Group("fleetMgmtASG", {
    vpcZoneIdentifiers: ["subnet-12345678", "subnet-87654321"], // Replace with your subnet IDs
    mixedInstancesPolicy: {
        launchTemplate: {
            launchTemplateSpecification: {
                launchTemplateId: launchConfiguration.id,
                version: "$Latest",
            },
            overrides: [
                {instanceType: "t2.micro"},
                {instanceType: "t3.micro"},
            ],
        },
        instancesDistribution: {
            onDemandBaseCapacity: 1,
            onDemandPercentageAboveBaseCapacity: 50,
            spotAllocationStrategy: "lowest-price",
        },
    },
    minSize: 0,
    maxSize: 10,
    desiredCapacity: 0,
    tags: [{
        key: "Name",
        value: "fleet-mgmt-ecs-instance",
        propagateAtLaunch: true,
    }],
});

// Attach the ASG to the ECS cluster
const asgAttachment = new aws.ecs.ClusterCapacityProviders("asgAttachment", {
    clusterName: fleetMgmtECSCluster.name,
    capacityProviders: ["EC2", "SPOT"],
    defaultCapacityProviderStrategies: [{
        capacityProvider: "EC2",
        weight: 1,
    }, {
        capacityProvider: "SPOT",
        weight: 1,
    }],
});

// Create scaling policies
const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    adjustmentType: "ChangeInCapacity",
    autoScalingGroupName: autoScalingGroup.name,
    scalingAdjustment: 1,
});

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    adjustmentType: "ChangeInCapacity",
    autoScalingGroupName: autoScalingGroup.name,
    scalingAdjustment: -1,
});

export const asgName = autoScalingGroup.name;