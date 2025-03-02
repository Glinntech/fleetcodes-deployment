import * as aws from "@pulumi/aws";
import {fleetMgmtVpc, albSecurityGroup} from "./base";
import * as pulumi from "@pulumi/pulumi";


// Create an Application Load Balancer
export const fleetMgmtLB = new aws.lb.LoadBalancer("fleet-mgmt-lb", {
    securityGroups: [albSecurityGroup.id],
    subnets: fleetMgmtVpc.publicSubnetIds,
    enableCrossZoneLoadBalancing: false
});
fleetMgmtVpc.vpc.cidrBlock.apply(cidr => pulumi.log.info(`${cidr}`).then(() => console.log("logged cidr")));
fleetMgmtVpc.publicSubnetIds.apply(subnets => pulumi.log.info(`${subnets}`).then(() => console.log("logged public subnets")));




