import * as aws from "@pulumi/aws";
import * as mongodbatlas from "@pulumi/mongodbatlas";
import { clusterOutput } from "../../cluster/base";

export const atlasIpList = clusterOutput.autoScalingGroup.apply((asg) => {
    const value = asg.name.apply(async (name) => {
        const publicIps = await getInstancePublicIps(name);
        const result =  publicIps.map((ip) => {
            return new mongodbatlas.ProjectIpAccessList(
                `access-list-FleetMgmtPriview`,
                {
                    projectId: "66b476565ad9b27d65a35a76",
                    ipAddress: ip,
                    comment: "IP address for ASG instance",
                },
            );
        });
        return result;
    });
    return value;
});

// Function to get public IP addresses of instances in an ASG
async function getInstancePublicIps(asgName: string): Promise<string[]> {
    const asg = await aws.autoscaling.getGroup({ name: asgName });
    const instances = await aws.ec2.getInstances({
        instanceTags: {
            "aws:autoscaling:groupName": asg.name,
        },
    });
    return instances.publicIps;
}
