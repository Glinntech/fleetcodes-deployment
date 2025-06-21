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


// --- Internet Gateway for Public Subnets ---
const igw = new aws.ec2.InternetGateway("fleet-mgmt-igw", {
    vpcId: fleetMgmtVpc.vpcId,
    tags: { Name: "fleet-mgmt-igw" },
});

// --- Route Table for Public Subnets ---
const publicRouteTable = new aws.ec2.RouteTable("fleet-mgmt-public-rt", {
    vpcId: fleetMgmtVpc.vpcId,
    routes: [
        // Route for IPv4 Internet access
        { cidrBlock: "0.0.0.0/0", gatewayId: igw.id },
        // Route for IPv6 Internet access
        { ipv6CidrBlock: "::/0", gatewayId: igw.id },
    ],
    tags: { Name: "fleet-mgmt-public-rt" },
}, { dependsOn: [igw, ipv6CidrBlock] });


// Export the public subnets for use by load balancer and other resources
export const publicSubnetIds = fleetMgmtVpc.publicSubnetIds;

// Create individual subnet references for explicit use
export const publicSubnet1 = fleetMgmtVpc.publicSubnetIds.apply(ids => ids[0]);
export const publicSubnet2 = fleetMgmtVpc.publicSubnetIds.apply(ids => ids[1]);