import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";






export const url = pulumi.interpolate`http://${lb.loadBalancer.dnsName}`;