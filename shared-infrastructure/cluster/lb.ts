import * as aws from "@pulumi/aws";
import { albSecurityGroup } from "./base";
import * as pulumi from "@pulumi/pulumi";
import { fleetMgmtVpc, publicSubnetIds } from "./vpc";
import { wildcardCertificate } from "../dns/route53";

// Create an Application Load Balancer
export const fleetMgmtLB = new aws.lb.LoadBalancer("fleet-mgmt-lb", {
    securityGroups: [albSecurityGroup.id],
    subnets: publicSubnetIds,
    enableCrossZoneLoadBalancing: false,
    ipAddressType: "ipv4",
});

// Create a shared HTTPS listener with a default 404 response
export const sharedHttpsListener = new aws.lb.Listener("shared-https-listener", {
    loadBalancerArn: fleetMgmtLB.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
    certificateArn: wildcardCertificate.then(cert => cert.arn),
    defaultActions: [{
        type: "fixed-response",
        fixedResponse: {
            contentType: "text/plain",
            messageBody: "Not Found - No matching host header",
            statusCode: "404",
        },
    }],
});
