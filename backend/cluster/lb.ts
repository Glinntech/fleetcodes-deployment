import * as aws from "@pulumi/aws";
import { albSecurityGroup } from "./base";
import * as pulumi from "@pulumi/pulumi";
import { ipv6SubnetPublic1, ipv6SubnetPublic2 } from "./vpc";

// Create an Application Load Balancer
export const fleetMgmtLB = new aws.lb.LoadBalancer("fleet-mgmt-lb", {
    securityGroups: [albSecurityGroup.id],
    subnets: [ipv6SubnetPublic1.id, ipv6SubnetPublic2.id],
    enableCrossZoneLoadBalancing: false,
    ipAddressType: "dualstack-without-public-ipv4",
});
