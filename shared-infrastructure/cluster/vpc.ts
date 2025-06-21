import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { NatGatewayStrategy, SubnetAllocationStrategy, SubnetType } from "@pulumi/awsx/ec2";

// Create a VPC in a specific availability zone to minimize data transfer costs
export const fleetMgmtVpc = new awsx.ec2.Vpc("fleet-mgmt-vpc", {
    numberOfAvailabilityZones: 2,
    subnetStrategy: SubnetAllocationStrategy.Auto,
    subnetSpecs: [{ type: SubnetType.Public, cidrMask: 20 }],
    natGateways: {
        strategy: NatGatewayStrategy.None,
    },
    enableDnsHostnames: true,
    enableDnsSupport: true,
});

// Enable IPv6 for the VPC
const ipv6CidrBlock = new aws.ec2.VpcIpv6CidrBlockAssociation("fleet-mgmt-vpc-ipv6", {
    vpcId: fleetMgmtVpc.vpcId,
    assignGeneratedIpv6CidrBlock: true,
});

// Get availability zones for the current region
const availabilityZones = aws.getAvailabilityZones({ state: "available" });
const az1 = availabilityZones.then((zones) => zones.names[0]);
const az2 = availabilityZones.then((zones) => zones.names[1]);


// Export the public subnets for use by load balancer and other resources
export const publicSubnetIds = fleetMgmtVpc.publicSubnetIds;

// Create individual subnet references for explicit use
export const publicSubnet1 = fleetMgmtVpc.publicSubnetIds.apply(ids => ids[0]);
export const publicSubnet2 = fleetMgmtVpc.publicSubnetIds.apply(ids => ids[1]);