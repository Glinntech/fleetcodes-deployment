import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import { SubnetType } from "@pulumi/awsx/ec2";
import { NatGatewayStrategy } from "@pulumi/awsx/types/enums/ec2";

const instanceType = "t4g.small";
export const fleetMgmtECSCluster = new aws.ecs.Cluster("fleet-mgmt", {
    name: "fleet-mgmt",
});

// Create a VPC in a specific availability zone to minimize data transfer costs
export const fleetMgmtVpc = new awsx.ec2.Vpc("fleet-mgmt-vpc", {
    numberOfAvailabilityZones: 2,
    subnetSpecs: [{ type: SubnetType.Public }],
    natGateways: {
        strategy: NatGatewayStrategy.None,
    },
});

// const ecsOptimizedAl2AmiId = aws.ec2.getAmi({
//     filters: [
//         { name: "name", values: ["amzn2-ami-ecs-hvm-*-x86_64-ebs"] },
//         { name: "owner-id", values: ["137112412989"] },
//     ],
//     mostRecent: true,
// }).then(ami => ami.id);
// arn:aws:imagebuilder:us-east-2:aws:image/amazon-linux-2-ecs-optimized-kernel-5-x86/2025.1.29

// Create a security group, web allow security group
export const albSecurityGroup = new aws.ec2.SecurityGroup(
    "fleet-mgmt-alb-web-sg",
    {
        vpcId: fleetMgmtVpc.vpcId,
        description: "Allow HTTP traffic",
        ingress: [{
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080,
            cidrBlocks: ["0.0.0.0/0"],
        }, {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            prefixListIds: ["pl-03915406641cb1f53"],
        }, {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
        }, {
            protocol: "tcp",
            fromPort: 413,
            toPort: 413,
            cidrBlocks: ["0.0.0.0/0"],
        }],
        egress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }],
    },
);

export const ecsInstanceSecurityGroup = new aws.ec2.SecurityGroup(
    "fleet-mgmt-asg-web-sg",
    {
        vpcId: fleetMgmtVpc.vpcId,
        description: "Allow HTTP traffic",
        ingress: [{
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            prefixListIds: ["pl-03915406641cb1f53"],
        }, {
            protocol: "tcp",
            fromPort: 49153,
            toPort: 65535,
            securityGroups: [albSecurityGroup.id],
        }, {
            protocol: "tcp",
            fromPort: 32768,
            toPort: 61000,
            securityGroups: [albSecurityGroup.id],
        }],
        egress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }],
    },
);

// Define the IAM role
const instanceRole = new aws.iam.Role("ecsInstanceRole", {
    name: "ecsInstanceRole",
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ec2.amazonaws.com",
    }),
});

// Attach the necessary policies to the role
new aws.iam.RolePolicyAttachment("instanceRolePolicyAttachment", {
    role: instanceRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerServiceforEC2Role,
});

// Create the instance profile
const instanceProfile = new aws.iam.InstanceProfile("instanceProfile", {
    name: "instanceProfile",
    role: instanceRole.name,
});
// const AMI_ID = "ami-0db23f5989fe7eb5e"; //AMAZON LINUX 2023 AMI
const AMI_ID = "ami-01b558732595557f2"; //arm instance amzn2-ami-ecs-kernel-5.10-hvm-2.0.20250129-arm64-ebs

// User data script to install EC2 Instance Connect
export const clusterOutput = fleetMgmtECSCluster.name.apply((clusterName) => {
    const userData = `#!/bin/bash
echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config;
yum update -y
yum install -y ec2-instance-connect
systemctl enable ec2-instance-connect
systemctl start ec2-instance-connect
`;

    // Define the launch configuration
    const launchConfiguration = new aws.ec2.LaunchTemplate(
        "fleet-mgmt-launch-config",
        {
            imageId: AMI_ID, // Replace with your desired AMI ID
            instanceType: instanceType,
            vpcSecurityGroupIds: [ecsInstanceSecurityGroup.id], // Replace with your security group ID
            iamInstanceProfile: {
                arn: instanceProfile.arn,
            },
            tagSpecifications: [{
                resourceType: "instance",
                tags: {
                    Name: "ecs-instance",
                },
            }],
            userData: Buffer.from(userData).toString("base64"),
            updateDefaultVersion: true,
        },
    );

    // Create the Auto Scaling Group with mixed instances policy
    const autoScalingGroup = new aws.autoscaling.Group("fleet-mgmt-asg", {
        vpcZoneIdentifiers: [fleetMgmtVpc.publicSubnetIds[0]], // Replace with your subnet IDs
        mixedInstancesPolicy: {
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: launchConfiguration.id,
                    version: launchConfiguration.latestVersion.apply((o) =>
                        o.toString()
                    ),
                },
                overrides: [
                    { instanceType: instanceType },
                ],
            },
            instancesDistribution: {
                onDemandBaseCapacity: 1,
                onDemandPercentageAboveBaseCapacity: 0,
                spotAllocationStrategy: "lowest-price",
            },
        },
        capacityRebalance: true,
        minSize: 0,
        maxSize: 1,
        desiredCapacity: 1,
        healthCheckGracePeriod: 10,
        healthCheckType: "EC2",
        tags: [{
            key: "Name",
            value: "fleet-mgmt-ecs-instance",
            propagateAtLaunch: true,
        }],
    });
    // Create a Capacity Provider for Spot instances
    const spotCapacityProvider = new aws.ecs.CapacityProvider(
        "fleet-mgmt-asg-capacity-provider",
        {
            autoScalingGroupProvider: {
                autoScalingGroupArn: autoScalingGroup.arn,
                managedScaling: {
                    status: "ENABLED",
                    targetCapacity: 100,
                },
            },
        },
    );

    // Attach the Capacity Providers to the ECS cluster
    const asgAttachment = new aws.ecs.ClusterCapacityProviders(
        "asgAttachment",
        {
            clusterName: fleetMgmtECSCluster.name,
            capacityProviders: [spotCapacityProvider.name],
            defaultCapacityProviderStrategies: [{
                capacityProvider: spotCapacityProvider.name,
                weight: 1,
            }],
        },
    );

    return { spotCapacityProvider, asgAttachment, autoScalingGroup };
});
