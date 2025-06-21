import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Create a new VPC
export const fleetMgmtVpc = new aws.ec2.Vpc("fleet-mgmt-vpc", {
    cidrBlock: "10.0.0.0/16",
    assignGeneratedIpv6CidrBlock: true,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
        Name: "fleet-mgmt-vpc",
    },
});

// Get availability zones for the current region
const availabilityZones = aws.getAvailabilityZones({ state: "available" });
const az1 = availabilityZones.then((zones) => zones.names[0]);
const az2 = availabilityZones.then((zones) => zones.names[1]);

fleetMgmtVpc.ipv6CidrBlock.apply((ipv6CidrBlock) => {
    console.log(`IPv6 CIDR Block: ${ipv6CidrBlock}`);
});
// Create a public subnet
export const ipv6SubnetPublic1 = new aws.ec2.Subnet(
    "fleet-mgmt-vpc-public-1-ipv6",
    {
        vpcId: fleetMgmtVpc.id,
        availabilityZone: az1,
        cidrBlock: "10.0.1.0/24", // Assign specific IPv4 CIDR
        ipv6CidrBlock: fleetMgmtVpc.ipv6CidrBlock.apply(cidr => {
            if (!cidr) return "2600:1f16:c4d:d201::/64";
            // VPC CIDR example: "2600:1f16:c4d:d200::/56"
            // We want: "2600:1f16:c4d:d201::/64"
            const match = cidr.match(/^([0-9a-f:]+)00::\/56$/);
            if (match) {
                return `${match[1]}01::/64`;
            }
            return "2600:1f16:c4d:d201::/64";
        }),
        assignIpv6AddressOnCreation: true,
        mapPublicIpOnLaunch: true,
        ipv6Native: false,
        tags: {
            Name: "fleet-mgmt-vpc-public-1",
        },
    },
);

export const ipv6SubnetPublic2 = new aws.ec2.Subnet(
    "fleet-mgmt-vpc-public-2-ipv6",
    {
        vpcId: fleetMgmtVpc.id,
        availabilityZone: az2,
        cidrBlock: "10.0.2.0/24", // Assign specific IPv4 CIDR
        ipv6CidrBlock: fleetMgmtVpc.ipv6CidrBlock.apply(cidr => {
            if (!cidr) return "2600:1f16:c4d:d202::/64";
            // VPC CIDR example: "2600:1f16:c4d:d200::/56"
            // We want: "2600:1f16:c4d:d202::/64"
            const match = cidr.match(/^([0-9a-f:]+)00::\/56$/);
            if (match) {
                return `${match[1]}02::/64`;
            }
            return "2600:1f16:c4d:d202::/64";
        }), // Assign specific IPv6 CIDR
        assignIpv6AddressOnCreation: true,
        mapPublicIpOnLaunch: true,
        ipv6Native: false,
        tags: {
            Name: "fleet-mgmt-vpc-public-2",
        },
    },
);

// --- Internet Gateway for Public Subnets ---
const igw = new aws.ec2.InternetGateway("fleet-mgmt-igw", {
    vpcId: fleetMgmtVpc.id,
    tags: { Name: "fleet-mgmt-igw" },
});

// --- Route Table for Public Subnets ---
const publicRouteTable = new aws.ec2.RouteTable("fleet-mgmt-public-rt", {
    vpcId: fleetMgmtVpc.id,
    routes: [
        // Route for IPv4 Internet access
        { cidrBlock: "0.0.0.0/0", gatewayId: igw.id },
        // Route for IPv6 Internet access
        { ipv6CidrBlock: "::/0", gatewayId: igw.id },
    ],
    tags: { Name: "fleet-mgmt-public-rt" },
});




// // Create a private subnet
// const privateSubnet = new aws.ec2.Subnet("private-subnet", {
//     vpcId: fleetMgmtVpc.id,
//     cidrBlock: "10.0.2.0/24",
// });

// // Create an Elastic IP for the NAT Gateway
// const eip = new aws.ec2.Eip("nat-eip", {
//     vpc: true,
// });

// // Create a NAT Gateway
// const natGateway = new aws.ec2.NatGateway("nat-gateway", {
//     subnetId: publicSubnet.id,
//     allocationId: eip.id,
// });

// --- Route Table Associations ---
export const rtAssocPublic1 = new aws.ec2.RouteTableAssociation("rtAssocPublic1", {
    subnetId: ipv6SubnetPublic1.id,
    routeTableId: publicRouteTable.id,
});

export const rtAssocPublic2 = new aws.ec2.RouteTableAssociation("rtAssocPublic2", {
    subnetId: ipv6SubnetPublic2.id,
    routeTableId: publicRouteTable.id,
});


// // Create a route table for the private subnet
// const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
//     vpcId: vpc.id,
//     routes: [
//         {
//             cidrBlock: "0.0.0.0/0",
//             natGatewayId: natGateway.id,
//         },
//     ],
// });

// // Associate the route table with the private subnet
// new aws.ec2.RouteTableAssociation("private-route-table-association", {
//     subnetId: privateSubnet.id,
//     routeTableId: privateRouteTable.id,
// });
